import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const app = express();
app.set('trust proxy', true); // Cloud Run sits behind a load balancer — trust x-forwarded-for
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow localhost in development
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }

        // Allow all Vercel deployments (*.vercel.app)
        if (origin.endsWith('.vercel.app')) {
            return callback(null, true);
        }

        // Check against allowed origins list
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
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
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development'
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
});

export default app;
