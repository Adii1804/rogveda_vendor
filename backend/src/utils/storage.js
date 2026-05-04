const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

let supabase;

const getClient = () => {
    if (!supabase) {
        supabase = createClient(env.supabaseUrl, env.supabaseServiceKey);
    }
    return supabase;
};

const KYC_BUCKET = 'kyc-documents';

const uploadFacilityPhoto = async ({ vendorId, fileBuffer, mimeType, originalName }) => {
    const ext = (originalName.split('.').pop() || 'jpg').toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const storagePath = `facility-photos/${vendorId}/${id}.${safeExt}`;

    const { error } = await getClient().storage.from(KYC_BUCKET).upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
    });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    return storagePath;
};

const uploadKycDocument = async ({ vendorId, documentId, fileBuffer, mimeType, originalName }) => {
    const ext = originalName.split('.').pop();
    const storagePath = `${vendorId}/${documentId}.${ext}`;

    const { error } = await getClient().storage.from(KYC_BUCKET).upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
    });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    return storagePath;
};

const getSignedUrl = async (storagePath, expiresInSeconds = 3600) => {
    const { data, error } = await getClient()
        .storage.from(KYC_BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);

    if (error) throw new Error(`Could not generate signed URL: ${error.message}`);
    return data.signedUrl;
};

module.exports = { uploadKycDocument, uploadFacilityPhoto, getSignedUrl };
