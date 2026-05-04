require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function seedAdmin() {
    const email = 'admin@rogveda.com';
    const password = 'Admin@1234';
    const loginId = 'SYSADMIN01';

    const passwordHash = await bcrypt.hash(password, 12);

    // Remove existing admin with this email first (safe for dev)
    await pool.query(`DELETE FROM users WHERE email = $1`, [email]);

    const { rows } = await pool.query(
        `INSERT INTO users (account_type, login_id, email, password_hash, status, password_reset_required)
         VALUES ('system_admin', $1, $2, $3, 'active', FALSE)
         RETURNING id, email, login_id, account_type`,
        [loginId, email, passwordHash]
    );

    // Save to password history
    await pool.query(`INSERT INTO user_password_history (user_id, password_hash) VALUES ($1, $2)`, [
        rows[0].id,
        passwordHash,
    ]);

    console.log('✅ System Admin created:');
    console.log(`   Email:    ${email}`);
    console.log(`   Login ID: ${loginId}`);
    console.log(`   Password: ${password}`);
    console.log(`   User ID:  ${rows[0].id}`);

    await pool.end();
}

seedAdmin().catch((err) => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
});
