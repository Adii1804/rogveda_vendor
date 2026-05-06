const db = require('../../../db/index');
const { vendors } = require('../../../db/schema');
const { eq, and, sql } = require('drizzle-orm');
const { ok, error } = require('../../../utils/response');
const { uploadFacilityPhoto, getSignedUrl } = require('../../../utils/storage');

const getProfile = async (req, res) => {
    const result = await db.execute(
        sql`SELECT v.id, v.facility_name, v.city, v.full_address, v.description,
                   v.contact_email, v.contact_mobile, v.website_url, v.facility_photo_urls,
                   v.profile_status, v.profile_submitted_at, v.profile_rejection_reason,
                   v.kyc_status, v.service_category_id, sc.name as category_name, sc.slug as category_slug,
                   u.email, u.login_id
            FROM vendors v
            JOIN users u ON u.id = v.user_id
            JOIN service_categories sc ON sc.id = v.service_category_id
            WHERE v.user_id = ${req.user.user_id}`
    );
    if (!result.rows.length) return error(res, 'Vendor profile not found', 404);

    const row = result.rows[0];
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
    const vendorRows = await db
        .select({
            id: vendors.id,
            kycStatus: vendors.kycStatus,
            profileStatus: vendors.profileStatus,
        })
        .from(vendors)
        .where(eq(vendors.userId, req.user.user_id));
    if (!vendorRows.length) return error(res, 'Vendor profile not found', 404);

    const vendor = vendorRows[0];

    if (vendor.kycStatus !== 'complete') {
        return error(res, 'Profile setup is only available after KYC is complete');
    }

    if (vendor.profileStatus === 'under_review') {
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
    const fieldMap = {
        facility_name: 'facilityName',
        city: 'city',
        full_address: 'fullAddress',
        description: 'description',
        contact_email: 'contactEmail',
        contact_mobile: 'contactMobile',
        website_url: 'websiteUrl',
    };

    if (req.body.description !== undefined && String(req.body.description).length > 1000) {
        return error(res, 'Description must be at most 1000 characters');
    }

    const setValues = {};
    for (const key of allowed) {
        if (req.body[key] !== undefined) {
            setValues[fieldMap[key]] = req.body[key];
        }
    }

    if (req.body.facility_photo_urls !== undefined) {
        const arr = Array.isArray(req.body.facility_photo_urls)
            ? req.body.facility_photo_urls
            : [];
        if (arr.length > 10) return error(res, 'Maximum 10 facility photos allowed');
        setValues.facilityPhotoUrls = arr;
    }

    if (!Object.keys(setValues).length) return error(res, 'No valid fields to update');

    setValues.updatedAt = new Date();

    const rows = await db
        .update(vendors)
        .set(setValues)
        .where(eq(vendors.id, vendor.id))
        .returning({
            facilityName: vendors.facilityName,
            city: vendors.city,
            fullAddress: vendors.fullAddress,
            description: vendors.description,
            contactEmail: vendors.contactEmail,
            contactMobile: vendors.contactMobile,
            websiteUrl: vendors.websiteUrl,
            facilityPhotoUrls: vendors.facilityPhotoUrls,
            profileStatus: vendors.profileStatus,
        });

    return ok(res, rows[0]);
};

const uploadProfilePhoto = async (req, res) => {
    if (!req.file) return error(res, 'File is required');

    const vendorRows = await db
        .select({
            id: vendors.id,
            kycStatus: vendors.kycStatus,
            profileStatus: vendors.profileStatus,
            facilityPhotoUrls: vendors.facilityPhotoUrls,
        })
        .from(vendors)
        .where(eq(vendors.userId, req.user.user_id));
    if (!vendorRows.length) return error(res, 'Vendor profile not found', 404);

    const vendor = vendorRows[0];

    if (vendor.kycStatus !== 'complete') {
        return error(res, 'Profile setup is only available after KYC is complete');
    }
    if (vendor.profileStatus === 'under_review') {
        return error(res, 'Profile is currently under review and cannot be edited');
    }

    let paths = vendor.facilityPhotoUrls;
    if (!Array.isArray(paths)) {
        try {
            paths = JSON.parse(paths || '[]');
        } catch {
            paths = [];
        }
    }
    if (paths.length >= 10) return error(res, 'Maximum 10 facility photos allowed');

    const storagePath = await uploadFacilityPhoto({
        vendorId: vendor.id,
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
    });

    paths.push(storagePath);

    await db
        .update(vendors)
        .set({ facilityPhotoUrls: paths, updatedAt: new Date() })
        .where(eq(vendors.id, vendor.id));

    let signed_url = null;
    try {
        signed_url = await getSignedUrl(storagePath);
    } catch {
        /* ignore */
    }

    return ok(res, { storage_path: storagePath, signed_url, facility_photo_urls: paths });
};

const submitProfile = async (req, res) => {
    const vendorRows = await db
        .select({
            id: vendors.id,
            kycStatus: vendors.kycStatus,
            profileStatus: vendors.profileStatus,
            facilityName: vendors.facilityName,
            city: vendors.city,
            description: vendors.description,
            contactEmail: vendors.contactEmail,
            contactMobile: vendors.contactMobile,
        })
        .from(vendors)
        .where(eq(vendors.userId, req.user.user_id));
    if (!vendorRows.length) return error(res, 'Vendor profile not found', 404);

    const vendor = vendorRows[0];

    if (vendor.kycStatus !== 'complete') {
        return error(res, 'KYC must be complete before submitting profile');
    }

    if (vendor.profileStatus === 'under_review') {
        return error(res, 'Profile is already under review');
    }
    if (vendor.profileStatus === 'approved') {
        return error(res, 'Profile is already approved. Edit fields first, then resubmit.');
    }

    const required = {
        facilityName: 'Facility Name',
        city: 'City',
        description: 'About/Description',
        contactEmail: 'Contact Email',
        contactMobile: 'Contact Mobile',
    };
    const missing = Object.entries(required)
        .filter(([k]) => !vendor[k])
        .map(([, label]) => label);
    if (missing.length) {
        return error(res, `Please complete all required profile fields: ${missing.join(', ')}`);
    }

    const rows = await db
        .update(vendors)
        .set({
            profileStatus: 'under_review',
            profileSubmittedAt: new Date(),
            profileRejectionReason: null,
            updatedAt: new Date(),
        })
        .where(eq(vendors.id, vendor.id))
        .returning({
            id: vendors.id,
            profileStatus: vendors.profileStatus,
            profileSubmittedAt: vendors.profileSubmittedAt,
        });

    return ok(res, {
        ...rows[0],
        message: 'Profile submitted for review. You will be notified once reviewed.',
    });
};

module.exports = { getProfile, updateProfile, uploadProfilePhoto, submitProfile };
