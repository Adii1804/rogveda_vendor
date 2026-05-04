import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getLead, updateLead } from '@/api/leads';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, formatDate } from '@/lib/utils';
import { useState, useEffect } from 'react';

// Matches vendor_leads.status CHECK constraint exactly
const STATUSES = ['new', 'contacted', 'under_review', 'approved', 'rejected'];

function InfoRow({ label, value }) {
    return (
        <div className="flex gap-4 py-2 border-b border-gray-100 last:border-0">
            <span className="w-44 shrink-0 text-sm text-gray-500">{label}</span>
            <span className="text-sm text-gray-900 flex-1">{value ?? '—'}</span>
        </div>
    );
}

function LeadDetailContent({ id }) {
    const qc = useQueryClient();
    const { toast } = useToast();

    const [status, setStatus] = useState('');
    const [notes, setNotes] = useState('');
    const [callbackDate, setCallbackDate] = useState('');
    const [isDirty, setIsDirty] = useState(false);

    const { data: lead, isLoading } = useQuery({
        queryKey: ['lead', id],
        queryFn: () => getLead(id),
    });

    // Sync local state when data loads
    useEffect(() => {
        if (lead) {
            setStatus(lead.status);
            setNotes(lead.notes || '');
            setCallbackDate(
                lead.callback_reminder_at
                    ? new Date(lead.callback_reminder_at).toISOString().slice(0, 16)
                    : ''
            );
            setIsDirty(false);
        }
    }, [lead]);

    const mutation = useMutation({
        mutationFn: (data) => updateLead(id, data),
        onSuccess: (_result, variables) => {
            // Update cache immediately so badge + form stay in sync without waiting for refetch
            qc.setQueryData(['lead', id], (old) => (old ? { ...old, ...variables } : old));
            qc.invalidateQueries({ queryKey: ['lead', id] });
            qc.invalidateQueries({ queryKey: ['leads'] });
            toast('Lead updated');
            setIsDirty(false);
        },
        onError: (err) => toast(err.response?.data?.error || 'Update failed', 'error'),
    });

    if (isLoading) return <PageLoader />;
    if (!lead) return <div className="p-8 text-gray-500">Lead not found.</div>;

    const handleSave = () => {
        const payload = {
            status,
            notes,
            callback_reminder_at: callbackDate
                ? new Date(callbackDate).toISOString()
                : null,
        };
        mutation.mutate(payload);
    };

    return (
        <div className="p-8 max-w-3xl">
            <Link
                to="/leads"
                className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Leads
            </Link>

            <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-900">{lead.email}</h1>
                    <p className="mt-0.5 text-sm text-gray-500">Lead ID: {lead.id}</p>
                </div>
                <Badge status={lead.status} />
            </div>

            <div className="flex flex-col gap-5">
                {/* Lead details */}
                <Card>
                    <CardHeader>
                        <h2 className="text-sm font-semibold text-gray-900">Lead Details</h2>
                    </CardHeader>
                    <CardBody>
                        <InfoRow label="Email" value={lead.email} />
                        <InfoRow
                            label="Email Verified"
                            value={lead.email_verified ? '✓ Yes' : '✗ No'}
                        />
                        <InfoRow label="Submitted" value={formatDateTime(lead.created_at)} />
                        <InfoRow label="Last Updated" value={formatDateTime(lead.updated_at)} />
                        {lead.is_duplicate && (
                            <InfoRow
                                label="Duplicate"
                                value={
                                    <span className="text-amber-600 font-medium text-xs">
                                        Duplicate submission
                                        {lead.duplicate_of && ` of ${lead.duplicate_of}`}
                                    </span>
                                }
                            />
                        )}
                    </CardBody>
                </Card>

                {/* Linked vendor account */}
                {lead.created_vendor_email && (
                    <Card>
                        <CardHeader>
                            <h2 className="text-sm font-semibold text-gray-900">Vendor Account Created</h2>
                        </CardHeader>
                        <CardBody>
                            <InfoRow label="Vendor Email" value={lead.created_vendor_email} />
                            <InfoRow label="Login ID" value={lead.created_vendor_login_id} />
                        </CardBody>
                    </Card>
                )}

                {/* CRM actions */}
                <Card>
                    <CardHeader>
                        <h2 className="text-sm font-semibold text-gray-900">CRM Actions</h2>
                    </CardHeader>
                    <CardBody>
                        {lead.status === 'approved' ? (
                            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-800">
                                This lead has been <strong>approved</strong> and a vendor account has been created.
                                The pipeline status is locked and can no longer be changed.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <Select
                                    label="Pipeline Status"
                                    value={status}
                                    onChange={(e) => {
                                        setStatus(e.target.value);
                                        setIsDirty(true);
                                    }}
                                    className="w-48"
                                >
                                    {STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                            {s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                                        </option>
                                    ))}
                                </Select>

                                <Input
                                    label="Callback Reminder"
                                    type="datetime-local"
                                    value={callbackDate}
                                    onChange={(e) => {
                                        setCallbackDate(e.target.value);
                                        setIsDirty(true);
                                    }}
                                    className="w-64"
                                />

                                <Textarea
                                    label="Notes"
                                    placeholder="Call notes, observations…"
                                    rows={4}
                                    value={notes}
                                    onChange={(e) => {
                                        setNotes(e.target.value);
                                        setIsDirty(true);
                                    }}
                                />

                                <div className="flex justify-end">
                                    <Button
                                        onClick={handleSave}
                                        loading={mutation.isPending}
                                        disabled={!isDirty}
                                    >
                                        Save Changes
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardBody>
                </Card>
            </div>
        </div>
    );
}

export default function LeadDetailPage() {
    const { id } = useParams();
    return <LeadDetailContent key={id} id={id} />;
}
