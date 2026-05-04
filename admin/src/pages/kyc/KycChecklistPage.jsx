import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '@/api/client';
import {
    getKycChecklist,
    createKycChecklistItem,
    updateKycChecklistItem,
    deleteKycChecklistItem,
} from '@/api/kycChecklist';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { PageLoader } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/utils';

export default function KycChecklistPage() {
    const qc = useQueryClient();
    const { toast } = useToast();
    const [categoryId, setCategoryId] = useState('');
    const [editItem, setEditItem] = useState(null);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({
        document_name: '',
        description: '',
        is_mandatory: true,
        has_renewal: false,
        display_order: 0,
    });

    const { data: categoriesData } = useQuery({
        queryKey: ['service-categories'],
        queryFn: () => client.get('/public/categories').then((r) => r.data.data),
    });

    const categories = categoriesData?.categories || [];

    const { data, isLoading } = useQuery({
        queryKey: ['kyc-checklist', categoryId],
        queryFn: () => getKycChecklist(categoryId),
        enabled: Boolean(categoryId),
    });

    const items = data?.items || [];

    const createMut = useMutation({
        mutationFn: (payload) => createKycChecklistItem(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['kyc-checklist', categoryId] });
            toast('Checklist item created');
            setShowAdd(false);
            setForm({
                document_name: '',
                description: '',
                is_mandatory: true,
                has_renewal: false,
                display_order: 0,
            });
        },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    const updateMut = useMutation({
        mutationFn: ({ id, patch }) => updateKycChecklistItem(id, patch),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['kyc-checklist', categoryId] });
            toast('Updated');
            setEditItem(null);
        },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    const deleteMut = useMutation({
        mutationFn: deleteKycChecklistItem,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['kyc-checklist', categoryId] });
            toast('Item deactivated');
        },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    return (
        <div className="p-8 max-w-5xl">
            <PageHeader
                title="KYC checklist"
                subtitle="Configure required documents per vendor category"
            />

            <div className="mt-6 flex flex-wrap items-end gap-4">
                <div className="w-72">
                    <Select
                        label="Vendor category"
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                    >
                        <option value="">Select category…</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </Select>
                </div>
                {categoryId && (
                    <Button onClick={() => setShowAdd(true)}>Add item</Button>
                )}
            </div>

            {!categoryId ? (
                <p className="mt-8 text-sm text-gray-500">Choose a category to view checklist items.</p>
            ) : isLoading ? (
                <PageLoader />
            ) : (
                <Card className="mt-6">
                    <CardHeader>
                        <h2 className="text-sm font-semibold text-gray-900">Items</h2>
                    </CardHeader>
                    <CardBody className="p-0">
                        <div className="divide-y divide-gray-100">
                            {items.map((row) => (
                                <div
                                    key={row.id}
                                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900">{row.document_name}</p>
                                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                            {row.description || row.instructions || '—'}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Updated {formatDateTime(row.updated_at)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {row.is_mandatory ? (
                                            <Badge status="pending" label="Mandatory" />
                                        ) : (
                                            <Badge status="draft" label="Optional" />
                                        )}
                                        {row.has_renewal && <Badge status="under_review" label="Renewal" />}
                                        {row.is_active ? (
                                            <Badge status="approved" label="Active" />
                                        ) : (
                                            <Badge status="inactive" label="Inactive" />
                                        )}
                                        <Button variant="secondary" size="sm" onClick={() => setEditItem(row)}>
                                            Edit
                                        </Button>
                                        {row.is_active && (
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                onClick={() => deleteMut.mutate(row.id)}
                                                loading={deleteMut.isPending}
                                            >
                                                Deactivate
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {!items.length && (
                                <p className="px-4 py-8 text-sm text-gray-500 text-center">No items yet.</p>
                            )}
                        </div>
                    </CardBody>
                </Card>
            )}

            <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add checklist item" size="md">
                <div className="space-y-4">
                    <Input
                        label="Document name"
                        value={form.document_name}
                        onChange={(e) => setForm((f) => ({ ...f, document_name: e.target.value }))}
                    />
                    <Textarea
                        label="Instructions for vendor"
                        rows={3}
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                    <div className="flex gap-4 flex-wrap">
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={form.is_mandatory}
                                onChange={(e) => setForm((f) => ({ ...f, is_mandatory: e.target.checked }))}
                            />
                            Mandatory
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={form.has_renewal}
                                onChange={(e) => setForm((f) => ({ ...f, has_renewal: e.target.checked }))}
                            />
                            Track expiry / renewal
                        </label>
                    </div>
                    <Input
                        label="Display order"
                        type="number"
                        value={form.display_order}
                        onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                        <Button
                            onClick={() =>
                                createMut.mutate({
                                    service_category_id: categoryId,
                                    document_name: form.document_name,
                                    description: form.description || null,
                                    is_mandatory: form.is_mandatory,
                                    has_renewal: form.has_renewal,
                                    display_order: Number(form.display_order) || 0,
                                })
                            }
                            loading={createMut.isPending}
                            disabled={!form.document_name.trim()}
                        >
                            Create
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal open={Boolean(editItem)} onClose={() => setEditItem(null)} title="Edit checklist item" size="md">
                {editItem && (
                    <EditForm
                        item={editItem}
                        onSave={(patch) => updateMut.mutate({ id: editItem.id, patch })}
                        loading={updateMut.isPending}
                        onClose={() => setEditItem(null)}
                    />
                )}
            </Modal>
        </div>
    );
}

function EditForm({ item, onSave, loading, onClose }) {
    const [document_name, setDocumentName] = useState(item.document_name);
    const [description, setDescription] = useState(item.description || item.instructions || '');
    const [is_mandatory, setMandatory] = useState(item.is_mandatory);
    const [has_renewal, setHasRenewal] = useState(item.has_renewal);
    const [is_active, setActive] = useState(item.is_active);
    const [display_order, setOrder] = useState(item.display_order ?? 0);

    return (
        <div className="space-y-4">
            <Input label="Document name" value={document_name} onChange={(e) => setDocumentName(e.target.value)} />
            <Textarea
                label="Instructions for vendor"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={is_mandatory} onChange={(e) => setMandatory(e.target.checked)} />
                    Mandatory
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={has_renewal} onChange={(e) => setHasRenewal(e.target.checked)} />
                    Track expiry / renewal
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={is_active} onChange={(e) => setActive(e.target.checked)} />
                    Active
                </label>
            </div>
            <Input
                label="Display order"
                type="number"
                value={display_order}
                onChange={(e) => setOrder(e.target.value)}
            />
            <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button
                    loading={loading}
                    onClick={() =>
                        onSave({
                            document_name,
                            description,
                            is_mandatory,
                            has_renewal,
                            is_active,
                            display_order: Number(display_order) || 0,
                        })
                    }
                >
                    Save
                </Button>
            </div>
        </div>
    );
}
