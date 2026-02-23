import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { logActivity } from '../services/activityLog.js';
import { buckets, checkAudioExists, getAudioUri, generatePlaybackUrl, promoteToTraining } from '../config/gcs.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin, requireEmployee } from '../middleware/rbac.js';
import { getVisitSequence, getPreviousAnalysis, getVisitChain } from '../services/visitSequencing.js';
import { analyzeAudio, runComparisonAnalysis } from '../services/vertexai.js';

const router = Router();

// Configure multer for memory storage (files stored in RAM temporarily)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB max
    }
});

// MIME type mappings
const mimeTypes = {
    'wav': 'audio/wav',
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'webm': 'audio/webm',
    'aac': 'audio/aac'
};

const ANALYTICS_PERIOD_DAYS = {
    weekly: 7,
    monthly: 30,
    quarterly: 90,
    'half-yearly': 182,
    yearly: 365
};

const REPORT_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REPORT_FALLBACK_SECRET = 'ticketintel-report-share-fallback';
const REPORT_PDF_PAGE_WIDTH = 612;
const REPORT_PDF_PAGE_HEIGHT = 792;
const REPORT_PDF_MARGIN = 42;
const REPORT_PDF_CONTENT_WIDTH = REPORT_PDF_PAGE_WIDTH - (REPORT_PDF_MARGIN * 2);
const REPORT_PDF_COLOR_BLACK = [0, 0, 0];
const REPORT_PDF_COLOR_CHARCOAL = [0.145, 0.145, 0.157];
const REPORT_PDF_COLOR_OFF_WHITE = [0.843, 0.843, 0.804];
const REPORT_PDF_COLOR_VIOLET = [0.549, 0.259, 0.784];
const REPORT_PDF_COLOR_DEEP_PURPLE = [0.361, 0.078, 0.588];

function escapePdfText(value) {
    return String(value ?? '')
        .replaceAll('\\', '\\\\')
        .replaceAll('(', '\\(')
        .replaceAll(')', '\\)')
        .replace(/[^\x20-\x7E]/g, ' ')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeReportText(value, fallback = 'N/A') {
    const normalized = escapePdfText(value);
    return normalized || fallback;
}

function wrapReportText(value, maxChars = 92, fallback = '-') {
    const normalized = escapePdfText(value);
    if (!normalized) return [fallback];

    const words = normalized.split(' ');
    const lines = [];
    let current = '';

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) {
            current = candidate;
            continue;
        }

        if (current) lines.push(current);

        if (word.length > maxChars) {
            for (let index = 0; index < word.length; index += maxChars) {
                const chunk = word.slice(index, index + maxChars);
                if (chunk.length === maxChars || index + maxChars < word.length) {
                    lines.push(chunk);
                } else {
                    current = chunk;
                }
            }
        } else {
            current = word;
        }
    }

    if (current) lines.push(current);
    return lines.length ? lines : [fallback];
}

function estimateCharsPerLine(width, fontSize = 10) {
    const safeWidth = Number.isFinite(width) ? width : 240;
    const safeFont = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 10;
    return Math.max(14, Math.floor(safeWidth / (safeFont * 0.53)));
}

function toPdfNumber(value) {
    const normalized = Number.isFinite(value) ? value : 0;
    const stripped = normalized.toFixed(3).replace(/\.?0+$/, '');
    return stripped || '0';
}

function toPdfColor(color) {
    if (!Array.isArray(color) || color.length !== 3) {
        return '0 0 0';
    }
    return color
        .map((value) => {
            const normalized = Math.min(1, Math.max(0, Number(value) || 0));
            return toPdfNumber(normalized);
        })
        .join(' ');
}

