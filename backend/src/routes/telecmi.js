import { Router } from 'express';

const router = Router();

/**
 * POST /telecmi/webhook
 * Receives Call Detail Records (CDR) from TeleCMI when a call ends.
 * Phase 1: Log only — so we can inspect the real payload before building the pipeline.
 */
router.post('/webhook', async (req, res) => {
    // Always return 200 immediately — TeleCMI will keep retrying on non-200
    res.status(200).json({ received: true });

    // Log the full payload to Cloud Run logs
    const payload = req.body;

    console.log('📞 TeleCMI CDR received:', JSON.stringify({
        timestamp: new Date().toISOString(),
        headers: {
            'content-type': req.headers['content-type'],
            'user-agent': req.headers['user-agent'],
            'x-forwarded-for': req.headers['x-forwarded-for'],
        },
        body: payload
    }, null, 2));

    // Summary line for quick scanning in logs
    const cmiuid   = payload?.cmiuid   || payload?.uid      || 'unknown';
    const agent    = payload?.agent    || payload?.agentid   || 'unknown';
    const from     = payload?.from     || payload?.caller    || 'unknown';
    const duration = payload?.duration || payload?.dur       || 0;
    const filename = payload?.filename || payload?.file      || null;
    const recorded = payload?.record   || payload?.recording || 'false';

    console.log(`📞 TeleCMI summary | cmiuid=${cmiuid} | agent=${agent} | from=${from} | duration=${duration}s | recorded=${recorded} | filename=${filename}`);
});

export default router;
