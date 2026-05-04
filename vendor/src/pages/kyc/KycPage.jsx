import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getKycChecklist, uploadKycDocument, submitKyc } from '@/api/kyc';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

function docUiStatus(row) {
    if (!row.document_id) return { key: 'not_uploaded', label: 'Not uploaded' };
    const s = row.document_status;
    if (s === 'uploaded') return { key: 'uploaded', label: 'Uploaded' };
    if (s === 'under_review') return { key: 'under_review', label: 'Under review' };
    if (s === 'approved') return { key: 'approved', label: 'Approved' };
    if (s === 'rejected') return { key: 'rejected', label: 'Rejected' };
    if (s === 'expired') return { key: 'expired', label: 'Expired' };
    return { key: 'pending', label: s || '—' };
}

function kycBannerLabel(status) {
    const map = {
        pending: 'Not started',
        in_progress: 'In progress',
        under_review: 'Under review',
        complete: 'Complete',
    };
    return map[status] || status;
}

export default function KycPage() {
    const qc = useQueryClient();
    const { toast } = useToast();
    const patchUser = useAuthStore((s) => s.patchUser);
    const fileRefs = useRef({});

    const { data, isLoading } = useQuery({
        queryKey: ['vendor-kyc-checklist'],
        queryFn: getKycChecklist,
    });

    const uploadMut = useMutation({
        mutationFn: ({ itemId, file }) => uploadKycDocument(itemId, file),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['vendor-kyc-checklist'] });
            qc.invalidateQueries({ queryKey: ['vendor-profile'] });
            toast('Document uploaded');
        },
        onError: (e) => toast(e.response?.data?.error || 'Upload failed', 'error'),
    });

    const submitMut = useMutation({
        mutationFn: submitKyc,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['vendor-kyc-checklist'] });
            qc.invalidateQueries({ queryKey: ['vendor-profile'] });
            patchUser({ kyc_status: 'under_review' });
            toast('Submitted for review');
        },
        onError: (e) => toast(e.response?.data?.error || 'Submit failed', 'error'),
    });

    if (isLoading) return <PageLoader />;

    const checklist = data?.checklist || [];
    const kycStatus = data?.kyc_status;

    const mandatoryReady = checklist
        .filter((c) => c.is_mandatory)
        .every((c) => {
            const st = c.document_status;
            return st && ['uploaded', 'under_review', 'approved'].includes(st);
        });

    const hasUploadedPending = checklist.some((c) => c.document_status === 'uploaded');
    const canSubmit =
        mandatoryReady &&
        kycStatus !== 'complete' &&
        (kycStatus !== 'under_review' || hasUploadedPending);

    return (
        <div className="p-8 max-w-3xl">
            <PageHeader title="KYC documents" subtitle="Upload the documents required for your category" />

            <div
                className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
                    kycStatus === 'complete'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : kycStatus === 'under_review'
                          ? 'border-blue-200 bg-blue-50 text-blue-900'
                          : 'border-gray-200 bg-white text-gray-700'
                }`}
            >
                <span className="font-medium">Status:</span> {kycBannerLabel(kycStatus)}
            </div>

            {kycStatus === 'complete' && (
                <div className="mt-4">
                    <Link to="/profile">
                        <Button type="button">Proceed to profile setup</Button>
                    </Link>
                </div>
            )}

            <div className="mt-6 space-y-4">
                {checklist.map((row) => {
                    const ui = docUiStatus(row);
                    const canUpload =
                        !row.document_status ||
                        row.document_status === 'rejected' ||
                        row.document_status === 'uploaded' ||
                        row.document_status === 'expired';
                    const blockUpload =
                        row.document_status === 'under_review' || row.document_status === 'approved';

                    return (
                        <Card key={row.id}>
                            <CardHeader>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <h2 className="text-sm font-semibold text-gray-900">{row.document_name}</h2>
                                        {row.description ? (
                                            <p className="text-xs text-gray-500 mt-1">{row.description}</p>
                                        ) : null}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge
                                            status={row.is_mandatory ? 'pending' : 'draft'}
                                            label={row.is_mandatory ? 'Mandatory' : 'Optional'}
                                        />
                                        <Badge status={ui.key} label={ui.label} />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardBody className="space-y-3">
                                {row.document_status === 'rejected' && row.rejection_reason && (
                                    <p className="text-sm text-red-600">{row.rejection_reason}</p>
                                )}
                                {row.original_file_name && (
                                    <p className="text-xs text-gray-600">
                                        File: <span className="font-medium">{row.original_file_name}</span>
                                        {row.uploaded_at && (
                                            <span className="text-gray-400">
                                                {' '}
                                                · uploaded {formatDateTime(row.uploaded_at)}
                                            </span>
                                        )}
                                    </p>
                                )}
                                <input
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
                                    className="hidden"
                                    ref={(el) => {
                                        fileRefs.current[row.id] = el;
                                    }}
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        if (f.size > 10 * 1024 * 1024) {
                                            toast('Max file size is 10MB', 'error');
                                            return;
                                        }
                                        uploadMut.mutate({ itemId: row.id, file: f });
                                        e.target.value = '';
                                    }}
                                />
                                {!blockUpload && canUpload && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        type="button"
                                        loading={uploadMut.isPending}
                                        onClick={() => fileRefs.current[row.id]?.click()}
                                    >
                                        {row.document_id ? 'Replace file' : 'Upload file'}
                                    </Button>
                                )}
                                {blockUpload && row.document_status === 'under_review' && (
                                    <p className="text-xs text-gray-500">This file is under review.</p>
                                )}
                            </CardBody>
                        </Card>
                    );
                })}
            </div>

            {kycStatus !== 'complete' && (
                <div className="mt-8">
                    <Button
                        onClick={() => submitMut.mutate()}
                        loading={submitMut.isPending}
                        disabled={!canSubmit}
                    >
                        Submit for review
                    </Button>
                    {!canSubmit && kycStatus !== 'under_review' && (
                        <p className="mt-2 text-xs text-gray-500">
                            Upload all mandatory documents to enable submission.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
