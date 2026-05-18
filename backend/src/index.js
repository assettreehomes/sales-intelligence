import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Queue + retry imports
import { getQueueStats } from './services/vertexQueue.js';
import { triggerPresalesAnalysis } from './services/presalesAnalysis.js';
import { supabaseAdmin } from './config/supabase.js';

// Route imports
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/tickets.js';
import draftRoutes from './routes/drafts.js';
import excuseRoutes from './routes/excuses.js';
import trainingRoutes from './routes/training.js';
import userRoutes from './routes/users.js';
import activityLogRoutes from './routes/activityLog.js';
import analyticsRoutes from './routes/analytics.js';
import employeeRoutes from './routes/employee.js';
import webhookRoutes from './routes/webhooks.js';
import reportRoutes from './routes/reports.js';
import telecmiRoutes from './routes/telecmi.js';
import presalesRoutes from './routes/presales.js';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const app = express();
app.set('trust proxy', true); // Cloud Run sits behind a load balancer — trust x-forwarded-for
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : []),
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow all Vercel deployments (*.vercel.app)
        if (origin.endsWith('.vercel.app')) {
            return callback(null, true);
        }

        // Check against allowed origins list
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.1.0',
        environment: process.env.NODE_ENV || 'development',
        vertexQueue: getQueueStats()
    });
});

// Routes
app.use('/auth', authRoutes);
app.use('/tickets', ticketRoutes);
app.use('/drafts', draftRoutes);
app.use('/excuses', excuseRoutes);
app.use('/training', trainingRoutes);
app.use('/users', userRoutes);
app.use('/activity-log', activityLogRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/employee', employeeRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/reports', reportRoutes);
app.use('/telecmi', telecmiRoutes);
app.use('/presales', presalesRoutes);

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ── Auto-retry for analysis_failed presales tickets ──────────────────────────
// Runs every 10 minutes. Picks up to 3 recently-failed presales tickets and
// re-queues them through triggerPresalesAnalysis (which re-downloads from
// TeleCMI and re-runs the full analysis pipeline via the vertex queue).
async function runAnalysisRetry() {
    try {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

        const { data: failedTickets, error } = await supabaseAdmin
            .from('tickets')
            .select('id, telecmi_filename, client_id, clientname, createdby, durationseconds, selldo_agent_name, selldo_agent_email, telecmi_lead_id, selldo_team_name')
            .eq('status', 'analysis_failed')
            .eq('source', 'telecmi')
            .gte('createdat', sixHoursAgo)
            .not('telecmi_filename', 'is', null)
            .limit(3);

        if (error) {
            console.warn('⚠️ Auto-retry: Supabase query failed:', error.message);
            return;
        }

        if (!failedTickets || failedTickets.length === 0) return;

        console.log(`🔁 Auto-retry: found ${failedTickets.length} failed presales ticket(s) — re-queuing`);

        for (const ticket of failedTickets) {
            // Mark as pending so this run doesn't re-pick it if the interval fires again quickly
            await supabaseAdmin
                .from('tickets')
                .update({ status: 'pending', analysiserror: null })
                .eq('id', ticket.id);

            triggerPresalesAnalysis(ticket.id, ticket).catch(err => {
                console.error(`❌ Auto-retry: failed to re-queue ticket ${ticket.id}:`, err.message);
            });
        }
    } catch (err) {
        console.warn('⚠️ Auto-retry: unexpected error:', err.message);
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║        ANTIGRAVITY - Sales Audio Intelligence      ║
║        v2.1 - Force Deploy for Comparison Fix      ║
╠═══════════════════════════════════════════════════╣
║  Server: http://localhost:${PORT}                      ║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(32)}║
║  Supabase: ${process.env.SUPABASE_URL ? '✅ Connected' : '❌ Not configured'}                        ║
║  GCS: ${process.env.GCS_PROJECT_ID ? '✅ ' + process.env.GCS_PROJECT_ID : '❌ Not configured'}              ║
║  Vertex AI: ${process.env.VERTEX_LOCATION || 'us-central1'}                           ║
╚═══════════════════════════════════════════════════╝
    `);

    // Start auto-retry loop — first run after 2 minutes, then every 10 minutes
    setTimeout(() => {
        runAnalysisRetry();
        setInterval(runAnalysisRetry, 10 * 60 * 1000);
    }, 2 * 60 * 1000);
});

export default app;
