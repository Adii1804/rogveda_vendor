import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { getProfile, updateProfile, uploadFacilityPhoto, submitProfile } from '@/api/profile';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/store/auth';

const schema = z.object({
    facility_name: z.string().min(1, 'Required'),
    city: z.string().min(1, 'Required'),
    full_address: z.string().optional(),
    description: z.string().min(1, 'Required').max(1000, 'Max 1000 characters'),
    contact_email: z.string().email(),
    contact_mobile: z.string().min(5, 'Required'),
    website_url: z.preprocess(
        (v) => (v === undefined || v === null ? '' : v),
        z.union([z.literal(''), z.string().url('Enter a valid URL')])
    ),
});

export default function ProfilePage() {
    const qc = useQueryClient();
    const { toast } = useToast();
    const patchUser = useAuthStore((s) => s.patchUser);

    const { data, isLoading } = useQuery({
        queryKey: ['vendor-profile'],
        queryFn: getProfile,
    });

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            facility_name: '',
            city: '',
            full_address: '',
            description: '',
            contact_email: '',
            contact_mobile: '',
            website_url: '',
        },
    });

    useEffect(() => {
        if (!data) return;
        form.reset({
            facility_name: data.facility_name || '',
            city: data.city || '',
            full_address: data.full_address || '',
            description: data.description || '',
            contact_email: data.contact_email || data.email || '',
            contact_mobile: data.contact_mobile || '',
            website_url: data.website_url || '',
        });
    }, [data, form]);

    const saveMut = useMutation({
        mutationFn: (body) => updateProfile(body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['vendor-profile'] });
            toast('Draft saved');
        },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    const photoMut = useMutation({
        mutationFn: (file) => uploadFacilityPhoto(file),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['vendor-profile'] });
            toast('Photo added');
        },
        onError: (e) => toast(e.response?.data?.error || 'Upload failed', 'error'),
    });

    const submitMut = useMutation({
        mutationFn: async (values) => {
            // Always persist current form values before submitting so the backend
            // doesn't see stale / empty DB rows when it checks required fields.
            await updateProfile(values);
            return submitProfile();
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['vendor-profile'] });
            patchUser({ profile_status: 'under_review' });
            toast('Profile submitted for review');
        },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    if (isLoading || !data) return <PageLoader />;

    const status = data.profile_status;
    const previews = data.facility_photo_previews || [];
    const paths = data.facility_photo_urls || [];

    const removePhoto = (path) => {
        const next = paths.filter((p) => p !== path);
        saveMut.mutate({ facility_photo_urls: next });
    };

    const descLen = form.watch('description')?.length || 0;

    const profileBanner = () => {
        const labels = {
            draft: 'Draft — save or submit when ready.',
            under_review: 'Under review — you cannot edit until a decision is made.',
            approved: 'Profile approved',
            rejected: 'Rejected — update using the feedback below and resubmit.',
        };
        return labels[status] || status;
    };

    return (
        <div className="p-8 max-w-2xl">
            <PageHeader title="Facility profile" subtitle="Tell patients about your facility" />

            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                <span className="font-medium">Profile status:</span> {profileBanner()}{' '}
                <Badge status={status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'draft'} />
            </div>

            {status === 'approved' && (
                <p className="mt-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                    Your profile is approved. It will appear on the marketplace once you have a live listing.
                </p>
            )}

            {status === 'rejected' && data.profile_rejection_reason && (
                <p className="mt-3 text-sm text-red-600">{data.profile_rejection_reason}</p>
            )}

            {status === 'under_review' ? (
                <p className="mt-6 text-sm text-gray-600">Your profile is being reviewed by Rogveda.</p>
            ) : status === 'approved' ? null : (
                <form
                    className="mt-6 space-y-5"
                    onSubmit={form.handleSubmit((values) => saveMut.mutate(values))}
                >
                    <Input label="Facility name" {...form.register('facility_name')} error={form.formState.errors.facility_name?.message} />
                    <div>
                        <Select label="Vendor category" value={data.service_category_id} disabled>
                            <option>{data.category_name}</option>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">Category is set by your account and cannot be changed.</p>
                    </div>
                    <Input label="City / location" {...form.register('city')} error={form.formState.errors.city?.message} />
                    <Textarea label="Full address (optional)" rows={2} {...form.register('full_address')} />
                    <div>
                        <Textarea
                            label="About / description"
                            rows={5}
                            {...form.register('description')}
                            error={form.formState.errors.description?.message}
                        />
                        <p className="text-xs text-gray-500 mt-1 text-right">{descLen} / 1000</p>
                    </div>
                    <Input label="Contact email" type="email" {...form.register('contact_email')} error={form.formState.errors.contact_email?.message} />
                    <Input label="Contact mobile" {...form.register('contact_mobile')} error={form.formState.errors.contact_mobile?.message} />
                    <Input
                        label="Website or social URL (optional)"
                        placeholder="https://"
                        {...form.register('website_url')}
                        error={form.formState.errors.website_url?.message}
                    />

                    <Card>
                        <CardBody className="space-y-3">
                            <p className="text-sm font-medium text-gray-900">Facility photos (optional, max 10)</p>
                            <div className="flex flex-wrap gap-2">
                                {previews.map((p) => (
                                    <div key={p.storage_path} className="relative h-20 w-20 rounded-lg border overflow-hidden group">
                                        {p.signed_url ? (
                                            <img src={p.signed_url} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="h-full w-full bg-gray-100" />
                                        )}
                                        <button
                                            type="button"
                                            className="absolute inset-0 bg-black/40 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => removePhoto(p.storage_path)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {paths.length < 10 && (
                                <div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="text-sm"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) photoMut.mutate(f);
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                            )}
                        </CardBody>
                    </Card>

                    <div className="flex flex-wrap gap-3">
                        <Button type="submit" variant="secondary" loading={saveMut.isPending}>
                            Save as draft
                        </Button>
                        <Button
                            type="button"
                            onClick={form.handleSubmit((values) => submitMut.mutate(values))}
                            loading={submitMut.isPending}
                        >
                            Submit for review
                        </Button>
                    </div>
                </form>
            )}
        </div>
    );
}
