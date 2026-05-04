require('dotenv').config();
const http = require('http');

const BASE = 'http://localhost:3000';
let TOKEN = '';
let VENDOR_ID = '';
let VENDOR_USER_ID = '';
let LEAD_ID = '';
let DOC_ID = '';

let passed = 0;
let failed = 0;

// ─── HTTP helper ────────────────────────────────────────────────────────────

function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port: 3000,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { Authorization: `Bearer ${token}` }),
                ...(data && { 'Content-Length': Buffer.byteLength(data) }),
            },
        };

        const req = http.request(options, (res) => {
            let raw = '';
            res.on('data', (chunk) => (raw += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(raw) });
                } catch {
                    resolve({ status: res.statusCode, body: raw });
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// ─── Test runner ─────────────────────────────────────────────────────────────

async function test(label, fn) {
    try {
        await fn();
        console.log(`  ✅  ${label}`);
        passed++;
    } catch (err) {
        console.log(`  ❌  ${label}`);
        console.log(`       → ${err.message}`);
        failed++;
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function run() {
    console.log('\n══════════════════════════════════════════');
    console.log('  ROGVEDA BACKEND — API TEST SUITE');
    console.log('══════════════════════════════════════════\n');

    // ── HEALTH ──────────────────────────────────────────────────────────────
    console.log('▸ Health');

    await test('GET /health → db connected', async () => {
        const r = await request('GET', '/health');
        assert(r.status === 200, `Expected 200, got ${r.status}`);
        assert(r.body.data.db === 'connected', 'DB not connected');
    });

    // ── AUTH ─────────────────────────────────────────────────────────────────
    console.log('\n▸ Auth');

    await test('POST /auth/login → rejects wrong password', async () => {
        const r = await request('POST', '/auth/login', {
            identifier: 'admin@rogveda.com',
            password: 'wrongpassword',
        });
        assert(r.status === 401, `Expected 401, got ${r.status}`);
        assert(r.body.success === false, 'Expected failure');
    });

    await test('POST /auth/login → rejects unknown user', async () => {
        const r = await request('POST', '/auth/login', {
            identifier: 'nobody@rogveda.com',
            password: 'anything',
        });
        assert(r.status === 401, `Expected 401, got ${r.status}`);
    });

    await test('POST /auth/login → succeeds with email', async () => {
        const r = await request('POST', '/auth/login', {
            identifier: 'admin@rogveda.com',
            password: 'Admin@1234',
        });
        assert(r.status === 200, `Expected 200, got ${r.status} — ${JSON.stringify(r.body)}`);
        assert(r.body.data.token, 'No token returned');
        TOKEN = r.body.data.token;
    });

    await test('POST /auth/login → succeeds with login ID', async () => {
        const r = await request('POST', '/auth/login', {
            identifier: 'SYSADMIN01',
            password: 'Admin@1234',
        });
        assert(r.status === 200, `Expected 200, got ${r.status}`);
        assert(r.body.data.token, 'No token returned');
    });

    await test('POST /auth/login → rejects missing fields', async () => {
        const r = await request('POST', '/auth/login', { identifier: 'admin@rogveda.com' });
        assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('POST /auth/change-password → rejects without auth', async () => {
        const r = await request('POST', '/auth/change-password', {
            current_password: 'Admin@1234',
            new_password: 'NewPass@99',
        });
        assert(r.status === 401, `Expected 401, got ${r.status}`);
    });

    await test('POST /auth/change-password → rejects reused password', async () => {
        const r = await request(
            'POST',
            '/auth/change-password',
            { current_password: 'Admin@1234', new_password: 'Admin@1234' },
            TOKEN
        );
        assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    // ── ADMIN — no auth ──────────────────────────────────────────────────────
    console.log('\n▸ Admin — auth protection');

    await test('GET /admin/dashboard → rejects without token', async () => {
        const r = await request('GET', '/admin/dashboard');
        assert(r.status === 401, `Expected 401, got ${r.status}`);
    });

    await test('GET /admin/leads → rejects without token', async () => {
        const r = await request('GET', '/admin/leads');
        assert(r.status === 401, `Expected 401, got ${r.status}`);
    });

    // ── DASHBOARD ────────────────────────────────────────────────────────────
    console.log('\n▸ Dashboard');

    await test('GET /admin/dashboard → returns counts', async () => {
        const r = await request('GET', '/admin/dashboard', null, TOKEN);
        assert(r.status === 200, `Expected 200, got ${r.status}`);
        assert(typeof r.body.data.leads === 'object', 'Missing leads counts');
        assert(typeof r.body.data.vendors === 'object', 'Missing vendors counts');
        assert(
            typeof r.body.data.pending_kyc_documents === 'number',
            'Missing pending_kyc_documents'
        );
    });

    // ── LEADS ────────────────────────────────────────────────────────────────
    console.log('\n▸ Leads');

    await test('GET /admin/leads → returns list', async () => {
        const r = await request('GET', '/admin/leads', null, TOKEN);
        assert(r.status === 200, `Expected 200, got ${r.status}`);
        assert(Array.isArray(r.body.data.leads), 'leads should be an array');
        assert(typeof r.body.data.total === 'number', 'total should be a number');
    });

    await test('GET /admin/leads?status=new → filters by status', async () => {
        const r = await request('GET', '/admin/leads?status=new', null, TOKEN);
        assert(r.status === 200, `Expected 200, got ${r.status}`);
    });

    await test('GET /admin/leads?status=invalid → rejects bad status', async () => {
        const r = await request('GET', '/admin/leads?status=invalid', null, TOKEN);
        assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('GET /admin/leads/:id → 404 for unknown lead', async () => {
        const r = await request(
            'GET',
            '/admin/leads/00000000-0000-0000-0000-000000000000',
            null,
            TOKEN
        );
        assert(r.status === 404, `Expected 404, got ${r.status}`);
    });

    // ── VENDORS ──────────────────────────────────────────────────────────────
    console.log('\n▸ Vendors');

    await test('GET /admin/vendors → returns list', async () => {
        const r = await request('GET', '/admin/vendors', null, TOKEN);
        assert(r.status === 200, `Expected 200, got ${r.status}`);
        assert(Array.isArray(r.body.data.vendors), 'vendors should be an array');
    });

    await test('POST /admin/vendors → rejects missing fields', async () => {
        const r = await request('POST', '/admin/vendors', { email: 'test@test.com' }, TOKEN);
        assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('POST /admin/vendors → rejects invalid category', async () => {
        const r = await request(
            'POST',
            '/admin/vendors',
            {
                email: 'vendor1@test.com',
                service_category_id: '00000000-0000-0000-0000-000000000000',
            },
            TOKEN
        );
        assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('POST /admin/vendors → creates vendor account', async () => {
        // Get a valid category ID first
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
        const { rows } = await pool.query(
            `SELECT id FROM service_categories WHERE slug = 'medical' LIMIT 1`
        );
        await pool.end();

        const r = await request(
            'POST',
            '/admin/vendors',
            {
                email: 'testvendor@rogveda.com',
                mobile_number: '9876543210',
                service_category_id: rows[0].id,
                facility_name: 'Apollo Test Hospital',
            },
            TOKEN
        );

        assert(r.status === 201, `Expected 201, got ${r.status} — ${JSON.stringify(r.body)}`);
        assert(r.body.data.login_id, 'No login_id returned');
        assert(r.body.data.temp_password, 'No temp_password returned');
        assert(/^\d{6}$/.test(r.body.data.temp_password), 'Temp password must be 6-digit numeric');
        assert(r.body.data.login_id === '9876543210', 'Login ID must default to mobile number');

        VENDOR_ID = r.body.data.vendor_id;
        VENDOR_USER_ID = r.body.data.user_id;
    });

    await test('POST /admin/vendors → rejects duplicate email', async () => {
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
        const { rows } = await pool.query(
            `SELECT id FROM service_categories WHERE slug = 'medical' LIMIT 1`
        );
        await pool.end();

        const r = await request(
            'POST',
            '/admin/vendors',
            {
                email: 'testvendor@rogveda.com',
                mobile_number: '9876543210',
                service_category_id: rows[0].id,
            },
            TOKEN
        );
        assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('GET /admin/vendors/:id → returns vendor with KYC docs', async () => {
        const r = await request('GET', `/admin/vendors/${VENDOR_ID}`, null, TOKEN);
        assert(r.status === 200, `Expected 200, got ${r.status}`);
        assert(r.body.data.email, 'Missing email');
        assert(Array.isArray(r.body.data.kyc_documents), 'Missing kyc_documents array');
    });

    await test('GET /admin/vendors/invalid-id → 404', async () => {
        const r = await request(
            'GET',
            '/admin/vendors/00000000-0000-0000-0000-000000000000',
            null,
            TOKEN
        );
        assert(r.status === 404, `Expected 404, got ${r.status}`);
    });

    // ── KYC ──────────────────────────────────────────────────────────────────
    console.log('\n▸ KYC');

    await test('GET /admin/kyc/queue → returns queue', async () => {
        const r = await request('GET', '/admin/kyc/queue', null, TOKEN);
        assert(r.status === 200, `Expected 200, got ${r.status}`);
        assert(Array.isArray(r.body.data.documents), 'documents should be an array');
    });

    await test('PUT /admin/kyc/documents/:id → rejects missing action', async () => {
        const r = await request(
            'PUT',
            '/admin/kyc/documents/00000000-0000-0000-0000-000000000000',
            {},
            TOKEN
        );
        assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('PUT /admin/kyc/documents/:id → rejects rejection without reason', async () => {
        const r = await request(
            'PUT',
            '/admin/kyc/documents/00000000-0000-0000-0000-000000000000',
            { action: 'rejected' },
            TOKEN
        );
        assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('PUT /admin/kyc/documents/:id → 404 for unknown doc', async () => {
        const r = await request(
            'PUT',
            '/admin/kyc/documents/00000000-0000-0000-0000-000000000000',
            { action: 'approved' },
            TOKEN
        );
        assert(r.status === 404, `Expected 404, got ${r.status}`);
    });

    // ── PROFILE ──────────────────────────────────────────────────────────────
    console.log('\n▸ Profile');

    await test('PUT /admin/vendors/:id/profile → rejects missing action', async () => {
        const r = await request('PUT', `/admin/vendors/${VENDOR_ID}/profile`, {}, TOKEN);
        assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('PUT /admin/vendors/:id/profile → rejects when not under_review', async () => {
        const r = await request(
            'PUT',
            `/admin/vendors/${VENDOR_ID}/profile`,
            { action: 'approved' },
            TOKEN
        );
        assert(r.status === 400, `Expected 400, got ${r.status}`);
    });

    await test('PUT /admin/vendors/invalid/profile → 404', async () => {
        const r = await request(
            'PUT',
            '/admin/vendors/00000000-0000-0000-0000-000000000000/profile',
            { action: 'approved' },
            TOKEN
        );
        assert(r.status === 404, `Expected 404, got ${r.status}`);
    });

    // ── LOGOUT ───────────────────────────────────────────────────────────────
    console.log('\n▸ Logout');

    await test('POST /auth/logout → revokes session', async () => {
        const r = await request('POST', '/auth/logout', null, TOKEN);
        assert(r.status === 200, `Expected 200, got ${r.status}`);
    });

    await test('GET /admin/dashboard → rejects revoked token', async () => {
        const r = await request('GET', '/admin/dashboard', null, TOKEN);
        assert(r.status === 401, `Expected 401, got ${r.status}`);
    });

    // ── SUMMARY ──────────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log(`  ${passed} passed   ${failed} failed   ${passed + failed} total`);
    console.log('══════════════════════════════════════════\n');

    // Cleanup test vendor
    if (VENDOR_USER_ID) {
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
        await pool.query(`DELETE FROM users WHERE id = $1`, [VENDOR_USER_ID]);
        await pool.end();
        console.log('  🧹 Test vendor cleaned up\n');
    }

    if (failed > 0) process.exit(1);
}

run().catch((err) => {
    console.error('\n💥 Test runner crashed:', err.message);
    process.exit(1);
});