function buildPdfFromPageStreams(pageStreams, pageWidth = REPORT_PDF_PAGE_WIDTH, pageHeight = REPORT_PDF_PAGE_HEIGHT) {
    const streams = Array.isArray(pageStreams) && pageStreams.length > 0
        ? pageStreams
        : [['BT /F1 10 Tf 0 0 0 rg 1 0 0 1 42 740 Tm (No report data available.) Tj ET']];

    const pageCount = streams.length;
    const fontRegularObjectNum = 3 + pageCount * 2;
    const fontBoldObjectNum = fontRegularObjectNum + 1;
    const fontItalicObjectNum = fontRegularObjectNum + 2;
    const objectCount = fontItalicObjectNum;
    const objectMap = new Map();

    objectMap.set(1, '<< /Type /Catalog /Pages 2 0 R >>');

    const pageRefs = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const pageObjNum = 3 + pageIndex * 2;
        pageRefs.push(`${pageObjNum} 0 R`);
    }
    objectMap.set(2, `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageCount} >>`);

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const pageObjNum = 3 + pageIndex * 2;
        const contentObjNum = pageObjNum + 1;
        const contentStream = `${streams[pageIndex].join('\n')}\n`;

        objectMap.set(
            pageObjNum,
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${toPdfNumber(pageWidth)} ${toPdfNumber(pageHeight)}] /Resources << /Font << /F1 ${fontRegularObjectNum} 0 R /F2 ${fontBoldObjectNum} 0 R /F3 ${fontItalicObjectNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>`
        );
        objectMap.set(contentObjNum, `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}endstream`);
    }

    objectMap.set(fontRegularObjectNum, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    objectMap.set(fontBoldObjectNum, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    objectMap.set(fontItalicObjectNum, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>');

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (let objNum = 1; objNum <= objectCount; objNum += 1) {
        offsets[objNum] = Buffer.byteLength(pdf, 'utf8');
        const body = objectMap.get(objNum);
        pdf += `${objNum} 0 obj\n${body}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objectCount + 1}\n`;
    pdf += '0000000000 65535 f \n';

    for (let objNum = 1; objNum <= objectCount; objNum += 1) {
        pdf += `${String(offsets[objNum]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
}

function formatReportVisitType(value) {
    return String(value || 'unknown')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatReportExcuseReason(reason) {
    const labels = {
        client_unavailable: 'Client unavailable',
        technical_issues: 'Technical issues',
        travel_delay: 'Travel delay',
        meeting_rescheduled: 'Meeting rescheduled',
        emergency: 'Emergency',
        other: 'Other'
    };
    return labels[reason] || String(reason || 'Other').replaceAll('_', ' ');
}

function formatReportDate(value) {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return 'N/A';
    return parsed.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function formatReportDuration(secondsValue) {
    const numeric = Number(secondsValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return 'N/A';
    const minutes = Math.floor(numeric / 60);
    const seconds = Math.floor(numeric % 60);
    return `${minutes} min ${seconds} sec`;
}

function buildStyledTicketReportPdf({ ticket, analysis, actionItems, excuses }) {
    const pages = [[]];
    let pageIndex = 0;
    let cursorY = REPORT_PDF_PAGE_HEIGHT - REPORT_PDF_MARGIN;

    const pushCommand = (command) => {
        pages[pageIndex].push(command);
    };

    const addPage = () => {
        pages.push([]);
        pageIndex += 1;
        cursorY = REPORT_PDF_PAGE_HEIGHT - REPORT_PDF_MARGIN;
    };

    const ensureSpace = (requiredHeight = 24) => {
        if ((cursorY - requiredHeight) < (REPORT_PDF_MARGIN + 20)) {
            addPage();
        }
    };

    const drawText = (text, x, y, options = {}) => {
        const safeText = escapePdfText(text);
        if (!safeText) return;

        const font = options.font || 'F1';
        const size = Number.isFinite(options.size) ? options.size : 10;
        const color = options.color || REPORT_PDF_COLOR_CHARCOAL;

        pushCommand(
            `BT /${font} ${toPdfNumber(size)} Tf ${toPdfColor(color)} rg 1 0 0 1 ${toPdfNumber(x)} ${toPdfNumber(y)} Tm (${safeText}) Tj ET`
        );
    };

    const drawLine = (x1, y1, x2, y2, options = {}) => {
        const stroke = options.stroke || REPORT_PDF_COLOR_VIOLET;
        const lineWidth = Number.isFinite(options.lineWidth) ? options.lineWidth : 1;
        pushCommand(`${toPdfNumber(lineWidth)} w`);
        pushCommand(`${toPdfColor(stroke)} RG`);
        pushCommand(`${toPdfNumber(x1)} ${toPdfNumber(y1)} m ${toPdfNumber(x2)} ${toPdfNumber(y2)} l S`);
    };

    const drawFilledRect = (x, topY, width, height, fillColor) => {
        const bottomY = topY - height;
        pushCommand(`${toPdfColor(fillColor)} rg`);
        pushCommand(`${toPdfNumber(x)} ${toPdfNumber(bottomY)} ${toPdfNumber(width)} ${toPdfNumber(height)} re f`);
    };

    const addSectionHeading = (title, subtitle = '') => {
        const needed = subtitle ? 42 : 30;
        ensureSpace(needed);

        drawText(title, REPORT_PDF_MARGIN, cursorY, {
            font: 'F2',
            size: 14,
            color: REPORT_PDF_COLOR_BLACK
        });

        const dividerY = subtitle ? (cursorY - 18) : (cursorY - 8);
        if (subtitle) {
            drawText(subtitle, REPORT_PDF_MARGIN, cursorY - 14, {
                font: 'F3',
                size: 9,
                color: REPORT_PDF_COLOR_VIOLET
            });
        }

        drawLine(REPORT_PDF_MARGIN, dividerY, REPORT_PDF_MARGIN + REPORT_PDF_CONTENT_WIDTH, dividerY, {
            stroke: REPORT_PDF_COLOR_VIOLET,
            lineWidth: 0.8
        });

        cursorY = dividerY - 12;
    };

    const addSubheading = (title) => {
        ensureSpace(18);
        drawText(title, REPORT_PDF_MARGIN, cursorY, {
            font: 'F2',
            size: 11,
            color: REPORT_PDF_COLOR_DEEP_PURPLE
        });
        cursorY -= 14;
    };

    const addKeyValueRows = (rows) => {
        const labelWidth = 122;
        const valueX = REPORT_PDF_MARGIN + labelWidth;
        const valueWidth = REPORT_PDF_CONTENT_WIDTH - labelWidth;
        const lineHeight = 13.5;

        rows.forEach((row) => {
            const label = normalizeReportText(row.label, 'Label');
            const value = normalizeReportText(row.value, 'N/A');
            const lines = wrapReportText(value, estimateCharsPerLine(valueWidth, 10), 'N/A');
            const blockHeight = Math.max(lineHeight, lines.length * lineHeight);

            ensureSpace(blockHeight + 8);
            drawText(`${label}:`, REPORT_PDF_MARGIN, cursorY, {
                font: 'F2',
                size: 10,
                color: REPORT_PDF_COLOR_DEEP_PURPLE
            });

            lines.forEach((line, lineIndex) => {
                drawText(line, valueX, cursorY - (lineIndex * lineHeight), {
                    font: 'F1',
                    size: 10,
                    color: REPORT_PDF_COLOR_CHARCOAL
                });
            });

            cursorY -= blockHeight + 6;
        });
    };

    const addParagraph = (value, options = {}) => {
        const indent = Number.isFinite(options.indent) ? options.indent : 0;
        const font = options.font || 'F1';
        const size = Number.isFinite(options.size) ? options.size : 10;
        const color = options.color || REPORT_PDF_COLOR_CHARCOAL;
        const fallback = options.fallback || '-';
        const lineHeight = Number.isFinite(options.lineHeight) ? options.lineHeight : (size * 1.35);
        const bottomGap = Number.isFinite(options.bottomGap) ? options.bottomGap : 8;
        const width = Math.max(120, REPORT_PDF_CONTENT_WIDTH - indent);
        const lines = wrapReportText(value, estimateCharsPerLine(width, size), fallback);

        ensureSpace((lines.length * lineHeight) + bottomGap);
        lines.forEach((line, lineIndex) => {
            drawText(line, REPORT_PDF_MARGIN + indent, cursorY - (lineIndex * lineHeight), {
                font,
                size,
                color
            });
        });
        cursorY -= (lines.length * lineHeight) + bottomGap;
    };

    const addListItem = (marker, value, options = {}) => {
        const indent = Number.isFinite(options.indent) ? options.indent : 0;
        const markerWidth = Number.isFinite(options.markerWidth) ? options.markerWidth : 22;
        const size = Number.isFinite(options.size) ? options.size : 10;
        const lineHeight = Number.isFinite(options.lineHeight) ? options.lineHeight : (size * 1.35);
        const bottomGap = Number.isFinite(options.bottomGap) ? options.bottomGap : 6;
        const textWidth = Math.max(100, REPORT_PDF_CONTENT_WIDTH - indent - markerWidth);
        const lines = wrapReportText(value, estimateCharsPerLine(textWidth, size), '-');
        const x = REPORT_PDF_MARGIN + indent;
        const textX = x + markerWidth;

        ensureSpace((lines.length * lineHeight) + bottomGap);
        drawText(marker, x, cursorY, {
            font: 'F2',
            size,
            color: options.markerColor || REPORT_PDF_COLOR_VIOLET
        });

        lines.forEach((line, lineIndex) => {
            drawText(line, textX, cursorY - (lineIndex * lineHeight), {
                font: options.font || 'F1',
                size,
                color: options.color || REPORT_PDF_COLOR_CHARCOAL
            });
        });

        cursorY -= (lines.length * lineHeight) + bottomGap;
    };

    const safeTicketId = normalizeReportText(ticket?.id, 'N/A');
    const displayId = normalizeReportText(String(ticket?.id || '').slice(0, 4).toUpperCase(), 'N/A');
    const generatedAt = formatReportDate(new Date().toISOString());

    ensureSpace(96);
    drawFilledRect(REPORT_PDF_MARGIN, cursorY, REPORT_PDF_CONTENT_WIDTH, 84, REPORT_PDF_COLOR_DEEP_PURPLE);
    drawText('TicketIntel Detailed Report', REPORT_PDF_MARGIN + 16, cursorY - 28, {
        font: 'F2',
        size: 19,
        color: REPORT_PDF_COLOR_OFF_WHITE
    });
    drawText(`Display ID: #${displayId}`, REPORT_PDF_MARGIN + 16, cursorY - 48, {
        size: 10,
        color: REPORT_PDF_COLOR_OFF_WHITE
    });
    drawText(`Generated: ${generatedAt}`, REPORT_PDF_MARGIN + 16, cursorY - 62, {
        size: 10,
        color: REPORT_PDF_COLOR_OFF_WHITE
    });
    drawText(`Ticket ID: ${safeTicketId}`, REPORT_PDF_MARGIN + (REPORT_PDF_CONTENT_WIDTH / 2), cursorY - 48, {
        size: 10,
        color: REPORT_PDF_COLOR_OFF_WHITE
    });
    drawText(`Status: ${formatStatusLabel(ticket?.status)}`, REPORT_PDF_MARGIN + (REPORT_PDF_CONTENT_WIDTH / 2), cursorY - 62, {
        size: 10,
        color: REPORT_PDF_COLOR_OFF_WHITE
    });
    cursorY -= 98;

    addSectionHeading('Ticket Overview');
    addKeyValueRows([
        { label: 'Client Name', value: ticket?.clientname || ticket?.client_name || 'Unknown' },
        { label: 'Client ID', value: ticket?.client_id || 'N/A' },
        { label: 'Visit Type', value: formatReportVisitType(ticket?.visittype || ticket?.visit_type) },
        { label: 'Visit Number', value: ticket?.visitnumber || ticket?.visit_number || 1 },
        { label: 'Status', value: formatStatusLabel(ticket?.status) },
        { label: 'Created At', value: formatReportDate(ticket?.createdat || ticket?.created_at) },
        { label: 'Duration', value: formatReportDuration(ticket?.durationseconds) }
    ]);

    addSectionHeading('Analysis Summary');
    addKeyValueRows([
        { label: 'Overall Rating (0-10)', value: analysis?.rating ?? 'N/A' },
        { label: 'Training Call', value: (ticket?.istrainingcall || ticket?.is_training_call) ? 'Yes' : 'No' }
    ]);

    addSubheading('Summary');
    addParagraph(
        analysis?.summary || 'Analysis is not available yet for this ticket.',
        { bottomGap: 10, fallback: 'Analysis is not available yet for this ticket.' }
    );

    const scores = analysis?.scores && typeof analysis.scores === 'object' ? analysis.scores : {};
    const scoreEntries = Object.entries(scores)
        .filter(([, raw]) => raw !== null && raw !== undefined && String(raw).trim() !== '')
        .slice(0, 12);

    addSubheading('Score Highlights');
    if (scoreEntries.length === 0) {
        addParagraph('No score metrics available for this ticket.', {
            size: 9.5,
            color: REPORT_PDF_COLOR_CHARCOAL
        });
    } else {
        scoreEntries.forEach(([key, raw]) => {
            addListItem('-', `${formatMetricLabel(key)}: ${normalizeReportText(raw, 'N/A')}`, {
                markerWidth: 14,
                bottomGap: 4
            });
        });
    }

    addSectionHeading('Key Moments');
    const keyMoments = Array.isArray(analysis?.keymoments) ? analysis.keymoments : [];
    if (keyMoments.length === 0) {
        addParagraph('No key moments captured for this ticket.');
    } else {
        keyMoments.slice(0, 15).forEach((moment, index) => {
            const time = normalizeReportText(moment?.time || moment?.timestamp, '00:00');
            const sentiment = normalizeReportText(moment?.sentiment, 'neutral').toLowerCase();
            const label = normalizeReportText(moment?.label, 'Moment');
            addListItem(`${index + 1}.`, `[${time}] ${label} (${sentiment})`, { bottomGap: 4 });

            if (moment?.description) {
                addParagraph(moment.description, {
                    indent: 24,
                    size: 9.5,
                    color: REPORT_PDF_COLOR_CHARCOAL,
                    bottomGap: 6
                });
            }
        });
    }

    addSectionHeading('Suggestions And Action Items');
    addSubheading('AI Suggestions');
    const suggestions = Array.isArray(analysis?.improvementsuggestions)
        ? analysis.improvementsuggestions
        : [];

    if (suggestions.length === 0) {
        addParagraph('No AI suggestions available for this ticket.', {
            size: 9.5,
            color: REPORT_PDF_COLOR_CHARCOAL
        });
    } else {
        suggestions.slice(0, 15).forEach((suggestion, index) => {
            addListItem(`${index + 1}.`, normalizeReportText(suggestion, 'No suggestion text provided.'), {
                bottomGap: 5
            });
        });
    }

    addSubheading('Tracked Action Items');
    if (!Array.isArray(actionItems) || actionItems.length === 0) {
        addParagraph('No tracked action items for this ticket.', {
            size: 9.5,
            color: REPORT_PDF_COLOR_CHARCOAL
        });
    } else {
        actionItems.slice(0, 20).forEach((item, index) => {
            const status = item?.completed ? 'Completed' : 'Pending';
            addListItem(
                `${index + 1}.`,
                `${normalizeReportText(item?.title, 'Untitled')} [${status}]`,
                { bottomGap: 4 }
            );

            if (item?.description) {
                addParagraph(item.description, {
                    indent: 24,
                    size: 9.5,
                    bottomGap: 4,
                    color: REPORT_PDF_COLOR_CHARCOAL
                });
            }

            if (item?.due_date) {
                addParagraph(`Due: ${formatReportDate(item.due_date)}`, {
                    indent: 24,
                    size: 9.2,
                    bottomGap: 5,
                    color: REPORT_PDF_COLOR_CHARCOAL
                });
            }
        });
    }

    addSectionHeading('Excuse Queue Timeline');
    if (!Array.isArray(excuses) || excuses.length === 0) {
        addParagraph('No excuse requests for this ticket.');
    } else {
        excuses.slice(0, 20).forEach((excuse, index) => {
            const reason = formatReportExcuseReason(excuse?.reason);
            const status = normalizeReportText(excuse?.status, 'pending').toLowerCase();
            addListItem(`${index + 1}.`, `${reason} [${status}]`, { bottomGap: 4 });

            addParagraph(`Submitted: ${formatReportDate(excuse?.submitted_at || excuse?.submittedat)}`, {
                indent: 24,
                size: 9.2,
                bottomGap: 4,
                color: REPORT_PDF_COLOR_CHARCOAL
            });

            if (excuse?.reason_details || excuse?.reasondetails) {
                addParagraph(excuse.reason_details || excuse.reasondetails, {
                    indent: 24,
                    size: 9.4,
                    bottomGap: 4,
                    color: REPORT_PDF_COLOR_CHARCOAL
                });
            }

            if (excuse?.admin_notes || excuse?.adminnotes) {
                addParagraph(`Admin Notes: ${excuse.admin_notes || excuse.adminnotes}`, {
                    indent: 24,
                    size: 9.4,
                    bottomGap: 6,
                    color: REPORT_PDF_COLOR_VIOLET
                });
            }
        });
    }

    ensureSpace(24);
    drawLine(
        REPORT_PDF_MARGIN,
        cursorY - 4,
        REPORT_PDF_MARGIN + REPORT_PDF_CONTENT_WIDTH,
        cursorY - 4,
        { stroke: REPORT_PDF_COLOR_VIOLET, lineWidth: 0.8 }
    );
    drawText('End of report', REPORT_PDF_MARGIN, cursorY - 16, {
        font: 'F3',
        size: 9,
        color: REPORT_PDF_COLOR_DEEP_PURPLE
    });

    const totalPages = pages.length;
    const footerLineY = REPORT_PDF_MARGIN - 6;
    const footerTextY = REPORT_PDF_MARGIN - 18;

    for (let index = 0; index < totalPages; index += 1) {
        const footerText = `Ticket ${safeTicketId} - Page ${index + 1} of ${totalPages}`;
        pages[index].push(`${toPdfNumber(0.6)} w`);
        pages[index].push(`${toPdfColor(REPORT_PDF_COLOR_VIOLET)} RG`);
        pages[index].push(`${toPdfNumber(REPORT_PDF_MARGIN)} ${toPdfNumber(footerLineY)} m ${toPdfNumber(REPORT_PDF_MARGIN + REPORT_PDF_CONTENT_WIDTH)} ${toPdfNumber(footerLineY)} l S`);
        pages[index].push(`BT /F1 9 Tf ${toPdfColor(REPORT_PDF_COLOR_CHARCOAL)} rg 1 0 0 1 ${toPdfNumber(REPORT_PDF_MARGIN)} ${toPdfNumber(footerTextY)} Tm (${escapePdfText(footerText)}) Tj ET`);
    }

    return buildPdfFromPageStreams(pages);
}

function toBase64Url(value) {
    return Buffer.from(String(value), 'utf8').toString('base64url');
}

function fromBase64Url(value) {
    return Buffer.from(String(value), 'base64url').toString('utf8');
}

function getReportShareSecret() {
    return process.env.REPORT_SHARE_SECRET
        || process.env.JWT_SECRET
        || process.env.SUPABASE_SERVICE_KEY
        || REPORT_FALLBACK_SECRET;
}

function createReportShareToken(ticketId, expiresAtMs) {
    const ticketPart = toBase64Url(ticketId);
    const expiryPart = String(Math.floor(expiresAtMs / 1000));
    const payload = `${ticketPart}.${expiryPart}`;
    const signature = crypto
        .createHmac('sha256', getReportShareSecret())
        .update(payload)
        .digest('base64url');

    return `${payload}.${signature}`;
}

function verifyReportShareToken(token) {
    if (!token || typeof token !== 'string') return null;

    const [ticketPart, expiryPart, signature] = token.split('.');
    if (!ticketPart || !expiryPart || !signature) return null;
    if (!/^\d+$/.test(expiryPart)) return null;

    const payload = `${ticketPart}.${expiryPart}`;
    const expectedSignature = crypto
        .createHmac('sha256', getReportShareSecret())
        .update(payload)
        .digest('base64url');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
        signatureBuffer.length !== expectedBuffer.length
        || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
        return null;
    }

    const expiresAtMs = Number(expiryPart) * 1000;
    if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
        return null;
    }

    let ticketId = '';
    try {
        ticketId = fromBase64Url(ticketPart);
    } catch {
        return null;
    }

    if (!ticketId) return null;
    return { ticketId, expiresAtMs };
}

async function fetchTicketReportContext(ticketId) {
    const { data: ticket, error: ticketError } = await supabaseAdmin
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

    if (ticketError || !ticket) {
        return null;
    }

    const [{ data: analysis }, { data: actionItems }, { data: excuseRows }] = await Promise.all([
        supabaseAdmin
            .from('analysisresults')
            .select('*')
            .eq('ticketid', ticketId)
            .maybeSingle(),
        supabaseAdmin
            .from('actionitems')
            .select('id, title, description, completed, duedate')
            .eq('ticketid', ticketId)
            .order('createdat', { ascending: false }),
        supabaseAdmin
            .from('employeeexcuses')
            .select('id, reason, reasondetails, status, submittedat, adminnotes')
            .eq('ticketid', ticketId)
            .order('submittedat', { ascending: false })
    ]);

    const normalizedActionItems = (actionItems || []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        completed: item.completed,
        due_date: item.duedate
    }));

    const normalizedExcuses = (excuseRows || []).map((row) => ({
        id: row.id,
        reason: row.reason,
        reason_details: row.reasondetails,
        status: row.status,
        submitted_at: row.submittedat,
        admin_notes: row.adminnotes
    }));

    return {
        ticket,
        analysis: analysis || null,
        actionItems: normalizedActionItems,
        excuses: normalizedExcuses
    };
}

