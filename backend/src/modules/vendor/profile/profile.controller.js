const pool = require('../../../db/pool');
const { ok, error } = require('../../../utils/response');
const { uploadFacilityPhoto, getSignedUrl } = require('../../../utils/storage');

const getProfile = async (req, res) => {
    const { rows } = await pool.query(
        `SELECT v.id, v.facility_name, v.city, v.full_address, v.description,
                v.contact_email, v.contact_mobile, v.website_url, v.facility_photo_urls,
                v.profile_status, v.profile_submitted_at, v.profile_rejection_reason,
                v.kyc_status, v.service_category_id, sc.name as category_name, sc.slug as category_slug,
                u.email, u.login_id
         FROM vendors v
         JOIN users u ON u.id = v.user_id
         JOIN service_categories sc ON sc.id = v.service_category_id
         WHERE v.user_id = $1`,
        [req.user.user_id]
    );
    if (!rows.length) return error(res, 'Vendor profile not found', 404);

    const row = rows[0];
    let paths = row.facility_photo_urls;
    if (!Array.isArray(paths)) {
        try {
            paths = JSON.parse(paths || '[]');
        } catch {
            paths = [];
        }
    }

    const facility_photo_previews = await Promise.all(
        paths.map(async (storagePath) => {
            try {
                const signed_url = await getSignedUrl(storagePath);
                return { storage_path: storagePath, signed_url };
            } catch {
                return { storage_path: storagePath, signed_url: null };
            }
        })
    );

    return ok(res, {
        ...row,
        facility_photo_urls: paths,
        facility_photo_previews,
    });
};

const updateProfile = async (req, res) => {
    const { rows: vendor } = await pool.query(
        `SELECT id, kyc_status, profile_status FROM vendors WHERE user_id = $1`,
        [req.user.user_id]
    );
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    if (vendor[0].kyc_status !== 'complete') {
        return error(res, 'Profile setup is only available after KYC is complete');
    }

    if (vendor[0].profile_status === 'under_review') {
        return error(res, 'Profile is currently under review and cannot be edited');
    }

    const allowed = [
        'facility_name',
        'city',
        'full_address',
        'description',
        'contact_email',
        'contact_mobile',
        'website_url',
    ];
    const updates = [];
    const params = [];

    if (req.body.description !== undefined && String(req.body.description).length > 1000) {
        return error(res, 'Description must be at most 1000 characters');
    }

    for (const key of allowed) {
        if (req.body[key] !== undefined) {
            params.push(req.body[key]);
            updates.push(`${key} = $${params.length}`);
        }
    }

    if (req.body.facility_photo_urls !== undefined) {
        const arr = Array.isArray(req.body.facility_photo_urls)
            ? req.body.facility_photo_urls
            : [];
        if (arr.length > 10) return error(res, 'Maximum 10 facility photos allowed');
        params.push(JSON.stringify(arr));
        updates.push(`facility_photo_urls = $${params.length}::jsonb`);
    }

    if (!updates.length) return error(res, 'No valid fields to update');

    params.push(vendor[0].id);
    const { rows } = await pool.query(
        `UPDATE vendors SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${params.length}
         RETURNING facility_name, city, full_address, description,
                   contact_email, contact_mobile, website_url, facility_photo_urls, profile_status`,
        params
    );

    return ok(res, rows[0]);
};

const uploadProfilePhoto = async (req, res) => {
    if (!req.file) return error(res, 'File is required');

    const { rows: vendor } = await pool.query(
        `SELECT id, kyc_status, profile_status, facility_photo_urls FROM vendors WHERE user_id = $1`,
        [req.user.user_id]
    );
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    if (vendor[0].kyc_status !== 'complete') {
        return error(res, 'Profile setup is only available after KYC is complete');
    }
    if (vendor[0].profile_status === 'under_review') {
        return error(res, 'Profile is currently under review and cannot be edited');
    }

    let paths = vendor[0].facility_photo_urls;
    if (!Array.isArray(paths)) {
        try {
            paths = JSON.parse(paths || '[]');
        } catch {
            paths = [];
        }
    }
    if (paths.length >= 10) return error(res, 'Maximum 10 facility photos allowed');

    const storagePath = await uploadFacilityPhoto({
        vendorId: vendor[0].id,
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
    });

    paths.push(storagePath);

    await pool.query(
        `UPDATE vendors SET facility_photo_urls = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(paths), vendor[0].id]
    );

    let signed_url = null;
    try {
        signed_url = await getSignedUrl(storagePath);
    } catch {
        /* ignore */
    }

    return ok(res, { storage_path: storagePath, signed_url, facility_photo_urls: paths });
};

const submitProfile = async (req, res) => {
    const { rows: vendor } = await pool.query(
        `SELECT id, kyc_status, profile_status, facility_name, city, description, contact_email, contact_mobile
         FROM vendors WHERE user_id = $1`,
        [req.user.user_id]
    );
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    if (vendor[0].kyc_status !== 'complete') {
        return error(res, 'KYC must be complete before submitting profile');
    }

    if (vendor[0].profile_status === 'under_review') {
        return error(res, 'Profile is already under review');
    }
    if (vendor[0].profile_status === 'approved') {
        return error(res, 'Profile is already approved. Edit fields first, then resubmit.');
    }

    const required = {
        facility_name: 'Facility Name',
        city: 'City',
        description: 'About/Description',
        contact_email: 'Contact Email',
        contact_mobile: 'Contact Mobile',
    };
    const missing = Object.entries(required)
        .filter(([k]) => !vendor[0][k])
        .map(([, label]) => label);
    if (missing.length) {
        return error(res, `Please complete all required profile fields: ${missing.join(', ')}`);
    }

    const { rows } = await pool.query(
        `UPDATE vendors SET
            profile_status = 'under_review',
            profile_submitted_at = NOW(),
            profile_rejection_reason = NULL,
            updated_at = NOW()
         WHERE id = $1
         RETURNING id, profile_status, profile_submitted_at`,
        [vendor[0].id]
    );

    return ok(res, {
        ...rows[0],
        message: 'Profile submitted for review. You will be notified once reviewed.',
    });
};

module.exports = { getProfile, updateProfile, uploadProfilePhoto, submitProfile };
