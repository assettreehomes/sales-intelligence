'use client';

import { useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { getToken, API_URL } from '@/stores/authStore';

export function SendReportButton() {
    const [sendingReport, setSendingReport] = useState(false);

    const handleSendReport = async () => {
        if (sendingReport) return;
        setSendingReport(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/reports/whatsapp/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });
            const data = await res.json();
            if (res.ok && data.success) {
                alert('✅ WhatsApp report sent successfully!');
            } else {
                alert(`❌ Failed to send report: ${data.error || 'Unknown error'}`);
            }
        } catch {
            alert('❌ Network error — could not send report.');
        } finally {
            setSendingReport(false);
        }
    };

    return (
        <button
            id="send-whatsapp-report-btn"
            type="button"
            onClick={handleSendReport}
            disabled={sendingReport}
            title="Send daily performance report to WhatsApp"
            className="flex h-10 items-center gap-2 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-green-600 dark:hover:bg-green-500"
        >
            {sendingReport ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <MessageCircle className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{sendingReport ? 'Sending…' : 'Send Report'}</span>
        </button>
    );
}