function sendTicketReportPdf(res, ticketId, reportContext, asAttachment = true) {
    const pdfBuffer = buildStyledTicketReportPdf(reportContext);
    const filename = `ticket-report-${String(ticketId).slice(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader(
        'Content-Disposition',
        `${asAttachment ? 'attachment' : 'inline'}; filename="${filename}"`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdfBuffer);
}

function getRequestOrigin(req) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = typeof forwardedProto === 'string'
        ? forwardedProto.split(',')[0].trim()
        : req.protocol;
    return `${protocol}://${req.get('host')}`;
}

function safePercent(part, whole) {
    if (!whole || whole <= 0) return 0;
    return Math.round((part / whole) * 1000) / 10;
}

function roundTo(value, digits = 2) {
    const multiplier = 10 ** digits;
    return Math.round(value * multiplier) / multiplier;
}

function formatStatusLabel(status) {
    return String(status || 'unknown')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatVisitTypeLabel(type) {
    return String(type || 'unknown')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function formatMetricLabel(key) {
    return key
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeSearchTerm(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function getTicketSearchRank(ticket, searchTerm) {
    if (!searchTerm) return 99;

    const clientId = normalizeSearchTerm(ticket?.client_id);
    const clientName = normalizeSearchTerm(ticket?.clientname);
    const visitType = normalizeSearchTerm(String(ticket?.visittype || '').replaceAll('_', ' '));
    const ticketId = normalizeSearchTerm(ticket?.id);
    const visitNumber = normalizeSearchTerm(ticket?.visitnumber);

    if (clientId && clientId === searchTerm) return 0;
    if (clientId && clientId.startsWith(searchTerm)) return 1;
    if (clientId && clientId.includes(searchTerm)) return 2;

    if (clientName && clientName === searchTerm) return 3;
    if (clientName && clientName.startsWith(searchTerm)) return 4;
    if (clientName && clientName.includes(searchTerm)) return 5;

    if (visitType && visitType.includes(searchTerm)) return 6;
    if (visitNumber && visitNumber === searchTerm) return 7;
    if (ticketId && ticketId.includes(searchTerm)) return 8;

    return 99;
}

function extractNumericScores(analysisRow) {
    const result = {};
    const scores = analysisRow?.scores && typeof analysisRow.scores === 'object'
        ? analysisRow.scores
        : {};

    for (const [key, raw] of Object.entries(scores)) {
        const n = toNumber(raw);
        if (n !== null) result[key] = n;
    }

    const fallbackPairs = [
        ['politeness', analysisRow?.politeness_score],
        ['confidence', analysisRow?.confidence_score],
        ['speakers', analysisRow?.speakers_detected]
    ];

    for (const [key, raw] of fallbackPairs) {
        if (result[key] !== undefined) continue;
        const n = toNumber(raw);
        if (n !== null) result[key] = n;
    }

    return result;
}

function buildComparison(currentAnalysis, previousAnalysis) {
    if (!currentAnalysis) return null;

    const currentScores = extractNumericScores(currentAnalysis);
    const previousScores = extractNumericScores(previousAnalysis);

    const preferredOrder = [
        'politeness',
        'confidence',
        'interest',
        'rapport_building',
        'needs_discovery',
        'objection_handling',
        'closing_techniques',
        'product_knowledge',
        'professionalism'
    ];

    const allKeysSet = new Set([
        ...Object.keys(currentScores),
        ...Object.keys(previousScores)
    ]);

    const orderedKeys = [
        ...preferredOrder.filter((k) => allKeysSet.has(k)),
        ...[...allKeysSet].filter((k) => !preferredOrder.includes(k)).sort()
    ].slice(0, 6);

    if (orderedKeys.length === 0) return null;

    return {
        keys: orderedKeys,
        labels: orderedKeys.map(formatMetricLabel),
        current: orderedKeys.map((k) => currentScores[k] ?? 0),
        previous: orderedKeys.map((k) => previousScores[k] ?? 0),
        delta_score: currentAnalysis.comparisonwithprevious?.delta_score ?? null
    };
}

function extractGcsObjectPath(ticket) {
    if (!ticket) return null;

    const rawPath = ticket.gcs_path || ticket.gcspath || null;
    if (!rawPath || typeof rawPath !== 'string') return null;

    if (rawPath.startsWith('gs://')) {
        const parts = rawPath.replace('gs://', '').split('/');
        if (parts.length < 2) return null;
        parts.shift(); // remove bucket name
        return parts.join('/');
    }

    return rawPath;
}

function isMissingGcsCredentialsError(error) {
    const message = String(error?.message || '');
    return (
        message.includes('Could not load the default credentials')
        || message.includes('Unable to detect a Project Id')
        || message.includes('Could not refresh access token')
    );
}

async function generateTicketAudioUrl(ticketId, ticket = null) {
    try {
        const objectPath = extractGcsObjectPath(ticket);

        if (objectPath) {
            const [exists] = await buckets.uploads.file(objectPath).exists();
            if (exists) {
                return await generatePlaybackUrl('uploads', objectPath);
            }
        }

        const { exists, extension } = await checkAudioExists(ticketId);
        if (!exists || !extension) return null;

        return await generatePlaybackUrl('uploads', `${ticketId}.${extension}`);
    } catch (error) {
        if (isMissingGcsCredentialsError(error)) {
            console.warn('Skipping audio URL generation because GCS credentials are not configured.');
            return null;
        }
        throw error;
    }
}

async function deleteObjectQuietly(bucket, path) {
    if (!path) return null;
    try {
        await bucket.file(path).delete({ ignoreNotFound: true });
        return null;
    } catch (error) {
        return `${bucket.name}/${path}: ${error.message || 'delete failed'}`;
    }
}

async function cleanupTicketAudioAssets(ticket) {
    const warnings = [];
    const ticketId = ticket?.id || null;
    const objectPath = extractGcsObjectPath(ticket);

    if (objectPath) {
        const uploadPathWarning = await deleteObjectQuietly(buckets.uploads, objectPath);
        if (uploadPathWarning) warnings.push(uploadPathWarning);

        const trainingPathWarning = await deleteObjectQuietly(buckets.training, objectPath);
        if (trainingPathWarning) warnings.push(trainingPathWarning);
    }

    if (ticketId) {
        let exists = false;
        let extension = null;
        try {
            const lookup = await checkAudioExists(ticketId);
            exists = Boolean(lookup?.exists);
            extension = lookup?.extension || null;
        } catch (error) {
            if (isMissingGcsCredentialsError(error)) {
                warnings.push('Skipped GCS asset cleanup: credentials are not configured in local environment.');
                return warnings;
            }
            throw error;
        }

        if (exists && extension) {
            const fallbackPath = `${ticketId}.${extension}`;

            const uploadFallbackWarning = await deleteObjectQuietly(buckets.uploads, fallbackPath);
            if (uploadFallbackWarning) warnings.push(uploadFallbackWarning);

            const trainingFallbackWarning = await deleteObjectQuietly(buckets.training, fallbackPath);
            if (trainingFallbackWarning) warnings.push(trainingFallbackWarning);
        }
    }

    return warnings;
}

// ============================================
// EMPLOYEE ROUTES (Upload Only)
// ============================================

/**
 * POST /tickets/upload
 * Upload audio file directly (bypasses signed URLs)
 * Role: employee, admin
 */
router.post('/upload', authMiddleware, requireEmployee, upload.single('audio'), async (req, res) => {
    try {
        const { client_id, client_name, visit_type, ticket_id } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                error: 'Audio file is required'
            });
        }

        const now = new Date().toISOString();
        const requestedTicketId = typeof ticket_id === 'string' ? ticket_id.trim() : '';
        const isDraftUpload = Boolean(requestedTicketId);
        const ticketId = isDraftUpload ? requestedTicketId : uuidv4();
        const extension = file.originalname.split('.').pop()?.toLowerCase() || 'mp3';
        const gcsPath = `${ticketId}.${extension}`;
        const contentType = mimeTypes[extension] || 'audio/mpeg';

        let ticket = null;
        let visitNumber = 1;
        let previousTicketId = null;
        let resolvedClientId = client_id?.trim() || null;
        let resolvedClientName = client_name?.trim() || null;
        let resolvedVisitType = visit_type || 'site_visit';

        if (isDraftUpload) {
            const { data: draftTicket, error: draftError } = await supabaseAdmin
                .from('tickets')
                .select('*')
                .eq('id', ticketId)
                .single();

            if (draftError || !draftTicket) {
                return res.status(404).json({ error: 'Draft ticket not found' });
            }

            const draftOwnerId = draftTicket.created_by || draftTicket.createdby;
            if (req.user.role === 'employee' && draftOwnerId !== req.user.id) {
                return res.status(403).json({ error: 'Not authorized to upload for this draft' });
            }

            if (!['draft', 'pending', 'uploading'].includes(draftTicket.status)) {
                return res.status(400).json({
                    error: `Ticket is not uploadable. Current status: ${draftTicket.status}`
                });
            }

            resolvedClientName = draftTicket.client_name || draftTicket.clientname || resolvedClientName;
            resolvedClientId = draftTicket.client_id || resolvedClientId || resolvedClientName || `draft-${ticketId.slice(0, 8)}`;
            resolvedVisitType = draftTicket.visit_type || draftTicket.visittype || resolvedVisitType;
            visitNumber = draftTicket.visit_number || draftTicket.visitnumber || 1;
            previousTicketId = draftTicket.previous_visit_ticket_id || draftTicket.previousvisitticketid || null;

            const { error: draftUpdateError } = await supabaseAdmin
                .from('tickets')
                .update({
                    status: 'uploading',
                    client_id: resolvedClientId,
                    clientname: resolvedClientName,
                    visittype: resolvedVisitType,
                    uploadstartedat: now,
                    gcspath: `gs://${buckets.uploads.name}/${gcsPath}`
                })
                .eq('id', ticketId);

            if (draftUpdateError) {
                console.error('Draft update error:', draftUpdateError);
                return res.status(500).json({
                    error: 'Failed to prepare draft upload',
                    details: draftUpdateError.message
                });
            }

            ticket = {
                ...draftTicket,
                id: ticketId,
                client_id: resolvedClientId,
                client_name: resolvedClientName,
                visit_number: visitNumber,
                previous_visit_ticket_id: previousTicketId
            };
        } else {
            if (!resolvedClientId) {
                return res.status(400).json({
                    error: 'client_id and audio file are required for direct uploads'
                });
            }

            // Get visit sequence using client_id
            const visitSequence = await getVisitSequence(resolvedClientId);
            visitNumber = visitSequence.visitNumber;
            previousTicketId = visitSequence.previousTicketId;

            // Create ticket in database (use actual column names from schema)
            const { data: createdTicket, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .insert({
                    id: ticketId,
                    client_id: resolvedClientId,
                    clientname: resolvedClientName,
                    visittype: resolvedVisitType,
                    visitnumber: visitNumber,
                    previousvisitticketid: previousTicketId,
                    createdby: req.user.id,
                    status: 'uploading',
                    gcspath: `gs://${buckets.uploads.name}/${gcsPath}`,
                    uploadstartedat: now
                })
                .select()
                .single();

            if (ticketError) {
                console.error('Ticket creation error:', ticketError);
                return res.status(500).json({
                    error: 'Failed to create ticket',
                    details: ticketError.message
                });
            }

            ticket = createdTicket;
        }

        // Upload file to GCS
        const gcsFile = buckets.uploads.file(gcsPath);
        await gcsFile.save(file.buffer, {
            contentType: contentType,
            metadata: {
                ticketId: ticketId,
                clientId: resolvedClientId || '',
                clientName: resolvedClientName || '',
                uploadedBy: req.user.id
            }
        });

        // Update ticket status to pending (upload complete)
        await supabaseAdmin
            .from('tickets')
            .update({
                status: 'pending',
                uploadcompletedat: now
            })
            .eq('id', ticketId);

        console.log(`✅ Uploaded ticket: ${ticketId} (Visit #${visitNumber} for Client ID: ${resolvedClientId})`);

        // Trigger analysis in background
        triggerAnalysis(ticketId, ticket).catch(err => {
            console.error(`Analysis trigger failed for ${ticketId}:`, err);
        });

        res.json({
            success: true,
            ticket_id: ticketId,
            visit_number: visitNumber,
            previous_ticket_id: previousTicketId,
            message: isDraftUpload
                ? 'Draft upload complete, analysis started'
                : 'Upload complete, analysis started'
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});


// Background analysis trigger
async function triggerAnalysis(ticketId, ticket) {
    try {
        // Update status to processing
        await supabaseAdmin
            .from('tickets')
            .update({
                status: 'processing',
                analysis_started_at: new Date().toISOString()
            })
            .eq('id', ticketId);

        // Determine visit number — robust fallback for old tickets missing visitnumber
        let visitNumber = Math.max(ticket.visit_number || 0, ticket.visitnumber || 0);

        if (!visitNumber && ticket.client_id) {
            const { data: clientTickets } = await supabaseAdmin
                .from('tickets')
                .select('id')
                .eq('client_id', ticket.client_id)
                .order('createdat', { ascending: true });
            if (clientTickets && clientTickets.length > 0) {
                const idx = clientTickets.findIndex(t => t.id === ticketId);
                visitNumber = idx >= 0 ? idx + 1 : clientTickets.length;
            }
        } else if (!visitNumber) {
            visitNumber = 1;
        }

        console.log(`🔍 Phase 1: Analyzing ticket ${ticketId} (Visit #${visitNumber})`);

        // ── Phase 1: Core audio analysis (no comparison) ──
        const analysis = await analyzeAudio(ticketId, {
            client_id: ticket.client_id,
            client_name: ticket.client_name || ticket.clientname,
            visit_number: visitNumber
        });

        // Normalize scores
        const normalizedScores = {
            ...(analysis.scores || {}),
            politeness: analysis.politeness_score ?? analysis.scores?.politeness ?? null,
            confidence: analysis.confidence_score ?? analysis.scores?.confidence ?? null,
            interest: analysis.customer_interest_level ?? analysis.scores?.interest ?? null,
            speakers: analysis.speakers_detected ?? analysis.scores?.speakers ?? null
        };

        // Store Phase 1 results
        const { error: analysisError } = await supabaseAdmin
            .from('analysisresults')
            .upsert({
                ticketid: ticketId,
                status: 'completed',
                rating: analysis.overall_score || null,
                summary: analysis.summary || null,
                keymoments: analysis.key_moments ? analysis.key_moments.map(m => ({
                    ...m,
                    time: m.timestamp || m.start_time_ms
                })) : [],
                improvementsuggestions: analysis.recommendations || analysis.improvement_suggestions || [],
                actionitems: analysis.action_items || [],
                objections: analysis.objections || [],
                scores: normalizedScores,
                comparisonwithprevious: null
            }, { onConflict: 'ticketid' });

        if (analysisError) {
            console.error('Failed to store analysis results:', analysisError);
        }

        // Update ticket status
        await supabaseAdmin
            .from('tickets')
            .update({
                status: 'analyzed',
                rating: analysis.overall_score || null,
                analysiscompletedat: new Date().toISOString(),
                istrainingcall: (analysis.overall_score || 0) >= 4.0
            })
            .eq('id', ticketId);

        console.log(`✅ Phase 1 complete for ticket: ${ticketId} (Score: ${analysis.overall_score})`);

        // ── Phase 2: Comparison (only for visitNumber > 1) ──
        if (visitNumber > 1) {
            let resolvedPrevTicketId = ticket.previous_visit_ticket_id || ticket.previousvisitticketid || null;

            if (!resolvedPrevTicketId && ticket.client_id) {
                console.log(`🔍 Phase 2: No previousvisitticketid — falling back to client_id lookup...`);
                const { data: prevTickets } = await supabaseAdmin
                    .from('tickets')
                    .select('id, visitnumber')
                    .eq('client_id', ticket.client_id)
                    .neq('id', ticketId)
                    .order('visitnumber', { ascending: false })
                    .limit(1);

                if (prevTickets && prevTickets.length > 0) {
                    resolvedPrevTicketId = prevTickets[0].id;
                    console.log(`✅ Found previous ticket by client_id: ${resolvedPrevTicketId}`);
                }
            }

            if (resolvedPrevTicketId) {
                try {
                    const previousAnalysis = await getPreviousAnalysis(resolvedPrevTicketId);
                    if (previousAnalysis) {
                        console.log(`📊 Phase 2: Comparing Visit #${visitNumber} with Visit #${visitNumber - 1}`);
                        const comparison = await runComparisonAnalysis(analysis, previousAnalysis, visitNumber);
                        if (comparison) {
                            await supabaseAdmin
                                .from('analysisresults')
                                .update({ comparisonwithprevious: comparison })
                                .eq('ticketid', ticketId);
                            console.log(`✅ Phase 2 complete. Delta: ${comparison.delta_score}`);
                        }
                    }
                } catch (compErr) {
                    console.warn(`⚠️ Phase 2 comparison failed (non-fatal):`, compErr.message);
                }
            } else {
                console.warn(`⚠️ Could not find previous ticket for comparison (Visit #${visitNumber})`);
            }
        }

        // Auto-promote to training if rating >= 4.0
        if ((analysis.overall_score || 0) >= 4.0) {
            try {
                const { exists, extension } = await checkAudioExists(ticketId);
                if (exists) {
                    await promoteToTraining(ticketId, extension);
                    console.log(`🎓 Auto-promoted ticket ${ticketId} to training library`);

                    await supabaseAdmin
                        .from('trainingtickets')
                        .insert({
                            ticketid: ticketId,
                            promotedby: null,
                            promotedat: new Date().toISOString()
                        });
                }
            } catch (promoteError) {
                console.error(`⚠️ Auto-promotion failed for ${ticketId}:`, promoteError);
                // Don't fail the whole analysis job for promotion failure
            }
        }

    } catch (error) {
        console.error(`❌ Analysis failed for ticket ${ticketId}:`, error);
        await supabaseAdmin
            .from('tickets')
            .update({
                status: 'analysis_failed',
                analysis_error: error.message,
                analysiserror: error.message // Save in both formats if needed
            })
            .eq('id', ticketId);
    }
}

/**
 * POST /tickets/init
 * Initialize a new ticket and get upload URL (uses IAM-based signing)
 * Role: employee, admin
 */
router.post('/init', authMiddleware, requireEmployee, async (req, res) => {
    try {
        const { client_name, visit_type, filename } = req.body;

        if (!client_name || !filename) {
            return res.status(400).json({
                error: 'client_name and filename are required'
            });
        }

        const ticketId = uuidv4();

        // Get visit sequence
        const { visitNumber, previousTicketId } = await getVisitSequence(client_name);

        // Import generateUploadUrl
        const { generateUploadUrl } = await import('../config/gcs.js');

        // Create ticket in database
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .insert({
                id: ticketId,
                clientname: client_name.trim(),
                client_name: client_name.trim(),
                visittype: visit_type || 'site_visit',
                visit_type: visit_type || 'site_visit',
                visitnumber: visitNumber,
                visit_number: visitNumber,
                previousvisitticketid: previousTicketId,
                previous_visit_ticket_id: previousTicketId,
                createdby: req.user.id,
                created_by: req.user.id,
                status: 'pending',
                uploadstartedat: new Date().toISOString(),
                upload_started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (ticketError) {
            console.error('Ticket creation error:', ticketError);
            return res.status(500).json({
                error: 'Failed to create ticket',
                details: ticketError.message,
                code: ticketError.code
            });
        }

        // Generate signed upload URL
        const { uploadUrl, gcsPath, contentType } = await generateUploadUrl(ticketId, filename);

        console.log(`📋 Created ticket: ${ticketId} (Visit #${visitNumber} for ${client_name})`);

        res.json({
            ticket_id: ticketId,
            visit_number: visitNumber,
            previous_ticket_id: previousTicketId,
            upload_url: uploadUrl,
            gcs_path: gcsPath,
            content_type: contentType
        });

    } catch (error) {
        console.error('Init ticket error:', error);
        res.status(500).json({ error: 'Failed to initialize ticket', details: error.message });
    }
});

/**
 * POST /tickets/:id/upload-complete
 * Mark upload as complete and trigger analysis
 * Role: employee, admin
 */
router.post('/:id/upload-complete', authMiddleware, requireEmployee, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify audio exists in GCS
        const { exists, extension, path } = await checkAudioExists(id);

        if (!exists) {
            return res.status(400).json({
                error: 'Audio file not found. Upload may have failed.'
            });
        }

        // Update ticket status
        const { data: ticket, error: updateError } = await supabaseAdmin
            .from('tickets')
            .update({
                status: 'uploaded',
                gcs_path: getAudioUri(id, extension),
                upload_completed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select('*, previous_visit_ticket_id')
            .single();

        if (updateError) {
            console.error('Update error:', updateError);
            return res.status(500).json({ error: 'Failed to update ticket' });
        }

        console.log(`✅ Upload complete for ticket: ${id}`);

        // Trigger analysis asynchronously
        triggerAnalysis(id, ticket);

        res.json({
            success: true,
            ticket_id: id,
            status: 'uploaded',
            message: 'Upload complete. Analysis started.'
        });

    } catch (error) {
        console.error('Upload complete error:', error);
        res.status(500).json({ error: 'Failed to complete upload' });
    }
});

// ============================================
// ADMIN ROUTES (Full Access)
// ============================================

/**
 * GET /tickets
 * List all tickets with filters
 * Role: admin
 */
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const {
            status,
            dateRange,
            dateFrom,
            dateTo,
            ratingFilter,
            sortOrder = 'desc',
            createdBy,
            liveOnly,
            flaggedOnly,
            search,
            page = 1,
            limit = 12
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;
        const rawSearch = typeof search === 'string' ? search.trim() : '';
        const hasSearch = rawSearch.length > 0;
        const normalizedSearch = normalizeSearchTerm(rawSearch.replaceAll('#', ''));
        const sortDirection = String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';
        const sortAscending = sortDirection === 'asc';

        let query = supabaseAdmin
            .from('tickets')
            .select('*', { count: 'exact' })
            .is('deletedat', null)
            .order('createdat', { ascending: sortAscending });

        // Status filter
        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        // Live only filter (pending or processing)
        if (liveOnly === 'true') {
            query = query.in('status', ['pending', 'processing', 'uploading']);
        }

        // Created by filter
        if (createdBy && createdBy !== 'all') {
            query = query.eq('createdby', createdBy);
        }

        // Rating filter (DB rating is 0-10; UI works in 0-5 stars)
        if (ratingFilter && ratingFilter !== 'all') {
            switch (String(ratingFilter)) {
                case '4plus':
                    query = query.gte('rating', 8);
                    break;
                case '3plus':
                    query = query.gte('rating', 6);
                    break;
                case '2plus':
                    query = query.gte('rating', 4);
                    break;
                case '1plus':
                    query = query.gte('rating', 2);
                    break;
                case 'below2':
                    query = query.lt('rating', 4).not('rating', 'is', null);
                    break;
                case 'unrated':
                    query = query.is('rating', null);
                    break;
                default:
                    break;
            }
        }

        // Search filter (client ID is prioritized, then client name)
        if (hasSearch) {
            const sanitizedSearch = rawSearch
                .replace(/[,%*()]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const hashlessSearch = sanitizedSearch.replaceAll('#', '').trim();

            const clauses = new Set();

            // Keep raw-ish term for client_id since some IDs may include '#'.
            if (sanitizedSearch) {
                clauses.add(`client_id.ilike.%${sanitizedSearch}%`);
            }

            if (hashlessSearch) {
                clauses.add(`client_id.ilike.%${hashlessSearch}%`);
                clauses.add(`clientname.ilike.%${hashlessSearch}%`);
                clauses.add(`visittype.ilike.%${hashlessSearch}%`);

                if (/^\d+$/.test(hashlessSearch)) {
                    clauses.add(`visitnumber.eq.${Number(hashlessSearch)}`);
                }
            }

            if (clauses.size > 0) {
                query = query.or([...clauses].join(','));
            }
        }

        // Date range filter
        if (dateRange && dateRange !== 'all') {
            const now = new Date();
            let fromDate;

            switch (dateRange) {
                case 'today':
                    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case '7days':
                    fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30days':
                    fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case '60days':
                    fromDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
                    break;
                case 'custom':
                    fromDate = null;
                    break;
                default:
                    fromDate = null;
            }

            if (fromDate) {
                query = query.gte('createdat', fromDate.toISOString());
            }
        }

        // Manual date filter (works with dateRange=custom or alongside other filters)
        if (dateFrom) {
            const from = new Date(`${String(dateFrom)}T00:00:00`);
            if (Number.isFinite(from.getTime())) {
                query = query.gte('createdat', from.toISOString());
            }
        }
        if (dateTo) {
            const to = new Date(`${String(dateTo)}T23:59:59.999`);
            if (Number.isFinite(to.getTime())) {
                query = query.lte('createdat', to.toISOString());
            }
        }

        if (!hasSearch) {
            query = query.range(offset, offset + limitNum - 1);
        }

        const { data: tickets, error, count } = await query;

        if (error) {
            console.error('List tickets error:', error);
            return res.status(500).json({ error: 'Failed to fetch tickets' });
        }

        let resultTickets = tickets || [];
        let total = count || 0;

        if (hasSearch) {
            const ranked = resultTickets
                .map((ticket) => ({
                    ticket,
                    rank: getTicketSearchRank(ticket, normalizedSearch),
                    createdAtTs: Number(new Date(ticket?.createdat || 0))
                }))
                .sort((a, b) => {
                    if (a.rank !== b.rank) return a.rank - b.rank;
                    return sortAscending
                        ? a.createdAtTs - b.createdAtTs
                        : b.createdAtTs - a.createdAtTs;
                });

            total = ranked.length;
            resultTickets = ranked
                .slice(offset, offset + limitNum)
                .map((item) => item.ticket);
        }

        // Enrich tickets with flag status
        const ticketIds = resultTickets.map((t) => t.id);
        let flaggedIds = new Set();
        if (ticketIds.length > 0) {
            const { data: flags } = await supabaseAdmin
                .from('flagged_tickets')
                .select('ticket_id')
                .in('ticket_id', ticketIds);
            if (flags) {
                flaggedIds = new Set(flags.map((f) => f.ticket_id));
            }
        }
        const enrichedTickets = resultTickets.map((t) => ({
            ...t,
            is_flagged: flaggedIds.has(t.id),
        }));

        // Apply flaggedOnly filter
        let finalTickets = enrichedTickets;
        let finalTotal = total;
        if (String(flaggedOnly) === 'true') {
            finalTickets = enrichedTickets.filter((t) => t.is_flagged);
            finalTotal = finalTickets.length;
        }

        // Enrich tickets with creator details (fullname, avatar_url)
        const userIds = [...new Set(finalTickets.map((t) => t.createdby).filter(Boolean))];
        if (userIds.length > 0) {
            const { data: users } = await supabaseAdmin
                .from('users')
                .select('id, fullname, avatar_url')
                .in('id', userIds);

            if (users) {
                const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
                finalTickets.forEach((ticket) => {
                    if (ticket.createdby && userMap[ticket.createdby]) {
                        ticket.creator_details = userMap[ticket.createdby];
                    }
                });
            }
        }

        res.json({
            tickets: finalTickets,
            total: finalTotal,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(finalTotal / limitNum)
        });

    } catch (error) {
        console.error('List error:', error);
        res.status(500).json({ error: 'Failed to list tickets' });
    }
});

/**
 * GET /tickets/analytics/overview
 * Aggregate team and project performance metrics for admin analytics.
 * Role: admin, superadmin
 */
router.get('/analytics/overview', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const requestedPeriod = String(req.query.period || 'monthly').toLowerCase();
        const period = ANALYTICS_PERIOD_DAYS[requestedPeriod] ? requestedPeriod : 'monthly';
        const days = ANALYTICS_PERIOD_DAYS[period];

        const now = new Date();
        const fromDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

        const { data: tickets, error: ticketsError } = await supabaseAdmin
            .from('tickets')
            .select('id, status, rating, istrainingcall, createdat, visittype, client_id, clientname, createdby')
            .is('deletedat', null)
            .gte('createdat', fromDate.toISOString())
            .order('createdat', { ascending: true });

        if (ticketsError) {
            console.error('Analytics tickets query failed:', ticketsError);
            return res.status(500).json({ error: 'Failed to fetch analytics tickets' });
        }

        const { data: users, error: usersError } = await supabaseAdmin
            .from('users')
            .select('id, fullname, email, role, status');

        if (usersError) {
            console.error('Analytics users query failed:', usersError);
            return res.status(500).json({ error: 'Failed to fetch analytics users' });
        }

        const rows = tickets || [];
        const people = users || [];
        const usersById = new Map(people.map((row) => [row.id, row]));

        let analyzedCount = 0;
        let failedCount = 0;
        let activeCount = 0;
        let trainingCalls = 0;
        let ratingSum = 0;
        let ratingCount = 0;

        const statusMap = new Map();
        const visitTypeMap = new Map();
        const teamMap = new Map();
        const projectMap = new Map();
        const trendMap = new Map();

        const useDailyBuckets = period === 'weekly' || period === 'monthly';

        for (const ticket of rows) {
            const status = ticket.status || 'unknown';
            const createdAtRaw = ticket.createdat || null;
            const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;
            const clientId = (ticket.client_id || '').trim() || 'unassigned-project';
            const clientName = (ticket.clientname || '').trim() || clientId;
            const visitType = ticket.visittype || 'unknown';
            const creatorId = ticket.createdby || 'unassigned';
            const rating = toNumber(ticket.rating);
            const isTraining = Boolean(ticket.istrainingcall);
            const creator = usersById.get(creatorId);
            const creatorName = creator?.fullname || (creatorId === 'unassigned' ? 'Unassigned' : 'Unknown Member');

            if (status === 'analyzed') analyzedCount += 1;
            if (status === 'analysis_failed') failedCount += 1;
            if (['pending', 'processing', 'uploading', 'draft'].includes(status)) activeCount += 1;
            if (isTraining) trainingCalls += 1;

            if (rating !== null) {
                ratingSum += rating;
                ratingCount += 1;
            }

            statusMap.set(status, (statusMap.get(status) || 0) + 1);
            visitTypeMap.set(visitType, (visitTypeMap.get(visitType) || 0) + 1);

            const existingTeam = teamMap.get(creatorId) || {
                user_id: creatorId,
                member_name: creatorName,
                role: creator?.role || 'unknown',
                tickets: 0,
                analyzed: 0,
                failed: 0,
                active: 0,
                training_calls: 0,
                rating_sum: 0,
                rating_count: 0,
                projects: new Set()
            };

            existingTeam.tickets += 1;
            if (status === 'analyzed') existingTeam.analyzed += 1;
            if (status === 'analysis_failed') existingTeam.failed += 1;
            if (['pending', 'processing', 'uploading', 'draft'].includes(status)) existingTeam.active += 1;
            if (isTraining) existingTeam.training_calls += 1;
            if (rating !== null) {
                existingTeam.rating_sum += rating;
                existingTeam.rating_count += 1;
            }
            existingTeam.projects.add(clientId);
            teamMap.set(creatorId, existingTeam);

            const existingProject = projectMap.get(clientId) || {
                project_id: clientId,
                project_name: clientName,
                tickets: 0,
                analyzed: 0,
                failed: 0,
                active: 0,
                training_calls: 0,
                rating_sum: 0,
                rating_count: 0,
                teammates: new Set()
            };

            existingProject.tickets += 1;
            if (status === 'analyzed') existingProject.analyzed += 1;
            if (status === 'analysis_failed') existingProject.failed += 1;
            if (['pending', 'processing', 'uploading', 'draft'].includes(status)) existingProject.active += 1;
            if (isTraining) existingProject.training_calls += 1;
            if (rating !== null) {
                existingProject.rating_sum += rating;
                existingProject.rating_count += 1;
            }
            existingProject.teammates.add(creatorName);
            projectMap.set(clientId, existingProject);

            if (createdAt && Number.isFinite(createdAt.getTime())) {
                const key = useDailyBuckets
                    ? createdAt.toISOString().slice(0, 10)
                    : `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
                const label = useDailyBuckets
                    ? createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : createdAt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

                const bucket = trendMap.get(key) || {
                    key,
                    label,
                    tickets: 0,
                    analyzed: 0,
                    rating_sum: 0,
                    rating_count: 0
                };

                bucket.tickets += 1;
                if (status === 'analyzed') bucket.analyzed += 1;
                if (rating !== null) {
                    bucket.rating_sum += rating;
                    bucket.rating_count += 1;
                }
                trendMap.set(key, bucket);
            }
        }

        const totalTickets = rows.length;
        const avgRatingOutOf10 = ratingCount > 0 ? roundTo(ratingSum / ratingCount, 2) : 0;
        const avgRatingOutOf5 = roundTo(avgRatingOutOf10 / 2, 2);
        const completionRate = safePercent(analyzedCount, totalTickets);

        const statusBreakdown = Array.from(statusMap.entries())
            .map(([key, count]) => ({
                key,
                label: formatStatusLabel(key),
                count,
                percent: safePercent(count, totalTickets)
            }))
            .sort((a, b) => b.count - a.count);

        const visitTypeBreakdown = Array.from(visitTypeMap.entries())
            .map(([key, count]) => ({
                key,
                label: formatVisitTypeLabel(key),
                count,
                percent: safePercent(count, totalTickets)
            }))
            .sort((a, b) => b.count - a.count);

        const teamPerformance = Array.from(teamMap.values())
            .map((row) => ({
                user_id: row.user_id,
                member_name: row.member_name,
                role: row.role,
                tickets: row.tickets,
                analyzed: row.analyzed,
                failed: row.failed,
                active: row.active,
                projects_count: row.projects.size,
                training_calls: row.training_calls,
                completion_rate: safePercent(row.analyzed, row.tickets),
                average_rating_10: row.rating_count > 0 ? roundTo(row.rating_sum / row.rating_count, 2) : 0,
                average_rating_5: row.rating_count > 0 ? roundTo((row.rating_sum / row.rating_count) / 2, 2) : 0
            }))
            .sort((a, b) => b.tickets - a.tickets);

        const projectPerformance = Array.from(projectMap.values())
            .map((row) => ({
                project_id: row.project_id,
                project_name: row.project_name,
                tickets: row.tickets,
                analyzed: row.analyzed,
                failed: row.failed,
                active: row.active,
                teammates_count: row.teammates.size,
                teammates: Array.from(row.teammates).sort(),
                training_calls: row.training_calls,
                completion_rate: safePercent(row.analyzed, row.tickets),
                average_rating_10: row.rating_count > 0 ? roundTo(row.rating_sum / row.rating_count, 2) : 0,
                average_rating_5: row.rating_count > 0 ? roundTo((row.rating_sum / row.rating_count) / 2, 2) : 0
            }))
            .sort((a, b) => b.tickets - a.tickets);

        const trend = Array.from(trendMap.values())
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((bucket) => ({
                key: bucket.key,
                label: bucket.label,
                tickets: bucket.tickets,
                analyzed: bucket.analyzed,
                completion_rate: safePercent(bucket.analyzed, bucket.tickets),
                average_rating_5: bucket.rating_count > 0 ? roundTo((bucket.rating_sum / bucket.rating_count) / 2, 2) : 0
            }));

        res.json({
            period,
            from: fromDate.toISOString(),
            to: now.toISOString(),
            summary: {
                total_tickets: totalTickets,
                analyzed_tickets: analyzedCount,
                active_tickets: activeCount,
                failed_tickets: failedCount,
                training_calls: trainingCalls,
                completion_rate: completionRate,
                average_rating_10: avgRatingOutOf10,
                average_rating_5: avgRatingOutOf5
            },
            status_breakdown: statusBreakdown,
            visit_type_breakdown: visitTypeBreakdown,
            team_performance: teamPerformance,
            project_performance: projectPerformance,
            trend,
            raw_json: {
                tickets_sample: rows.slice(0, 25),
                users_sample: people.slice(0, 25),
                tickets_count: rows.length,
                users_count: people.length
            }
        });

    } catch (error) {
        console.error('Analytics overview error:', error);
        res.status(500).json({ error: 'Failed to generate analytics overview' });
    }
});

/**
 * GET /tickets/report/shared/:token
 * Public shared PDF report endpoint (tokenized, time-limited)
 */
router.get('/report/shared/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const tokenPayload = verifyReportShareToken(token);

        if (!tokenPayload) {
            return res.status(401).json({ error: 'Invalid or expired report link' });
        }

        const context = await fetchTicketReportContext(tokenPayload.ticketId);
        if (!context) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const shouldDownload = req.query.download === 'true' || req.query.download === '1';
        sendTicketReportPdf(res, context.ticket.id, context, shouldDownload);
    } catch (error) {
        console.error('Shared report error:', error);
        res.status(500).json({ error: 'Failed to generate shared report' });
    }
});

/**
 * GET /tickets/:id/report
 * Download detailed PDF report for a ticket
 * Role: admin
 */
router.get('/:id/report', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const context = await fetchTicketReportContext(id);
        if (!context) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const shouldDownload = req.query.download !== 'false' && req.query.download !== '0';
        await logActivity(req, 'ticket.report.download', { ticket_id: id });
        sendTicketReportPdf(res, id, context, shouldDownload);
    } catch (error) {
        console.error('Ticket report error:', error);
        res.status(500).json({ error: 'Failed to generate ticket report' });
    }
});

/**
 * POST /tickets/:id/report/share-link
 * Generate a time-limited share URL for a ticket report
 * Role: admin
 */
router.post('/:id/report/share-link', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const context = await fetchTicketReportContext(id);
        if (!context) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const expiresAtMs = Date.now() + REPORT_SHARE_TTL_MS;
        const token = createReportShareToken(id, expiresAtMs);
        const shareUrl = `${getRequestOrigin(req)}/tickets/report/shared/${token}`;

        await logActivity(req, 'ticket.report.share', { ticket_id: id, share_url: shareUrl });

        res.json({
            ticket_id: id,
            share_url: shareUrl,
            expires_at: new Date(expiresAtMs).toISOString()
        });
    } catch (error) {
        console.error('Create report share link error:', error);
        res.status(500).json({ error: 'Failed to create report share link' });
    }
});

/**
 * GET /tickets/:id/audio-url
 * Generate a fresh signed URL for audio playback
 * Role: admin
 */
router.get('/:id/audio-url', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('id, gcs_path, gcspath')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const audioUrl = await generateTicketAudioUrl(id, ticket);
        if (!audioUrl) {
            return res.status(404).json({ error: 'Audio file not found for this ticket' });
        }

        res.json({
            audio_url: audioUrl,
            expires_in_seconds: 86400
        });
    } catch (error) {
        console.error('Audio URL generation error:', error);
        res.status(500).json({ error: 'Failed to generate audio playback URL' });
    }
});

/**
 * DELETE /tickets/:id
 * Permanently delete a ticket and related artifacts
 * Role: admin
 */
async function handleTicketDelete(req, res) {
    try {
        const { id } = req.params;

        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('id, gcs_path, gcspath')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const cleanupSpecs = [
            { table: 'actionitems', column: 'ticketid' },
            { table: 'employeeexcuses', column: 'ticketid' },
            { table: 'analysisresults', column: 'ticketid' },
            { table: 'trainingtickets', column: 'ticketid' }
        ];

        for (const spec of cleanupSpecs) {
            const { error } = await supabaseAdmin
                .from(spec.table)
                .delete()
                .eq(spec.column, id);

            if (error) {
                console.error(`Ticket delete cleanup error (${spec.table}):`, error);
                return res.status(500).json({ error: `Failed to clean ${spec.table}` });
            }
        }

        const { error: deleteTicketError } = await supabaseAdmin
            .from('tickets')
            .delete()
            .eq('id', id);

        if (deleteTicketError) {
            console.error('Ticket delete error:', deleteTicketError);
            return res.status(500).json({ error: 'Failed to delete ticket' });
        }

        let assetWarnings = [];
        try {
            assetWarnings = await cleanupTicketAudioAssets(ticket);
        } catch (cleanupError) {
            const warningMessage = cleanupError instanceof Error ? cleanupError.message : 'asset cleanup failed';
            console.error('Ticket asset cleanup warning:', cleanupError);
            assetWarnings = [`Audio cleanup skipped: ${warningMessage}`];
        }

        await logActivity(req, 'ticket.delete', { ticket_id: id });

        res.json({
            success: true,
            message: 'Ticket deleted successfully',
            warnings: assetWarnings
        });
    } catch (error) {
        console.error('Delete ticket error:', error);
        res.status(500).json({ error: 'Failed to delete ticket' });
    }
}

router.delete('/:id', authMiddleware, requireAdmin, handleTicketDelete);

/**
 * POST /tickets/:id/delete
 * Compatibility delete alias for clients/environments that cannot use DELETE.
 * Role: admin
 */
router.post('/:id/delete', authMiddleware, requireAdmin, handleTicketDelete);

/**
 * GET /tickets/calendar-heatmap
 * Returns daily ticket counts for the last 365 days
 */
router.get('/calendar-heatmap', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.rpc('get_ticket_heatmap');

        if (error) {
            console.log('RPC get_ticket_heatmap not found, falling back to raw query');

            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            const { data: tickets, error: queryError } = await supabaseAdmin
                .from('tickets')
                .select('createdat')
                .gte('createdat', oneYearAgo.toISOString());

            if (queryError) throw queryError;

            const counts = {};
            tickets.forEach(t => {
                const date = (t.createdat || '').split('T')[0];
                if (date) {
                    counts[date] = (counts[date] || 0) + 1;
                }
            });

            const result = Object.entries(counts).map(([date, count]) => ({ date, count }));
            return res.json(result);
        }

        res.json(data);
    } catch (error) {
        console.error('Calendar heatmap error:', error);
        res.status(500).json({ error: 'Failed to fetch heatmap data' });
    }
});

/**
 * GET /tickets/:id
 * Get single ticket with full details
 * Role: admin
 */
router.get('/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Get ticket with creator info
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Fetch creator details manually to ensure we get avatar
        if (ticket.createdby) {
            const { data: creator } = await supabaseAdmin
                .from('users')
                .select('fullname, avatar_url')
                .eq('id', ticket.createdby)
                .single();

            if (creator) {
                ticket.creator_details = creator;
            }
        }

        // Get analysis results
        const { data: analysis } = await supabaseAdmin
            .from('analysisresults')
            .select('*')
            .eq('ticketid', id)
            .single();

        // Get previous analysis row for comparisons
        const previousTicketId = ticket.previous_visit_ticket_id || ticket.previousvisitticketid || null;
        let previousAnalysis = null;
        if (previousTicketId) {
            const { data: prev } = await supabaseAdmin
                .from('analysisresults')
                .select('*')
                .eq('ticketid', previousTicketId)
                .maybeSingle();
            previousAnalysis = prev || null;
        }

        // Get action items from actionitems table
        let actionItemsDb = [];
        const { data: actionRows, error: actionError } = await supabaseAdmin
            .from('actionitems')
            .select('id, ticketid, assignedto, title, description, duedate, completed, completedat, completedby, createdby, createdat')
            .eq('ticketid', id)
            .order('createdat', { ascending: false });

        if (actionError) {
            console.error('Fetch actionitems error:', actionError);
        } else {
            actionItemsDb = (actionRows || []).map((row) => ({
                id: row.id,
                ticket_id: row.ticketid,
                assigned_to: row.assignedto,
                title: row.title,
                description: row.description,
                due_date: row.duedate,
                completed: row.completed,
                completed_at: row.completedat,
                completed_by: row.completedby,
                created_by: row.createdby,
                created_at: row.createdat
            }));
        }

        // Get excuses linked to this ticket
        let excuses = [];
        const { data: excuseRows, error: excusesError } = await supabaseAdmin
            .from('employeeexcuses')
            .select('id, ticketid, employeeid, reason, reasondetails, estimatedtimeminutes, estimatedstarttime, status, submittedat, reviewedat, adminnotes, users!employeeid(fullname, email)')
            .eq('ticketid', id)
            .order('submittedat', { ascending: false });

        if (excusesError) {
            console.error('Fetch ticket excuses error:', excusesError);
        } else {
            excuses = (excuseRows || []).map((row) => ({
                id: row.id,
                ticket_id: row.ticketid,
                employee_id: row.employeeid,
                reason: row.reason,
                reason_details: row.reasondetails || null,
                estimated_time_minutes: row.estimatedtimeminutes,
                estimated_start_time: row.estimatedstarttime,
                status: row.status,
                submitted_at: row.submittedat,
                reviewed_at: row.reviewedat,
                admin_notes: row.adminnotes,
                employee: row.users ? {
                    fullname: row.users.fullname || 'Unknown',
                    email: row.users.email || ''
                } : null
            }));
        }

        // Get visit chain
        const visitChain = await getVisitChain(id);

        // Generate playback URL if audio exists
        let audioUrl = null;
        try {
            audioUrl = await generateTicketAudioUrl(id, ticket);
        } catch (audioError) {
            console.error('Error generating audio URL:', audioError.message);
            // Continue without audio URL
        }

        res.json({
            ticket,
            analysis,
            previous_analysis: previousAnalysis,
            comparison: buildComparison(analysis, previousAnalysis),
            action_items_db: actionItemsDb,
            excuses,
            visit_chain: visitChain,
            audio_url: audioUrl
        });

    } catch (error) {
        console.error('Get ticket error:', error);
        res.status(500).json({ error: 'Failed to fetch ticket' });
    }
});

/**
 * POST /tickets/:id/promote
 * Promote ticket to training library
 * Role: admin
 */
router.post('/:id/promote', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check ticket exists and has good rating
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('id, rating, istrainingcall')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.istrainingcall) {
            return res.status(400).json({ error: 'Ticket is already in training library' });
        }

        // Get audio file info
        const { exists, extension } = await checkAudioExists(id);
        if (!exists) {
            return res.status(400).json({ error: 'Audio file not found' });
        }

        // Copy audio to training bucket
        await promoteToTraining(id, extension);

        // Update ticket
        await supabaseAdmin
            .from('tickets')
            .update({ istrainingcall: true })
            .eq('id', id);

        // Add to trainingtickets table
        await supabaseAdmin
            .from('trainingtickets')
            .insert({
                ticketid: id,
                promotedby: req.user.id,
                promotedat: new Date().toISOString()
            });

        console.log(`🎓 Ticket ${id} promoted to training library`);

        res.json({
            success: true,
            message: 'Ticket promoted to training library'
        });

    } catch (error) {
        console.error('Promote error:', error);
        res.status(500).json({ error: 'Failed to promote ticket' });
    }
});

/**
 * POST /tickets/:id/analyze
 * Manually trigger re-analysis of a ticket (synchronous - waits for completion)
 * Role: admin
 */
router.post('/:id/analyze', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch ticket details
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check if audio exists
        const { exists } = await checkAudioExists(id);
        if (!exists) {
            return res.status(400).json({ error: 'Audio file not found for this ticket' });
        }

        // Determine visit number — robust fallback for old tickets missing visitnumber
        let visitNumber = Math.max(ticket.visit_number || 0, ticket.visitnumber || 0);
        const prevTicketId = ticket.previous_visit_ticket_id || ticket.previousvisitticketid;

        // If visitnumber is missing or 0, count tickets for this client to determine it
        if (!visitNumber && ticket.client_id) {
            const { data: clientTickets } = await supabaseAdmin
                .from('tickets')
                .select('id')
                .eq('client_id', ticket.client_id)
                .order('createdat', { ascending: true });
            if (clientTickets && clientTickets.length > 0) {
                const idx = clientTickets.findIndex(t => t.id === id);
                visitNumber = idx >= 0 ? idx + 1 : clientTickets.length;
            }
        } else if (!visitNumber) {
            visitNumber = 1;
        }

        // ── Phase 1: Core audio analysis (no comparison) ──
        console.log(`🔍 Phase 1: Re-analyzing ticket ${id} (Visit #${visitNumber})`);
        const analysis = await analyzeAudio(id, {
            client_id: ticket.client_id,
            client_name: ticket.clientname,
            visit_number: visitNumber
        });

        // Normalize scores
        const normalizedScores = {
            ...(analysis.scores || {}),
            politeness: analysis.politeness_score ?? analysis.scores?.politeness ?? null,
            confidence: analysis.confidence_score ?? analysis.scores?.confidence ?? null,
            interest: analysis.customer_interest_level ?? analysis.scores?.interest ?? null,
            speakers: analysis.speakers_detected ?? analysis.scores?.speakers ?? null
        };

        // Store Phase 1 results
        const { error: analysisError } = await supabaseAdmin
            .from('analysisresults')
            .upsert({
                ticketid: id,
                status: 'completed',
                rating: analysis.overall_score || null,
                summary: analysis.summary || null,
                keymoments: analysis.key_moments ? analysis.key_moments.map(m => ({
                    ...m,
                    time: m.timestamp || m.start_time_ms
                })) : [],
                improvementsuggestions: analysis.recommendations || analysis.improvement_suggestions || [],
                actionitems: analysis.action_items || [],
                objections: analysis.objections || [],
                scores: normalizedScores,
                comparisonwithprevious: null
            }, { onConflict: 'ticketid' });

        if (analysisError) {
            throw new Error(`Failed to save analysis: ${analysisError.message}`);
        }

        // Update ticket status
        await supabaseAdmin
            .from('tickets')
            .update({
                status: 'analyzed',
                rating: analysis.overall_score || null,
                analysiscompletedat: new Date().toISOString(),
                istrainingcall: (analysis.overall_score || 0) >= 4.0
            })
            .eq('id', id);

        console.log(`✅ Phase 1 complete for re-analysis: ${id} (Score: ${analysis.overall_score})`);

        // ── Phase 2: Comparison (only for visitNumber > 1) ──
        if (visitNumber > 1) {
            // Resolve the previous ticket ID — use stored value or fallback to querying by client_id
            let resolvedPrevTicketId = prevTicketId;
            if (!resolvedPrevTicketId && ticket.client_id) {
                console.log(`🔍 Phase 2: No previousvisitticketid set. Falling back to client_id lookup...`);
                const { data: prevTickets } = await supabaseAdmin
                    .from('tickets')
                    .select('id, visitnumber')
                    .eq('client_id', ticket.client_id)
                    .neq('id', id)
                    .order('visitnumber', { ascending: false })
                    .limit(1);

                if (prevTickets && prevTickets.length > 0) {
                    resolvedPrevTicketId = prevTickets[0].id;
                    console.log(`✅ Found previous ticket by client_id: ${resolvedPrevTicketId} (Visit #${prevTickets[0].visitnumber})`);
                }
            }

            if (resolvedPrevTicketId) {
                try {
                    const previousAnalysis = await getPreviousAnalysis(resolvedPrevTicketId);
                    if (previousAnalysis) {
                        console.log(`📊 Phase 2: Comparing Visit #${visitNumber} with Visit #${visitNumber - 1}`);
                        const comparison = await runComparisonAnalysis(analysis, previousAnalysis, visitNumber);
                        if (comparison) {
                            await supabaseAdmin
                                .from('analysisresults')
                                .update({ comparisonwithprevious: comparison })
                                .eq('ticketid', id);
                            console.log(`✅ Phase 2 complete. Delta: ${comparison.delta_score}`);
                        }
                    }
                } catch (compErr) {
                    console.warn(`⚠️ Phase 2 comparison failed (non-fatal):`, compErr.message);
                }
            } else {
                console.warn(`⚠️ Could not find previous ticket for comparison (Visit #${visitNumber})`);
            }
        }

        // Fetch final updated data to return
        const { data: updatedTicket } = await supabaseAdmin
            .from('tickets')
            .select('*')
            .eq('id', id)
            .single();

        const { data: updatedAnalysis } = await supabaseAdmin
            .from('analysisresults')
            .select('*')
            .eq('ticketid', id)
            .single();

        res.json({
            message: 'Re-analysis complete',
            ticket: updatedTicket,
            analysis: updatedAnalysis
        });

    } catch (error) {
        console.error('Re-analysis failed:', error);
        res.status(500).json({ error: 'Analysis failed: ' + error.message });
    }
});

/**
 * DELETE /tickets/:id
 * Delete a ticket and its associated audio file
 * Role: admin
 */
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Get ticket details to find GCS path
        const { data: ticket, error: fetchError } = await supabaseAdmin
            .from('tickets')
            .select('id, gcs_path, gcspath')
            .eq('id', id)
            .single();

        if (fetchError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // 2. Delete from GCS
        const objectPath = extractGcsObjectPath(ticket);
        if (objectPath) {
            try {
                await buckets.uploads.file(objectPath).delete();
                console.log(`Deleted GCS file: ${objectPath}`);
            } catch (gcsError) {
                console.warn(`Failed to delete GCS file ${objectPath}:`, gcsError.message);
                // Continue with DB deletion even if GCS deletion fails (orphaned file is better than stuck record)
            }
        }

        // 3. Delete from Database
        // Note: cascading deletes should handle related tables (analysisresults, actionitems, etc.)
        // depending on your DB schema setup. If not, we might need to delete them manually here.
        // Assuming ON DELETE CASCADE is configured or we want to hard delete.

        const { error: deleteError } = await supabaseAdmin
            .from('tickets')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('Database deletion error:', deleteError);
            return res.status(500).json({ error: 'Failed to delete ticket record' });
        }

        console.log(`✅ Deleted ticket: ${id}`);
        res.json({ success: true, message: 'Ticket and audio deleted successfully' });

    } catch (error) {
        console.error('Delete ticket error:', error);
        res.status(500).json({ error: 'Failed to delete ticket' });
    }
});

// ═══════════════════════════════════════════════════════════════
// FLAG TICKET ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * PATCH /tickets/:id/notes
 * Save markdown notes for a ticket
 * Role: admin
 */
router.patch('/:id/notes', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        if (typeof notes !== 'string') {
            return res.status(400).json({ error: 'Notes must be a string' });
        }

        const { error } = await supabaseAdmin
            .from('tickets')
            .update({ notes })
            .eq('id', id);

        if (error) throw error;

        res.json({ message: 'Notes saved', notes });
    } catch (error) {
        console.error('Save notes error:', error);
        res.status(500).json({ error: 'Failed to save notes' });
    }
});

/**
 * POST /tickets/:id/flag
 * Flag a ticket with a mandatory reason and generate a shareable report link.
 * Also logs the action to the activity log.
 * Role: admin
 */
router.post('/:id/flag', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, recipient_name, recipient_email } = req.body;

        if (!reason || typeof reason !== 'string' || !reason.trim()) {
            return res.status(400).json({ error: 'Reason is required when flagging a ticket' });
        }

        // Verify ticket exists
        const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('tickets')
            .select('id, client_id, clientname, status')
            .eq('id', id)
            .is('deletedat', null)
            .single();

        if (ticketError || !ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        // Check if already flagged
        const { data: existingFlag } = await supabaseAdmin
            .from('flagged_tickets')
            .select('id')
            .eq('ticket_id', id)
            .limit(1)
            .single();

        if (existingFlag) {
            return res.status(409).json({ error: 'This ticket is already flagged' });
        }

        // Generate a share link using the existing share token infrastructure
        const expiresAtMs = Date.now() + REPORT_SHARE_TTL_MS;
        const token = createReportShareToken(id, expiresAtMs);
        const shareUrl = `${getRequestOrigin(req)}/tickets/report/shared/${token}`;

        // Insert flag record
        const flagRow = {
            ticket_id: id,
            flagged_by: req.user.id,
            reason: reason.trim(),
            recipient_name: recipient_name?.trim() || null,
            recipient_email: recipient_email?.trim() || null,
            share_url: shareUrl,
        };

        const { data: flag, error: insertError } = await supabaseAdmin
            .from('flagged_tickets')
            .insert(flagRow)
            .select()
            .single();

        if (insertError) {
            console.error('Flag insert error:', insertError);
            return res.status(500).json({ error: 'Failed to flag ticket' });
        }

        // Log to activity
        await logActivity(req, 'ticket.flagged', {
            ticket_id: id,
            client_id: ticket.client_id,
            reason: reason.trim(),
            recipient_name: recipient_name?.trim() || null,
            recipient_email: recipient_email?.trim() || null,
            share_url: shareUrl,
        });

        res.json({
            flag_id: flag.id,
            ticket_id: id,
            reason: flag.reason,
            share_url: shareUrl,
            expires_at: new Date(expiresAtMs).toISOString(),
            created_at: flag.created_at,
        });

    } catch (error) {
        console.error('Flag ticket error:', error);
        res.status(500).json({ error: 'Failed to flag ticket' });
    }
});

