import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ExternalLink, CheckCircle, XCircle, FileText, Download } from 'lucide-react';
import { getKycQueue, reviewKycDocument } from '@/api/kyc';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/layout/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';

function DocumentPreview({ doc }) {
    if (!doc.signed_url) {
        return (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-gray-400">
                <FileText className="h-5 w-5" />
                <span className="text-sm">No file uploaded yet</span>
            </div>
        );
    }

    const isImage = doc.mime_type?.startsWith('image/');
    const isPdf = doc.mime_type === 'application/pdf';

    return (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
            {isImage && (
                <img
                    src={doc.signed_url}
                    alt={doc.original_file_name}
                    className="max-h-64 w-full object-contain bg-white"
                />
            )}
            {isPdf && (
                <iframe
                    src={doc.signed_url}
                    title={doc.original_file_name}
                    className="h-64 w-full"
                />
            )}
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200">
                <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="text-xs text-gray-600 truncate">{doc.original_file_name}</span>
                    {doc.file_size_bytes && (
                        <span className="text-xs text-gray-400 shrink-0">
                            ({(doc.file_size_bytes / 1024).toFixed(0)} KB)
                        </span>
                    )}
                </div>
                <a
                    href={doc.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-3 shrink-0 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                    <ExternalLink className="h-3 w-3" />
                    Open
                </a>
            </div>
        </div>
    );
}

function ReviewModal({ doc, open, onClose }) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const [action, setAction] = useState('');
    const [reason, setReason] = useState('');
    const [renewalDate, setRenewalDate] = useState('');

    const mutation = useMutation({
        mutationFn: (data) => reviewKycDocument(doc.id, data),
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: ['kyc-queue'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            const label = variables.action === 'approved' ? 'approved' : 'rejected';
            toast(`Document ${label}`);
            onClose();
        },
        onError: (e) => toast(e.response?.data?.error || 'Review failed', 'error'),
    });

    const handleSubmit = () => {
        const payload = { action };
        if (action === 'rejected') payload.rejection_reason = reason;
        if (action === 'approved' && renewalDate) payload.renewal_date = renewalDate;
        mutation.mutate(payload);
    };

    return (
        <Modal open={open} onClose={onClose} title="Review Document" size="md">
            {doc && (
                <div className="space-y-4">
                    {/* Document info */}
                    <div className="rounded-lg bg-gray-50 px-3 py-2 space-y-0.5">
                        <p className="text-sm font-semibold text-gray-900">{doc.document_name}</p>
                        <p className="text-xs text-gray-500">
                            {doc.vendor_name || '—'} &nbsp;·&nbsp; {doc.service_category || '—'}
                        </p>
                        {doc.vendor_email && (
                            <p className="text-xs text-gray-400">{doc.vendor_email}</p>
                        )}
                    </div>

                    {/* File preview */}
                    <DocumentPreview doc={doc} />

                    <div className="flex gap-3">
                        <button
                            onClick={() => setAction('approved')}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                                action === 'approved'
                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                    : 'border-gray-200 text-gray-600 hover:border-emerald-300'
                            }`}
                        >
                            <CheckCircle className="h-4 w-4" />
                            Approve
                        </button>
                        <button
                            onClick={() => setAction('rejected')}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-medium transition-colors ${
                                action === 'rejected'
                                    ? 'border-red-500 bg-red-50 text-red-700'
                                    : 'border-gray-200 text-gray-600 hover:border-red-300'
                            }`}
                        >
                            <XCircle className="h-4 w-4" />
                            Reject
                        </button>
                    </div>

                    {action === 'approved' && doc.has_renewal && (
                        <Input
                            label="Renewal Date (optional)"
                            type="date"
                            value={renewalDate}
                            onChange={(e) => setRenewalDate(e.target.value)}
                        />
                    )}

                    {action === 'rejected' && (
                        <Textarea
                            label="Rejection Reason *"
                            placeholder="Explain what's wrong with this document…"
                            rows={3}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button
                            variant={action === 'approved' ? 'success' : 'danger'}
                            disabled={!action || (action === 'rejected' && !reason.trim())}
                            loading={mutation.isPending}
                            onClick={handleSubmit}
                        >
                            Confirm {action === 'approved' ? 'Approval' : action === 'rejected' ? 'Rejection' : ''}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

export default function KycQueuePage() {
    const [selectedDoc, setSelectedDoc] = useState(null);

    const { data, isLoading } = useQuery({
        queryKey: ['kyc-queue'],
        queryFn: getKycQueue,
        refetchInterval: 30_000,
    });

    const docs = data?.documents || [];

    return (
        <div className="p-8">
            <PageHeader
                title="KYC Queue"
                subtitle={`${docs.length} document${docs.length !== 1 ? 's' : ''} awaiting review`}
            />

            <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {isLoading ? (
                    <PageLoader />
                ) : docs.length === 0 ? (
                    <div className="py-16 text-center">
                        <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
                        <p className="text-sm font-medium text-gray-600">All caught up!</p>
                        <p className="text-xs text-gray-400 mt-1">No documents pending review.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Document</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Vendor</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Category</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Mandatory</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Submitted</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {docs.map((doc) => (
                                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900">{doc.document_name}</p>
                                        {doc.rejection_reason && (
                                            <p className="mt-0.5 text-xs text-red-500 truncate max-w-[200px]">
                                                Prev: {doc.rejection_reason}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Link
                                            to={`/vendors/${doc.vendor_id}`}
                                            className="text-gray-900 hover:text-blue-600 hover:underline"
                                        >
                                            {doc.vendor_name}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 capitalize">{doc.service_category}</td>
                                    <td className="px-4 py-3">
                                        {doc.is_mandatory ? (
                                            <span className="text-xs font-medium text-red-600">Required</span>
                                        ) : (
                                            <span className="text-xs text-gray-400">Optional</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">{formatDate(doc.uploaded_at || doc.updated_at)}</td>
                                    <td className="px-4 py-3">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => setSelectedDoc(doc)}
                                        >
                                            Review
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <ReviewModal
                key={selectedDoc?.id ?? 'none'}
                doc={selectedDoc}
                open={!!selectedDoc}
                onClose={() => setSelectedDoc(null)}
            />
        </div>
    );
}
