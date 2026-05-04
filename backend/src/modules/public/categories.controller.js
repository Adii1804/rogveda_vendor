const pool = require('../../db/pool');
const { ok } = require('../../utils/response');

const getCategories = async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, name, slug, description FROM service_categories WHERE is_active = TRUE ORDER BY display_order, name`
    );
    return ok(res, { categories: rows });
};

module.exports = { getCategories };
