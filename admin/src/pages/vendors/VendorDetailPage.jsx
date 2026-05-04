import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import {
    getVendor,
    activateVendor,
    deactivateVendor,
    reviewVendorProfile,
    sendVendorCredentials,
} from '@/api/vendors';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { PageLoader } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useState } from 'react';

function InfoRow({ label, value }) {
    return (
        <div className="flex gap-4 py-2 border-b border-gray-100 last:border-0">
            <span className="w-44 shrink-0 text-sm text-gray-500">{label}</span>
            <span className="text-sm text-gray-900 flex-1">{value || '—'}</span>
        </div>
    );
}

function KycDocumentRow({ doc }) {
    const [expanded, setExpanded] = useState(false);
    const isImage = doc.mime_type?.startsWith('image/');
    const isPdf = doc.mime_type === 'application/pdf';

    return (
        <div className="py-3 border-b border-gray-100 last:border-0">
            <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{doc.document_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {doc.renewal_date ? `Expires ${formatDate(doc.renewal_date)}` : 'No expiry'}
                        {doc.original_file_name && (
                            <span className="ml-2 text-gray-300">· {doc.original_file_name}</span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Badge status={doc.status} />
                    {doc.signed_url && (
                        <>
                            <button
                                onClick={() => setExpanded((v) => !v)}
                                className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2"
                            >
                                {expanded ? 'Hide' : 'View'}
                            </button>
                            <a
                                href={doc.signed_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-gray-700"
                                title="Open in new tab"
                            >
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </>
                    )}
                </div>
            </div>

            {/* Inline preview */}
            {expanded && doc.signed_url && (
                <div className="mt-3">
                    {isImage ? (
                        <img
                            src={doc.signed_url}
                            alt={doc.document_name}
                            className="max-h-80 rounded-lg border border-gray-200 object-contain bg-gray-50"
                        />
                    ) : isPdf ? (
                        <iframe
                            src={doc.signed_url}
                            title={doc.document_name}
                            className="w-full h-96 rounded-lg border border-gray-200"
                        />
                    ) : (
                        <a
                            href={doc.signed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                            <ExternalLink className="h-4 w-4" />
                            Open file
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

export default function VendorDetailPage() {
    const { id } = useParams();
    const qc = useQueryClient();
    const { toast } = useToast();
    const [rejectModal, setRejectModal] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [activateOpen, setActivateOpen] = useState(false);

    const { data: vendor, isLoading } = useQuery({
        queryKey: ['vendor', id],
        queryFn: () => getVendor(id),
    });

    const activateMut = useMutation({
        mutationFn: () => activateVendor(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['vendor', id] });
        },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    const sendCredMut = useMutation({
        mutationFn: () => sendVendorCredentials(id),
        onSuccess: () => toast('Credentials email sent'),
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    const activateAndEmail = async () => {
        try {
            await activateMut.mutateAsync();
            await sendVendorCredentials(id);
            setActivateOpen(false);
            qc.invalidateQueries({ queryKey: ['vendor', id] });
            toast('Vendor activated and credentials emailed');
        } catch {
            /* activateMut / API errors surfaced individually */
        }
    };

    const deactivateMut = useMutation({
        mutationFn: (reason) => deactivateVendor(id, { reason }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendor', id] }); toast('Vendor deactivated'); setRejectModal(null); },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    const profileMut = useMutation({
        mutationFn: (data) => reviewVendorProfile(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['vendor', id] });
            toast('Profile review saved');
            setRejectModal(null);
            setRejectReason('');
        },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    if (isLoading) return <PageLoader />;
    if (!vendor) return <div className="p-8 text-gray-500">Vendor not found.</div>;

    const isActive = vendor.account_status === 'active';
    const canReviewProfile = vendor.profile_status === 'under_review';

    return (
        <div className="p-8 max-w-3xl">
            <Link
                to="/vendors"
                className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Vendors
            </Link>

            <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-xl font-semibold text-gray-900">
                        {vendor.facility_name || vendor.email}
                    </h1>
                    <p className="mt-0.5 text-sm text-gray-500">{vendor.email}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Badge status={vendor.account_status} />
                    <Badge status={vendor.kyc_status} label={`KYC: ${vendor.kyc_status?.replace(/_/g, ' ')}`} />
                    <Badge status={vendor.profile_status} label={`Profile: ${vendor.profile_status?.replace(/_/g, ' ')}`} />
                </div>
            </div>

            <div className="flex flex-col gap-5">
                {/* Account details */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-gray-900">Account</h2>
                            <div className="flex gap-2">
                                {isActive ? (
                                    <>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => sendCredMut.mutate()}
                                            loading={sendCredMut.isPending}
                                        >
                                            Resend credentials
                                        </Button>
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={() => setRejectModal('deactivate')}
                                        >
                                            Deactivate
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        variant="success"
                                        size="sm"
                                        onClick={() => setActivateOpen(true)}
                                        loading={activateMut.isPending}
                                    >
                                        Activate
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardBody>
                        <InfoRow label="Login ID" value={vendor.login_id} />
                        <InfoRow label="Mobile" value={vendor.contact_mobile} />
                        <InfoRow label="Service Category" value={vendor.category_name} />
                        <InfoRow label="Account Status" value={<Badge status={vendor.account_status} />} />
                        <InfoRow label="Created" value={formatDateTime(vendor.created_at)} />
                    </CardBody>
                </Card>

                {/* Profile review */}
                {canReviewProfile && (
                    <Card>
                        <CardHeader>
                            <h2 className="text-sm font-semibold text-gray-900">Profile Review</h2>
                        </CardHeader>
                        <CardBody>
                            <p className="text-sm text-gray-600 mb-4">
                                This vendor has submitted their profile for review. KYC status is{' '}
                                <Badge status={vendor.kyc_status} className="inline-flex" />.
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    variant="success"
                                    size="sm"
                                    onClick={() => profileMut.mutate({ action: 'approved' })}
                                    loading={profileMut.isPending}
                                    disabled={vendor.kyc_status !== 'complete'}
                                >
                                    <CheckCircle className="h-4 w-4" />
                                    Approve Profile
                                </Button>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setRejectModal('profile')}
                                >
                                    <XCircle className="h-4 w-4" />
                                    Reject
                                </Button>
                            </div>
                            {vendor.kyc_status !== 'complete' && (
                                <p className="mt-2 text-xs text-amber-600">
                                    KYC must be complete before approving the profile.
                                </p>
                            )}
                        </CardBody>
                    </Card>
                )}

                {/* KYC Documents */}
                <Card>
                    <CardHeader>
                        <h2 className="text-sm font-semibold text-gray-900">KYC Documents</h2>
                    </CardHeader>
                    <CardBody>
                        {!vendor.kyc_documents?.length ? (
                            <p className="text-sm text-gray-400">No documents uploaded yet.</p>
                        ) : (
                            vendor.kyc_documents.map((doc) => (
                                <KycDocumentRow key={doc.id} doc={doc} />
                            ))
                        )}
                    </CardBody>
                </Card>

                {/* Profile Details */}
                {(vendor.description || vendor.full_address || vendor.contact_email || vendor.website_url || vendor.facility_photo_previews?.length) && (
                    <Card>
                        <CardHeader>
                            <h2 className="text-sm font-semibold text-gray-900">Profile Details</h2>
                        </CardHeader>
                        <CardBody>
                            <InfoRow label="Facility Name" value={vendor.facility_name} />
                            <InfoRow label="City" value={vendor.city} />
                            {vendor.full_address && <InfoRow label="Full Address" value={vendor.full_address} />}
                            {vendor.contact_email && <InfoRow label="Contact Email" value={vendor.contact_email} />}
                            {vendor.contact_mobile && <InfoRow label="Contact Mobile" value={vendor.contact_mobile} />}
                            {vendor.website_url && (
                                <InfoRow
                                    label="Website"
                                    value={
                                        <a href={vendor.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                            {vendor.website_url} <ExternalLink className="h-3 w-3 inline" />
                                        </a>
                                    }
                                />
                            )}
                            {vendor.description && (
                                <div className="py-2 border-b border-gray-100 last:border-0">
                                    <span className="text-sm text-gray-500">About / Description</span>
                                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{vendor.description}</p>
                                </div>
                            )}
                            {vendor.facility_photo_previews?.length > 0 && (
                                <div className="pt-3">
                                    <p className="text-sm text-gray-500 mb-2">Facility Photos</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {vendor.facility_photo_previews.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                <img
                                                    src={url}
                                                    alt={`Facility photo ${i + 1}`}
                                                    className="w-full h-36 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity"
                                                />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardBody>
                    </Card>
                )}
            </div>

            <Modal
                open={activateOpen}
                onClose={() => setActivateOpen(false)}
                title="Activate vendor"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        This will activate the account and email the vendor their Login ID and temporary password.
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setActivateOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="success"
                            onClick={activateAndEmail}
                            loading={activateMut.isPending || sendCredMut.isPending}
                        >
                            Activate &amp; send credentials
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Deactivate modal */}
            <Modal
                open={rejectModal === 'deactivate'}
                onClose={() => setRejectModal(null)}
                title="Deactivate Vendor"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        This will immediately revoke all active sessions for this vendor.
                    </p>
                    <Textarea
                        label="Reason"
                        placeholder="Enter reason for deactivation…"
                        rows={3}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setRejectModal(null)}>Cancel</Button>
                        <Button
                            variant="danger"
                            onClick={() => deactivateMut.mutate(rejectReason)}
                            loading={deactivateMut.isPending}
                            disabled={!rejectReason.trim()}
                        >
                            Deactivate
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Profile rejection modal */}
            <Modal
                open={rejectModal === 'profile'}
                onClose={() => setRejectModal(null)}
                title="Reject Profile"
                size="sm"
            >
                <div className="space-y-4">
                    <Textarea
                        label="Rejection Reason *"
                        placeholder="Explain what needs to be corrected…"
                        rows={3}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setRejectModal(null)}>Cancel</Button>
                        <Button
                            variant="danger"
                            onClick={() => profileMut.mutate({ action: 'rejected', rejection_reason: rejectReason })}
                            loading={profileMut.isPending}
                            disabled={!rejectReason.trim()}
                        >
                            Reject Profile
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
