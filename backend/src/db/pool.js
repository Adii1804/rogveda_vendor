const { Pool } = require('pg');
const env = require('../config/env');

// In serverless environments each function instance creates its own pool.
// Keep max=2 to avoid exhausting Supabase free-tier connection limit (60 total).
const pool = new Pool({
    connectionString: env.databaseUrl,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
    console.error('Unexpected database error:', err.message);
});

module.exports = pool;
