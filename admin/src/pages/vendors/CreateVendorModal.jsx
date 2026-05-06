import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createVendor } from '@/api/vendors';
import { getLeads } from '@/api/leads';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import client from '@/api/client';
import { useState } from 'react';

const schema = z.object({
    email: z.string().email('Valid email is required'),
    mobile_number: z.string().regex(/^\d{10}$/, 'Must be exactly 10 digits'),
    service_category_id: z.string().uuid('Please select a category'),
    facility_name: z.string().min(1, 'Facility name is required'),
    login_id: z.string().optional(),
    lead_id: z.string().optional(),
});

function CredentialsBanner({ data }) {
    return (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-2">
            <p className="text-sm font-semibold text-emerald-800">Vendor account created!</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                    <span className="text-gray-500">Login ID</span>
                    <p className="font-mono font-semibold text-gray-900">{data.login_id}</p>
                </div>
                <div>
                    <span className="text-gray-500">Temp Password</span>
                    <p className="font-mono font-semibold text-gray-900">{data.temp_password}</p>
                </div>
            </div>
            <p className="text-xs text-emerald-700">
                Activate the vendor from their detail page, then use &quot;Send credentials&quot; so they
                receive login details by email. They must set a new password on first login.
            </p>
        </div>
    );
}

export function CreateVendorModal({ open, onClose }) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const [credentials, setCredentials] = useState(null);
    const [emailMode, setEmailMode] = useState('lead'); // 'lead' | 'manual'

    // Service categories
    const { data: categoriesData } = useQuery({
        queryKey: ['service-categories'],
        queryFn: () => client.get('/public/categories').then((r) => r.data.data),
        enabled: open,
    });

    // Leads for dropdown — fetch all non-rejected verified leads
    const { data: leadsData } = useQuery({
        queryKey: ['leads-dropdown'],
        queryFn: () => getLeads({ limit: 200 }),
        enabled: open,
        staleTime: 30_000,
    });

    const eligibleLeads = (leadsData?.leads || []).filter(
        (l) => l.status !== 'rejected' && l.email_verified
    );

    const {
        register,
        handleSubmit,
        setValue,
        reset,
        formState: { errors, isSubmitting },
    } = useForm({ resolver: zodResolver(schema) });

    const handleLeadSelect = (e) => {
        const leadId = e.target.value;
        if (!leadId) {
            setValue('lead_id', '', { shouldValidate: false });
            setValue('email', '', { shouldValidate: false });
            return;
        }
        const lead = eligibleLeads.find((l) => l.id === leadId);
        if (lead) {
            setValue('lead_id', lead.id, { shouldValidate: false });
            setValue('email', lead.email, { shouldValidate: true });
        }
    };

    const mutation = useMutation({
        mutationFn: createVendor,
        onSuccess: (data) => {
            setCredentials(data);
            qc.invalidateQueries({ queryKey: ['vendors'] });
            qc.invalidateQueries({ queryKey: ['leads'] });
            toast('Vendor account created');
        },
        onError: (err) => toast(err.response?.data?.error || 'Failed to create vendor', 'error'),
    });

    const onSubmit = (data) => {
        const payload = { ...data };
        // Don't send empty lead_id
        if (!payload.lead_id) delete payload.lead_id;
        mutation.mutate(payload);
    };

    const handleClose = () => {
        reset();
        setCredentials(null);
        setEmailMode('lead');
        onClose();
    };

    const switchToManual = () => {
        setEmailMode('manual');
        setValue('lead_id', '', { shouldValidate: false });
        setValue('email', '', { shouldValidate: false });
    };

    const switchToLeads = () => {
        setEmailMode('lead');
        setValue('lead_id', '', { shouldValidate: false });
        setValue('email', '', { shouldValidate: false });
    };

    return (
        <Modal open={open} onClose={handleClose} title="Create Vendor Account" size="md">
            {credentials ? (
                <div className="space-y-4">
                    <CredentialsBanner data={credentials} />
                    <Button onClick={handleClose} className="w-full">Done</Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                    {/* ── Email / Lead picker ── */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-sm font-medium text-gray-700">
                                Email <span className="text-red-500">*</span>
                            </label>
                            <button
                                type="button"
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                onClick={emailMode === 'lead' ? switchToManual : switchToLeads}
                            >
                                {emailMode === 'lead' ? 'Enter manually instead' : '← Pick from leads'}
                            </button>
                        </div>

                        {emailMode === 'lead' ? (
                            <div>
                                <select
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                                    onChange={handleLeadSelect}
                                    defaultValue=""
                                >
                                    <option value="">— Select a lead email —</option>
                                    {eligibleLeads.length === 0 && (
                                        <option disabled>No eligible leads found</option>
                                    )}
                                    {eligibleLeads.map((l) => (
                                        <option key={l.id} value={l.id}>
                                            {l.email}
                                            {l.status !== 'new'
                                                ? `  (${l.status.replace(/_/g, ' ')})`
                                                : ''}
                                        </option>
                                    ))}
                                </select>
                                {/* hidden inputs so react-hook-form tracks email + lead_id */}
                                <input type="hidden" {...register('email')} />
                                <input type="hidden" {...register('lead_id')} />
                                {errors.email && (
                                    <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
                                )}
                            </div>
                        ) : (
                            <Input
                                type="email"
                                placeholder="vendor@hospital.com"
                                error={errors.email?.message}
                                {...register('email')}
                            />
                        )}
                    </div>

                    <Input
                        label="Mobile Number * (becomes Login ID)"
                        placeholder="10-digit number"
                        error={errors.mobile_number?.message}
                        {...register('mobile_number')}
                    />

                    <Select
                        label="Service Category *"
                        error={errors.service_category_id?.message}
                        {...register('service_category_id')}
                    >
                        <option value="">Select category…</option>
                        {(categoriesData?.categories || []).map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </Select>

                    <Input
                        label="Facility Name *"
                        placeholder="Apollo Hospital"
                        error={errors.facility_name?.message}
                        {...register('facility_name')}
                    />

                    <Input
                        label="Custom Login ID"
                        placeholder="Leave blank to use mobile number"
                        error={errors.login_id?.message}
                        {...register('login_id')}
                    />

                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="secondary" type="button" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={isSubmitting || mutation.isPending}>
                            Create Vendor
                        </Button>
                    </div>
                </form>
            )}
        </Modal>
    );
}
