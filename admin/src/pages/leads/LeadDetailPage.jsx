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
import { formatDateTime, shortId } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';

// 'new' is the automatic initial status when a lead arrives — admins never set it manually
const STATUSES = ['contacted', 'under_review', 'approved', 'rejected'];

function InfoRow({ label, value }) {
    return (
        <div className="flex gap-4 py-2 border-b border-gray-100 last:border-0">
            <span className="w-44 shrink-0 text-sm text-gray-500">{label}</span>
            <span className="text-sm text-gray-900 flex-1">{value ?? '—'}</span>
        </div>
    );
}

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

    const [draftStatus, setDraftStatus]   = useState('');
    const [draftCallback, setDraftCallback] = useState('');
    const [draftNote, setDraftNote]       = useState('');

    const { data: lead, isLoading } = useQuery({
        queryKey: ['lead', id],
        queryFn: () => getLead(id),
    });

    const { data: notesData, isLoading: notesLoading } = useQuery({
        queryKey: ['lead-notes', id],
        queryFn: () => getLeadNotes(id),
        enabled: !!lead,
    });

    const notes = useMemo(() => notesData?.notes || [], [notesData]);

    // Statuses that already have a committed note — permanently locked
    const lockedStatuses = useMemo(() => new Set(notes.map(n => n.status_at_time)), [notes]);

    // Statuses still open for the next action
    const availableStatuses = useMemo(
        () => STATUSES.filter(s => !lockedStatuses.has(s)),
        [lockedStatuses]
    );

    // Sync draft state whenever lead or notes data changes (e.g. after a save)
    useEffect(() => {
        if (!lead || notesLoading) return;

        const locked = new Set((notesData?.notes || []).map(n => n.status_at_time));
        const available = STATUSES.filter(s => !locked.has(s));

        // Default to current lead status if it hasn't been committed yet,
        // otherwise default to first remaining available status
        const defaultStatus = !locked.has(lead.status)
            ? lead.status
            : (available[0] || '');

        setDraftStatus(defaultStatus);
        setDraftCallback(
            lead.callback_reminder_at
                ? new Date(lead.callback_reminder_at).toISOString().slice(0, 16)
                : ''
        );
        // draftNote intentionally NOT reset here — cleared by onSuccess after save
    }, [lead, notesData]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Combined mutation: update status + add note in a single user action ──
    const saveMut = useMutation({
        mutationFn: async ({ status, note, callbackAt }) => {
            await updateLead(id, {
                status,
                callback_reminder_at: callbackAt ? new Date(callbackAt).toISOString() : null,
            });
            return addLeadNote(id, { note, status_at_time: status });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['lead', id] });
            qc.invalidateQueries({ queryKey: ['lead-notes', id] });
            qc.invalidateQueries({ queryKey: ['leads'] });
            setDraftNote('');
            toast('Saved');
        },
        onError: (err) => toast(err.response?.data?.error || 'Save failed', 'error'),
    });

    const handleSave = () => {
        if (!draftNote.trim() || !draftStatus) return;
        saveMut.mutate({ status: draftStatus, note: draftNote, callbackAt: draftCallback });
    };

    if (isLoading) return <PageLoader />;
    if (!lead) return <div className="p-8 text-gray-500">Lead not found.</div>;

    const isApproved  = lead.status === 'approved';
    const isRejected  = lead.status === 'rejected';
    const isTerminal  = isApproved || isRejected;
    const canSave     = draftNote.trim().length > 0 && !!draftStatus;

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
                        <InfoRow
                            label="Email Verified"
                            value={lead.email_verified ? '✓ Yes' : '✗ No'}
                        />
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

                {/* ── Pipeline (status + note combined into one action) ── */}
                <Card>
                    <CardHeader>
                        <h2 className="text-sm font-semibold text-gray-900">Pipeline</h2>
                    </CardHeader>
                    <CardBody>
                        {isApproved ? (
                            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-800">
                                This lead has been <strong>approved</strong>. The pipeline is locked.
                            </div>
                        ) : isRejected ? (
                            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-800">
                                This lead has been <strong>rejected</strong>. No further pipeline actions are available.
                            </div>
                        ) : notesLoading ? (
                            <p className="text-sm text-gray-400 py-2">Loading…</p>
                        ) : availableStatuses.length === 0 ? (
                            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
                                All pipeline statuses have been used. No further actions available.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {/* Status + callback on the same row */}
                                <div className="flex flex-wrap gap-4">
                                    <Select
                                        label="Status"
                                        value={draftStatus}
                                        onChange={(e) => {
                                            setDraftStatus(e.target.value);
                                            setDraftNote(''); // clear note when status changes
                                        }}
                                        className="w-48"
                                    >
                                        {availableStatuses.map((s) => (
                                            <option key={s} value={s}>
                                                {s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                                            </option>
                                        ))}
                                    </Select>
                                    <Input
                                        label="Callback Reminder"
                                        type="datetime-local"
                                        value={draftCallback}
                                        onChange={(e) => setDraftCallback(e.target.value)}
                                        className="w-64"
                                    />
                                </div>

                                {/* Note textarea — always visible once status is chosen */}
                                <Textarea
                                    label={`Note for "${draftStatus ? draftStatus.replace(/_/g, ' ') : ''}"`}
                                    placeholder="Write a note to commit this status…"
                                    rows={3}
                                    value={draftNote}
                                    onChange={(e) => setDraftNote(e.target.value)}
                                />

                                {/* Save button only appears once the note has content */}
                                {canSave && (
                                    <div className="flex justify-end">
                                        <Button
                                            onClick={handleSave}
                                            loading={saveMut.isPending}
                                        >
                                            Save
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardBody>
                </Card>

                {/* ── History (read-only timeline of committed notes) ── */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-gray-900">History</h2>
                            <span className="text-xs text-gray-400">
                                {notes.length} {notes.length === 1 ? 'entry' : 'entries'}
                            </span>
                        </div>
                    </CardHeader>
                    <CardBody>
                        {notesLoading ? (
                            <p className="text-sm text-gray-400 py-2">Loading…</p>
                        ) : notes.length === 0 ? (
                            <p className="text-sm text-gray-400 py-2">
                                No history yet. Save a status note above to start the timeline.
                            </p>
                        ) : (
                            notes.map((n) => <NoteEntry key={n.id} note={n} />)
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
