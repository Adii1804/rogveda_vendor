const pool = require('../../../db/pool');
const { ok, error } = require('../../../utils/response');
const { hash, generateTemp } = require('../../../utils/password');
const { sendVendorCredentials } = require('../../../utils/email');

const sendVendorCredentialsEmail = async (req, res) => {
    const vendorId = req.params.id;

    const { rows } = await pool.query(
        `SELECT u.id as user_id, u.email, u.login_id, u.temp_password_plain, v.facility_name
         FROM vendors v
         JOIN users u ON u.id = v.user_id
         WHERE v.id = $1 AND u.account_type = 'vendor_primary'`,
        [vendorId]
    );

    if (!rows.length) return error(res, 'Vendor not found', 404);

    const row = rows[0];
    let plain = row.temp_password_plain;

    if (!plain || !/^\d{6}$/.test(plain)) {
        plain = generateTemp();
        const passwordHash = await hash(plain);
        await pool.query(
            `UPDATE users SET
                password_hash = $1,
                temp_password_plain = $2,
                password_reset_required = TRUE,
                failed_login_attempts = 0,
                locked_until = NULL,
                updated_at = NOW()
             WHERE id = $3`,
            [passwordHash, plain, row.user_id]
        );
        await pool.query(
            `INSERT INTO user_password_history (user_id, password_hash) VALUES ($1, $2)`,
            [row.user_id, passwordHash]
        );
    }

    await sendVendorCredentials({
        email: row.email,
        loginId: row.login_id,
        tempPassword: plain,
        facilityName: row.facility_name,
    });

    return ok(res, { message: 'Credentials email sent.' });
};

module.exports = { sendVendorCredentialsEmail };
