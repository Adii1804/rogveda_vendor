import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createVendor } from '@/api/vendors';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import client from '@/api/client';
import { useState } from 'react';

const schema = z.object({
    email: z.string().email('Invalid email'),
    mobile_number: z.string().regex(/^\d{10}$/, 'Must be 10 digits'),
    service_category_id: z.string().uuid('Select a category'),
    facility_name: z.string().optional(),
    login_id: z.string().optional(),
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
                Activate the vendor from their detail page, then use &quot;Send credentials&quot; so they receive login
                details by email. They must set a new password on first login.
            </p>
        </div>
    );
}

export function CreateVendorModal({ open, onClose }) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const [credentials, setCredentials] = useState(null);

    const { data: categoriesData } = useQuery({
        queryKey: ['service-categories'],
        queryFn: () => client.get('/public/categories').then((r) => r.data.data),
        enabled: open,
    });

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({ resolver: zodResolver(schema) });

    const mutation = useMutation({
        mutationFn: createVendor,
        onSuccess: (data) => {
            setCredentials(data);
            qc.invalidateQueries({ queryKey: ['vendors'] });
            toast('Vendor account created');
        },
        onError: (err) => toast(err.response?.data?.error || 'Failed to create vendor', 'error'),
    });

    const onSubmit = (data) => mutation.mutate(data);

    return (
        <Modal open={open} onClose={onClose} title="Create Vendor Account" size="md">
            {credentials ? (
                <div className="space-y-4">
                    <CredentialsBanner data={credentials} />
                    <Button onClick={onClose} className="w-full">Done</Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <Input
                        label="Email *"
                        type="email"
                        placeholder="vendor@hospital.com"
                        error={errors.email?.message}
                        {...register('email')}
                    />
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
                        label="Facility Name"
                        placeholder="Apollo Hospital (optional)"
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
                        <Button variant="secondary" type="button" onClick={onClose}>
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
