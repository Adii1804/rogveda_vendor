import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getDeactivationRequests, reviewDeactivationRequest } from '@/api/vendors';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/utils';

export default function DeactivationRequestsPage() {
    const qc = useQueryClient();
    const { toast } = useToast();
    const [rejectVendorId, setRejectVendorId] = useState(null);
    const [reason, setReason] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['deactivation-requests'],
        queryFn: getDeactivationRequests,
    });

    const requests = data?.requests || [];

    const reviewMut = useMutation({
        mutationFn: ({ vendorId, body }) => reviewDeactivationRequest(vendorId, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['deactivation-requests'] });
            qc.invalidateQueries({ queryKey: ['vendors'] });
            toast('Request processed');
            setRejectVendorId(null);
            setReason('');
        },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    return (
        <div className="p-8 max-w-4xl">
            <PageHeader
                title="Deactivation requests"
                subtitle="Vendor-submitted account closure requests"
            />

            {isLoading ? (
                <PageLoader />
            ) : (
                <Card className="mt-6">
                    <CardHeader>
                        <h2 className="text-sm font-semibold text-gray-900">
                            {requests.length} pending
                        </h2>
                    </CardHeader>
                    <CardBody className="p-0 divide-y divide-gray-100">
                        {requests.map((r) => (
                            <div
                                key={r.vendor_id}
                                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                            >
                                <div className="min-w-0">
                                    <Link
                                        to={`/vendors/${r.vendor_id}`}
                                        className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                                    >
                                        {r.facility_name || r.email}
                                    </Link>
                                    <p className="text-xs text-gray-500 mt-0.5">{r.email}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Submitted {formatDateTime(r.deactivation_requested_at)}
                                    </p>
                                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                                        {r.deactivation_reason}
                                    </p>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <Button
                                        size="sm"
                                        variant="success"
                                        loading={reviewMut.isPending}
                                        onClick={() =>
                                            reviewMut.mutate({
                                                vendorId: r.vendor_id,
                                                body: { action: 'approve' },
                                            })
                                        }
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="danger"
                                        onClick={() => setRejectVendorId(r.vendor_id)}
                                    >
                                        Reject
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {!requests.length && (
                            <p className="px-4 py-10 text-center text-sm text-gray-500">
                                No pending requests.
                            </p>
                        )}
                    </CardBody>
                </Card>
            )}

            <Modal
                open={Boolean(rejectVendorId)}
                onClose={() => {
                    setRejectVendorId(null);
                    setReason('');
                }}
                title="Reject deactivation request"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        The vendor will receive this explanation by email.
                    </p>
                    <Textarea
                        label="Reason *"
                        rows={4}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Explain why the request cannot be approved…"
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setRejectVendorId(null);
                                setReason('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            loading={reviewMut.isPending}
                            disabled={!reason.trim()}
                            onClick={() =>
                                reviewMut.mutate({
                                    vendorId: rejectVendorId,
                                    body: { action: 'reject', reason: reason.trim() },
                                })
                            }
                        >
                            Reject & notify
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
