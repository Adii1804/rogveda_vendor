require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];

for (const key of required) {
    if (!process.env[key]) {
        console.error(`[env] Missing required environment variable: ${key}`);
        // Don't call process.exit() — it kills Vercel serverless functions.
        // The app will fail loudly on first use instead.
    }
}

module.exports = {
    port: parseInt(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL,
    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    },
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
    urls: {
        vendor: process.env.VENDOR_PORTAL_URL || 'http://localhost:5174',
        admin: process.env.ADMIN_PORTAL_URL || 'http://localhost:5173',
        public: process.env.PUBLIC_URL || 'http://localhost:5175',
    },
    recaptcha: {
        secretKey: process.env.RECAPTCHA_SECRET_KEY || '',
        // Set to true to skip verification in local dev when key is not configured
        skip: process.env.RECAPTCHA_SKIP === 'true' || !process.env.RECAPTCHA_SECRET_KEY,
    },
    email: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@rogveda.com',
    },
};
