const {
    pgTable,
    uuid,
    text,
    varchar,
    boolean,
    integer,
    timestamp,
    jsonb,
    serial,
} = require('drizzle-orm/pg-core');

// ─── users ────────────────────────────────────────────────────────────────────
const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    accountType: varchar('account_type', { length: 50 }).notNull(),
    loginId: varchar('login_id', { length: 100 }),
    email: varchar('email', { length: 255 }).notNull(),
    mobileNumber: varchar('mobile_number', { length: 20 }),
    passwordHash: text('password_hash'),
    tempPasswordPlain: varchar('temp_password_plain', { length: 20 }),
    status: varchar('status', { length: 30 }).default('active'),
    failedLoginAttempts: integer('failed_login_attempts').default(0),
    lockedUntil: timestamp('locked_until'),
    passwordResetRequired: boolean('password_reset_required').default(false),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── sessions ─────────────────────────────────────────────────────────────────
const sessions = pgTable('sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    jti: uuid('jti').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ─── otp_requests ─────────────────────────────────────────────────────────────
const otpRequests = pgTable('otp_requests', {
    id: serial('id').primaryKey(),
    identifier: varchar('identifier', { length: 255 }).notNull(),
    otpType: varchar('otp_type', { length: 50 }).notNull(),
    otpHash: text('otp_hash').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    supersededAt: timestamp('superseded_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ─── service_categories ───────────────────────────────────────────────────────
const serviceCategories = pgTable('service_categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }),
    description: text('description'),
    isActive: boolean('is_active').default(true),
    displayOrder: integer('display_order').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── vendors ──────────────────────────────────────────────────────────────────
const vendors = pgTable('vendors', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    serviceCategoryId: uuid('service_category_id').notNull(),
    facilityName: varchar('facility_name', { length: 255 }),
    city: varchar('city', { length: 100 }),
    fullAddress: text('full_address'),
    description: text('description'),
    contactEmail: varchar('contact_email', { length: 255 }),
    contactMobile: varchar('contact_mobile', { length: 20 }),
    websiteUrl: varchar('website_url', { length: 500 }),
    facilityPhotoUrls: jsonb('facility_photo_urls'),
    kycStatus: varchar('kyc_status', { length: 30 }).default('pending'),
    kycCompletedAt: timestamp('kyc_completed_at'),
    profileStatus: varchar('profile_status', { length: 30 }).default('pending'),
    profileSubmittedAt: timestamp('profile_submitted_at'),
    profileApprovedBy: uuid('profile_approved_by'),
    profileApprovedAt: timestamp('profile_approved_at'),
    profileRejectionReason: text('profile_rejection_reason'),
    deactivationRequested: boolean('deactivation_requested').default(false),
    deactivationReason: text('deactivation_reason'),
    deactivationRequestedAt: timestamp('deactivation_requested_at'),
    deactivationAdminFeedback: text('deactivation_admin_feedback'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── vendor_leads ─────────────────────────────────────────────────────────────
const vendorLeads = pgTable('vendor_leads', {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    emailVerified: boolean('email_verified').default(false),
    status: varchar('status', { length: 30 }).default('new'),
    notes: text('notes'),
    callbackReminderAt: timestamp('callback_reminder_at'),
    isDuplicate: boolean('is_duplicate').default(false),
    duplicateOf: uuid('duplicate_of'),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── user_password_history ────────────────────────────────────────────────────
const userPasswordHistory = pgTable('user_password_history', {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// ─── vendor_kyc_checklists ────────────────────────────────────────────────────
const vendorKycChecklists = pgTable('vendor_kyc_checklists', {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceCategoryId: uuid('service_category_id').notNull(),
    documentName: varchar('document_name', { length: 255 }).notNull(),
    instructions: text('instructions'),
    isMandatory: boolean('is_mandatory').default(true),
    hasRenewal: boolean('has_renewal').default(false),
    isActive: boolean('is_active').default(true),
    displayOrder: integer('display_order').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── vendor_kyc_documents ─────────────────────────────────────────────────────
const vendorKycDocuments = pgTable('vendor_kyc_documents', {
    id: uuid('id').primaryKey(),
    vendorId: uuid('vendor_id').notNull(),
    checklistItemId: uuid('checklist_item_id').notNull(),
    originalFileName: varchar('original_file_name', { length: 255 }),
    storagePath: text('storage_path'),
    fileSizeBytes: integer('file_size_bytes'),
    mimeType: varchar('mime_type', { length: 100 }),
    status: varchar('status', { length: 30 }).default('uploaded'),
    rejectionReason: text('rejection_reason'),
    renewalDate: timestamp('renewal_date'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    uploadedAt: timestamp('uploaded_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── lead_notes ───────────────────────────────────────────────────────────────
const leadNotes = pgTable('lead_notes', {
    id: uuid('id').defaultRandom().primaryKey(),
    leadId: uuid('lead_id').notNull(),
    note: text('note').notNull(),
    statusAtTime: varchar('status_at_time', { length: 30 }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').defaultNow(),
});

// ─── vendor_notifications ─────────────────────────────────────────────────────
const vendorNotifications = pgTable('vendor_notifications', {
    id: uuid('id').defaultRandom().primaryKey(),
    vendorId: uuid('vendor_id').notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

module.exports = {
    users,
    sessions,
    otpRequests,
    serviceCategories,
    vendors,
    vendorLeads,
    leadNotes,
    userPasswordHistory,
    vendorKycChecklists,
    vendorKycDocuments,
    vendorNotifications,
};
