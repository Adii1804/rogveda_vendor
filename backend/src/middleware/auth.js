const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const env = require('../config/env');
const { error } = require('../utils/response');

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return error(res, 'Authentication required', 401);
    }

    const token = authHeader.split(' ')[1];

    let payload;
    try {
        payload = jwt.verify(token, env.jwt.secret);
    } catch {
        return error(res, 'Invalid or expired token', 401);
    }

    const { rows } = await pool.query(
        `SELECT s.id as session_id, s.revoked_at,
                u.id as user_id, u.email, u.login_id, u.account_type,
                u.status, u.password_reset_required
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.jti = $1 AND s.expires_at > NOW()`,
        [payload.jti]
    );

    if (!rows.length || rows[0].revoked_at) {
        return error(res, 'Session expired or revoked', 401);
    }

    const session = rows[0];

    if (session.status !== 'active') {
        return error(res, 'Account is not active. Contact administrator.', 403);
    }

    req.user = session;
    next();
};

module.exports = { authenticate };
