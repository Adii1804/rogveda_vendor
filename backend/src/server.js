const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const pool = require('./db/pool');
const { error: errorFn } = require('./utils/response');

const authRoutes = require('./modules/auth/auth.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const publicRoutes = require('./modules/public/public.routes');
const vendorRoutes = require('./modules/vendor/vendor.routes');

const app = express();

app.use(helmet());

app.use(
    cors({
        origin: env.allowedOrigins,
        credentials: true,
    })
);

app.use(express.json({ limit: '1mb' }));

app.use(
    '/auth',
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        message: { success: false, error: 'Too many requests. Try again in 15 minutes.' },
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => env.nodeEnv === 'development',
    })
);

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ success: true, data: { status: 'ok', db: 'connected' } });
    } catch (err) {
        console.error('[health] DB error:', err.message);
        res.status(503).json({ success: false, error: 'Database unavailable' });
    }
});

app.use('/auth', authRoutes);
app.use('/public', publicRoutes);
app.use('/vendor', vendorRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
    errorFn(res, 'Route not found', 404);
});

app.use((err, req, res, next) => {
    console.error(err);
    errorFn(res, 'Internal server error', 500);
});

// Start server only when run directly (not when imported by Vercel serverless)
if (require.main === module) {
    app.listen(env.port, () => {
        console.log(`Server running on port ${env.port} [${env.nodeEnv}]`);
    });
}

module.exports = app;
