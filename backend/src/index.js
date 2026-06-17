import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Queue + retry imports
import { proQueue, flashQueue } from './services/queues.js';
import { startAutoRetry } from './services/autoRetry.js';
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
import queueRoutes from './routes/queue.js';

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
        vertexQueue: {
            pro:   proQueue.getQueueStats(),
            flash: flashQueue.getQueueStats(),
        }
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
app.use('/admin/queue', queueRoutes);

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

    // On every startup, reset any tickets left stuck at 'processing' from a previous
    // revision or crash. They will be picked up by autoRetry on the next cycle.
    supabaseAdmin
        .from('tickets')
        .update({ status: 'analysis_failed', analysiserror: 'Reset on startup: previous revision left ticket in-flight' })
        .eq('status', 'processing')
        .eq('source', 'telecmi')
        .lt('analysis_started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .then(({ data, error }) => {
            if (error) console.warn('Startup cleanup: failed to reset stuck tickets:', error.message);
            else if (data?.length) console.log(`Startup cleanup: reset ${data.length} stuck processing ticket(s) → analysis_failed`);
        });

    startAutoRetry();
});

export default app;
