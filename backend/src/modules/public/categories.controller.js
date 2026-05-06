const db = require('../../db/index');
const { serviceCategories } = require('../../db/schema');
const { eq, asc, sql } = require('drizzle-orm');
const { ok } = require('../../utils/response');

const getCategories = async (req, res) => {
    const result = await db.execute(
        sql`SELECT id, name, slug, description FROM service_categories WHERE is_active = TRUE ORDER BY display_order, name`
    );
    return ok(res, { categories: result.rows });
};

module.exports = { getCategories };