/**
 * GET /tickets/:id/flag
 * Check if a ticket is flagged, return flag details if so.
 * Role: admin
 */
router.get('/:id/flag', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: flag, error } = await supabaseAdmin
            .from('flagged_tickets')
            .select('*, users:flagged_by(fullname, email)')
            .eq('ticket_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !flag) {
            return res.json({ is_flagged: false, flag: null });
        }

        res.json({
            is_flagged: true,
            flag: {
                id: flag.id,
                ticket_id: flag.ticket_id,
                reason: flag.reason,
                recipient_name: flag.recipient_name,
                recipient_email: flag.recipient_email,
                share_url: flag.share_url,
                created_at: flag.created_at,
                flagged_by_name: flag.users?.fullname || null,
                flagged_by_email: flag.users?.email || null,
            },
        });

    } catch (error) {
        console.error('Get flag error:', error);
        res.status(500).json({ error: 'Failed to get flag status' });
    }
});

/**
 * DELETE /tickets/:id/flag
 * Unflag a ticket. Logs the action to the activity log.
 * Role: admin
 */
router.delete('/:id/flag', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: deleted, error } = await supabaseAdmin
            .from('flagged_tickets')
            .delete()
            .eq('ticket_id', id)
            .select('id')
            .single();

        if (error || !deleted) {
            return res.status(404).json({ error: 'This ticket is not flagged' });
        }

        await logActivity(req, 'ticket.unflagged', { ticket_id: id });

        res.json({ success: true, message: 'Ticket unflagged' });

    } catch (error) {
        console.error('Unflag ticket error:', error);
        res.status(500).json({ error: 'Failed to unflag ticket' });
    }
});

export default router;
