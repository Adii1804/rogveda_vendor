const nodemailer = require('nodemailer');
const env = require('../config/env');

// ─── Transport ────────────────────────────────────────────────────────────────

let _transporter = null;

function getTransporter() {
    if (_transporter) return _transporter;

    if (!env.email.user || !env.email.pass) {
        // No SMTP credentials — fall back to console logging in development
        console.warn('[email] SMTP_USER / SMTP_PASS not set. Emails will be logged to console only.');
        return null;
    }

    _transporter = nodemailer.createTransport({
        host: env.email.host,
        port: env.email.port,
        secure: env.email.secure,
        auth: {
            user: env.email.user,
            pass: env.email.pass,
        },
    });

    return _transporter;
}

async function send({ to, subject, html, text }) {
    const transporter = getTransporter();

    if (!transporter) {
        // Dev fallback — print to console
        console.log('──────── EMAIL (console fallback) ─────────');
        console.log(`To:      ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body:    ${text || '(html only)'}`);
        console.log('──────────────────────────────────────────');
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: env.email.from,   // SMTP_FROM already contains the display name, e.g. "Rogveda <user@gmail.com>"
            to,
            subject,
            html,
            text,
        });
        console.log(`[email] Sent to ${to} — messageId: ${info.messageId}`);
    } catch (err) {
        console.error(`[email] Failed to send to ${to}:`, err.message);
        // Don't throw — email failure should never crash an API request
    }
}

// ─── Shared layout ────────────────────────────────────────────────────────────

