import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { getLead, updateLead, getLeadNotes, addLeadNote } from '@/api/leads';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, formatDate, shortId } from '@/lib/utils';
import { useState, useEffect } from 'react';

const STATUSES = ['new', 'contacted', 'under_review', 'approved', 'rejected'];

function InfoRow({ label, value }) {
    return (
        <div className="flex gap-4 py-2 border-b border-gray-100 last:border-0">
            <span className="w-44 shrink-0 text-sm text-gray-500">{label}</span>
            <span className="text-sm text-gray-900 flex-1">{value ?? '—'}</span>
        </div>
    );
}

// Status → colour mapping (matches Badge colours)
const STATUS_PILL = {
    new:          'bg-gray-100 text-gray-700',
    contacted:    'bg-blue-100 text-blue-700',
    under_review: 'bg-amber-100 text-amber-700',
    approved:     'bg-emerald-100 text-emerald-700',
    rejected:     'bg-red-100 text-red-700',
};

function NoteEntry({ note }) {
    const pill = STATUS_PILL[note.status_at_time] || 'bg-gray-100 text-gray-700';
    return (
        <div className="flex gap-3 py-3 border-b border-gray-100 last:border-0">
            <div className="mt-0.5 shrink-0">
                <MessageSquare className="h-4 w-4 text-gray-300" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                    {note.status_at_time && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${pill}`}>
                            {note.status_at_time.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                        </span>
                    )}
                    <span className="text-xs text-gray-400">{formatDateTime(note.created_at)}</span>
                    {note.created_by_email && (
                        <span className="text-xs text-gray-400">· {note.created_by_email}</span>
                    )}
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.note}</p>
            </div>
        </div>
    );
}

function LeadDetailContent({ id }) {
    const qc = useQueryClient();
    const { toast } = useToast();

    const [status, setStatus]           = useState('');
    const [callbackDate, setCallbackDate] = useState('');
    const [crmDirty, setCrmDirty]       = useState(false);
    const [noteText, setNoteText]       = useState('');

    const { data: lead, isLoading } = useQuery({
        queryKey: ['lead', id],
        queryFn: () => getLead(id),
    });

    const { data: notesData, isLoading: notesLoading } = useQuery({
        queryKey: ['lead-notes', id],
        queryFn: () => getLeadNotes(id),
        enabled: !!lead,
    });

    const notes = notesData?.notes || [];

    // Sync status/callback form when lead loads
    useEffect(() => {
        if (lead) {
            setStatus(lead.status);
            setCallbackDate(
                lead.callback_reminder_at
                    ? new Date(lead.callback_reminder_at).toISOString().slice(0, 16)
                    : ''
            );
            setCrmDirty(false);
        }
    }, [lead]);

    // ── Update status / callback ──
    const updateMut = useMutation({
        mutationFn: (data) => updateLead(id, data),
        onSuccess: (_result, variables) => {
            qc.setQueryData(['lead', id], (old) => (old ? { ...old, ...variables } : old));
            qc.invalidateQueries({ queryKey: ['lead', id] });
            qc.invalidateQueries({ queryKey: ['leads'] });
            toast('Lead updated');
            setCrmDirty(false);
        },
        onError: (err) => toast(err.response?.data?.error || 'Update failed', 'error'),
    });

    // ── Add note ──
    const noteMut = useMutation({
        mutationFn: (data) => addLeadNote(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['lead-notes', id] });
            setNoteText('');
            toast('Note saved');
        },
        onError: (err) => toast(err.response?.data?.error || 'Failed to save note', 'error'),
    });

    const handleUpdateCrm = () => {
        updateMut.mutate({
            status,
            callback_reminder_at: callbackDate ? new Date(callbackDate).toISOString() : null,
        });
    };

    const handleAddNote = () => {
        if (!noteText.trim()) return;
        noteMut.mutate({ note: noteText, status_at_time: status });
    };

    if (isLoading) return <PageLoader />;
    if (!lead) return <div className="p-8 text-gray-500">Lead not found.</div>;

    const isApproved = lead.status === 'approved';

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
                </div>
                <Badge status={lead.status} />
            </div>

            <div className="flex flex-col gap-5">

                {/* ── Lead Details ── */}
                <Card>
                    <CardHeader>
                        <h2 className="text-sm font-semibold text-gray-900">Lead Details</h2>
                    </CardHeader>
                    <CardBody>
                        <InfoRow label="Email" value={lead.email} />
                        <InfoRow label="Submitted"    value={formatDateTime(lead.created_at)} />
                        <InfoRow label="Last Updated" value={formatDateTime(lead.updated_at)} />
                        {lead.is_duplicate && (
                            <InfoRow
                                label="Duplicate of"
                                value={
                                    <span className="text-amber-600 font-medium text-xs">
                                        Ref #{shortId(lead.duplicate_of)}
                                    </span>
                                }
                            />
                        )}
                    </CardBody>
                </Card>

                {/* ── Pipeline Status & Callback ── */}
                <Card>
                    <CardHeader>
                        <h2 className="text-sm font-semibold text-gray-900">Pipeline Status</h2>
                    </CardHeader>
                    <CardBody>
                        {isApproved ? (
                            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-800">
                                This lead has been <strong>approved</strong>. The pipeline status is locked.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap gap-4">
                                    <Select
                                        label="Status"
                                        value={status}
                                        onChange={(e) => { setStatus(e.target.value); setCrmDirty(true); }}
                                        className="w-48"
                                    >
                                        {STATUSES.map((s) => (
                                            <option key={s} value={s}>
                                                {s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                                            </option>
                                        ))}
                                    </Select>
                                    <Input
                                        label="Callback Reminder"
                                        type="datetime-local"
                                        value={callbackDate}
                                        onChange={(e) => { setCallbackDate(e.target.value); setCrmDirty(true); }}
                                        className="w-64"
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <Button
                                        onClick={handleUpdateCrm}
                                        loading={updateMut.isPending}
                                        disabled={!crmDirty}
                                    >
                                        Save Status
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardBody>
                </Card>

                {/* ── Notes Timeline + Add Note ── */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-gray-900">Notes</h2>
                            <span className="text-xs text-gray-400">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {/* History */}
                        {notesLoading ? (
                            <p className="text-sm text-gray-400 py-2">Loading notes…</p>
                        ) : notes.length === 0 ? (
                            <p className="text-sm text-gray-400 py-2">No notes yet. Add the first one below.</p>
                        ) : (
                            <div className="mb-4">
                                {notes.map((n) => (
                                    <NoteEntry key={n.id} note={n} />
                                ))}
                            </div>
                        )}

                        {/* Add Note form — only while lead is not yet approved */}
                        {!isApproved && (
                            <div className="pt-3 border-t border-gray-100 flex flex-col gap-3">
                                <Textarea
                                    label="Add a note"
                                    placeholder={`Write a note… (tagged as "${status.replace(/_/g, ' ')}")`}
                                    rows={3}
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                />
                                <div className="flex justify-end">
                                    <Button
                                        onClick={handleAddNote}
                                        loading={noteMut.isPending}
                                        disabled={!noteText.trim()}
                                    >
                                        Add Note
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