function layout(title, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:#2563eb;padding:24px 32px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Rogveda</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                © ${new Date().getFullYear()} Rogveda. All rights reserved.<br/>
                This email was sent automatically — please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Email senders ────────────────────────────────────────────────────────────

const sendOtp = async ({ email, otp, type }) => {
    const configs = {
        vendor_lead_verification: {
            subject: 'Verify your email — Rogveda',
            heading: 'Verify your email address',
            intro: 'Use the code below to verify your email and complete your interest submission.',
            note: 'This code expires in <strong>10 minutes</strong>.',
        },
        password_reset: {
            subject: 'Reset your password — Rogveda',
            heading: 'Password reset request',
            intro: 'Use the code below to reset your Rogveda vendor account password.',
            note: 'This code expires in <strong>10 minutes</strong>. If you did not request this, you can safely ignore this email.',
        },
        account_unlock: {
            subject: 'Unlock your account — Rogveda',
            heading: 'Unlock your account',
            intro: 'Use the code below to unlock your Rogveda vendor account.',
            note: 'This code expires in <strong>10 minutes</strong>.',
        },
    };

    const cfg = configs[type] || {
        subject: 'Your OTP — Rogveda',
        heading: 'Your one-time code',
        intro: 'Use the code below to proceed.',
        note: 'This code expires in <strong>10 minutes</strong>.',
    };

    const html = layout(cfg.subject, `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">${cfg.heading}</h2>
        <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">${cfg.intro}</p>

        <div style="background:#f0f4ff;border-radius:8px;padding:24px;text-align:center;margin:0 0 24px;">
            <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#2563eb;">${otp}</span>
        </div>

        <p style="margin:0;font-size:13px;color:#9ca3af;">${cfg.note}</p>
    `);

    await send({
        to: email,
        subject: cfg.subject,
        html,
        text: `Your Rogveda OTP is: ${otp}. It expires in 10 minutes.`,
    });
};

const sendLeadConfirmation = async ({ email }) => {
    const subject = 'We received your interest — Rogveda';
    const html = layout(subject, `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Thank you for your interest!</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            We've received your submission and our team will review it shortly.
        </p>
        <p style="margin:0 0 24px;font-size:15px;color:#374151;">
            A Rogveda representative will contact you at <strong>${email}</strong> within
            <strong>24–48 hours</strong> to discuss the next steps.
        </p>
        <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;padding:12px 16px;margin:0 0 24px;">
            <p style="margin:0;font-size:14px;color:#166534;">
                Once approved, you will receive your login credentials to complete your vendor profile and KYC.
            </p>
        </div>
        <p style="margin:0;font-size:13px;color:#9ca3af;">
            If you have questions, reply to this email or contact us at support@rogveda.com.
        </p>
    `);

    await send({
        to: email,
        subject,
        html,
        text: `Thank you for your interest in Rogveda. Our team will contact you within 24-48 hours.`,
    });
};

const sendVendorCredentials = async ({ email, loginId, tempPassword, facilityName }) => {
    const subject = 'Your Rogveda vendor account is ready';
    const html = layout(subject, `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Your account is ready</h2>
        <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
            ${facilityName ? `Welcome, <strong>${facilityName}</strong>!` : 'Welcome!'} Your Rogveda vendor account has been activated.
            Use the credentials below to log in.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin:0 0 24px;">
            <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Login ID</p>
                    <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#111827;letter-spacing:2px;">${loginId}</p>
                </td>
            </tr>
            <tr>
                <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Temporary Password</p>
                    <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#111827;letter-spacing:2px;">${tempPassword}</p>
                </td>
            </tr>
        </table>

        <div style="text-align:center;margin:0 0 24px;">
            <a href="${env.urls.vendor}"
               style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">
                Log in to Rogveda Vendor
            </a>
        </div>

        <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#92400e;">
                <strong>Important:</strong> You will be asked to set a new password on your first login.
                Keep these credentials safe and do not share them.
            </p>
        </div>
    `);

    await send({
        to: email,
        subject,
        html,
        text: `Your Rogveda vendor account is ready.\n\nLogin ID: ${loginId}\nTemporary Password: ${tempPassword}\n\nLog in at: ${env.urls.vendor}\n\nYou will be asked to set a new password on first login.`,
    });
};

// ─── Generic notification email (auto-sent for every insertVendorNotification) ──

// Maps notification type → accent colour so each email feels contextual
const NOTIFICATION_COLORS = {
    kyc_doc_rejected:        { border: '#ef4444', bg: '#fef2f2', text: '#991b1b' },
    kyc_complete:            { border: '#22c55e', bg: '#f0fdf4', text: '#166534' },
    profile_approved:        { border: '#22c55e', bg: '#f0fdf4', text: '#166534' },
    profile_rejected:        { border: '#ef4444', bg: '#fef2f2', text: '#991b1b' },
    account_deactivated:     { border: '#f59e0b', bg: '#fffbeb', text: '#92400e' },
    deactivation_rejected:   { border: '#ef4444', bg: '#fef2f2', text: '#991b1b' },
    kyc_under_review:        { border: '#3b82f6', bg: '#eff6ff', text: '#1e40af' },
};
const DEFAULT_COLOR = { border: '#2563eb', bg: '#eff6ff', text: '#1e40af' };

const sendNotificationEmail = async ({ email, title, body, type }) => {
    const color = NOTIFICATION_COLORS[type] || DEFAULT_COLOR;
    const subject = `${title} — Rogveda`;

    const html = layout(subject, `
        <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">${title}</h2>
        ${body ? `
        <div style="background:${color.bg};border-left:4px solid ${color.border};border-radius:4px;padding:12px 16px;margin:0 0 24px;">
            <p style="margin:0;font-size:14px;color:${color.text};">${body}</p>
        </div>` : ''}
        <div style="text-align:center;margin:0 0 8px;">
            <a href="${env.urls.vendor}"
               style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">
                Go to Vendor Portal
            </a>
        </div>
        <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;text-align:center;">
            If you have questions, contact us at support@rogveda.com.
        </p>
    `);

    await send({
        to: email,
        subject,
        html,
        text: `${title}\n\n${body || ''}\n\nVisit ${env.urls.vendor}`,
    });
};

const sendKycDocRejected = async ({ email, documentName, reason }) => {
    const subject = `Action needed: ${documentName} was not accepted — Rogveda`;
    const html = layout(subject, `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Document not accepted</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            One of your KYC documents requires attention. Please review the feedback below and upload a corrected version.
        </p>
        <div style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;padding:16px 20px;margin:0 0 20px;">
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Document</p>
            <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#111827;">${documentName}</p>
            <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
            <p style="margin:0;font-size:14px;color:#dc2626;">${reason}</p>
        </div>
        <div style="text-align:center;margin:0 0 24px;">
            <a href="${env.urls.vendor}/kyc"
               style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">
                Re-upload document
            </a>
        </div>
        <p style="margin:0;font-size:13px;color:#9ca3af;">
            If you have questions, contact us at support@rogveda.com.
        </p>
    `);

    await send({
        to: email,
        subject,
        html,
        text: `Your KYC document "${documentName}" was not accepted.\n\nReason: ${reason}\n\nPlease re-upload at ${env.urls.vendor}/kyc`,
    });
};

const sendKycComplete = async ({ email, facilityName }) => {
    const subject = 'KYC approved — set up your Rogveda profile';
    const html = layout(subject, `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">KYC verification complete ✓</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            ${facilityName ? `Great news, <strong>${facilityName}</strong>!` : 'Great news!'} All your KYC documents have been reviewed and approved.
        </p>
        <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;padding:12px 16px;margin:0 0 24px;">
            <p style="margin:0;font-size:14px;color:#166534;">
                You can now complete your facility profile and submit it for review. Once your profile is approved, your facility will be listed on the Rogveda marketplace.
            </p>
        </div>
        <div style="text-align:center;margin:0 0 24px;">
            <a href="${env.urls.vendor}/profile"
               style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">
                Complete your profile
            </a>
        </div>
        <p style="margin:0;font-size:13px;color:#9ca3af;">
            If you have questions, contact us at support@rogveda.com.
        </p>
    `);

    await send({
        to: email,
        subject,
        html,
        text: `Your KYC documents have all been approved! Please complete your facility profile at ${env.urls.vendor}/profile`,
    });
};

const sendProfileDecision = async ({ email, approved, facilityName, reason }) => {
    const subject = approved
        ? 'Your Rogveda profile has been approved!'
        : 'Update needed on your Rogveda profile';

    const html = layout(subject, approved ? `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Profile approved 🎉</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            ${facilityName ? `Congratulations, <strong>${facilityName}</strong>!` : 'Congratulations!'} Your facility profile has been reviewed and <strong>approved</strong> by the Rogveda team.
        </p>
        <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;padding:12px 16px;margin:0 0 24px;">
            <p style="margin:0;font-size:14px;color:#166534;">
                Your profile is now live on the Rogveda marketplace. Patients can discover and contact your facility.
            </p>
        </div>
        <div style="text-align:center;margin:0 0 24px;">
            <a href="${env.urls.vendor}/profile"
               style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">
                View your profile
            </a>
        </div>
        <p style="margin:0;font-size:13px;color:#9ca3af;">
            If you have any questions, contact us at support@rogveda.com.
        </p>
    ` : `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Profile needs changes</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            Your facility profile has been reviewed. Unfortunately it was not approved at this time and requires some changes.
        </p>
        ${reason ? `
        <div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:4px;padding:12px 16px;margin:0 0 24px;">
            <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#991b1b;">Feedback from our team:</p>
            <p style="margin:0;font-size:14px;color:#991b1b;">${reason}</p>
        </div>` : ''}
        <p style="margin:0 0 24px;font-size:15px;color:#374151;">
            Please update your profile based on the feedback above and resubmit for review.
        </p>
        <div style="text-align:center;margin:0 0 24px;">
            <a href="${env.urls.vendor}/profile"
               style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">
                Update your profile
            </a>
        </div>
        <p style="margin:0;font-size:13px;color:#9ca3af;">
            If you have questions, contact us at support@rogveda.com.
        </p>
    `);

    await send({
        to: email,
        subject,
        html,
        text: approved
            ? `Your Rogveda facility profile has been approved! Visit ${env.urls.vendor}/profile to view it.`
            : `Your Rogveda profile needs changes. ${reason ? 'Feedback: ' + reason : ''} Please update and resubmit at ${env.urls.vendor}/profile`,
    });
};

const sendDeactivationDecision = async ({ email, approved, reason }) => {
    const subject = approved
        ? 'Your deactivation request has been processed — Rogveda'
        : 'Update on your deactivation request — Rogveda';

    const html = layout(subject, approved ? `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Account deactivated</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            Your account deactivation request has been approved. Your vendor account is now deactivated
            and your profile is no longer visible on the Rogveda marketplace.
        </p>
        <p style="margin:0;font-size:13px;color:#9ca3af;">
            If you change your mind in the future, contact us at support@rogveda.com.
        </p>
    ` : `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Deactivation request not approved</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">
            Your account deactivation request has been reviewed and was not approved at this time.
        </p>
        ${reason ? `
        <div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:4px;padding:12px 16px;margin:0 0 16px;">
            <p style="margin:0;font-size:14px;color:#991b1b;"><strong>Reason:</strong> ${reason}</p>
        </div>` : ''}
        <p style="margin:0;font-size:13px;color:#9ca3af;">
            If you have questions, contact us at support@rogveda.com.
        </p>
    `);

    await send({
        to: email,
        subject,
        html,
        text: approved
            ? 'Your Rogveda account deactivation request has been approved. Your account is now deactivated.'
            : `Your Rogveda deactivation request was not approved. ${reason ? 'Reason: ' + reason : ''}`,
    });
};

module.exports = {
    sendOtp,
    sendLeadConfirmation,
    sendVendorCredentials,
    sendNotificationEmail,
    sendKycDocRejected,
    sendKycComplete,
    sendProfileDecision,
    sendDeactivationDecision,
};
