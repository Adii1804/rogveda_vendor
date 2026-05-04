import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePassword } from '@/api/auth';
import { requestDeactivation } from '@/api/account';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const pwdSchema = z
    .object({
        current_password: z.string().min(1, 'Required'),
        new_password: z.string().regex(/^\d{6}$/, 'Must be 6 digits'),
        confirm_password: z.string(),
    })
    .refine((d) => d.new_password === d.confirm_password, {
        message: 'Passwords do not match',
        path: ['confirm_password'],
    });

const deactSchema = z.object({
    reason: z.string().min(10, 'At least 10 characters'),
});

export default function SettingsPage() {
    const { toast } = useToast();
    const [showDeact, setShowDeact] = useState(false);

    const pwdForm = useForm({ resolver: zodResolver(pwdSchema) });
    const deactForm = useForm({ resolver: zodResolver(deactSchema) });

    const onPwd = async (values) => {
        try {
            await changePassword({
                current_password: values.current_password,
                new_password: values.new_password,
            });
            toast('Password updated');
            pwdForm.reset();
        } catch (e) {
            toast(e.response?.data?.error || 'Failed', 'error');
        }
    };

    const onDeact = async (values) => {
        try {
            await requestDeactivation({ reason: values.reason });
            toast('Request submitted');
            setShowDeact(false);
            deactForm.reset();
        } catch (e) {
            toast(e.response?.data?.error || 'Failed', 'error');
        }
    };

    return (
        <div className="p-8 max-w-lg space-y-8">
            <PageHeader title="Account settings" />

            <Card>
                <CardHeader>
                    <h2 className="text-sm font-semibold text-gray-900">Change password</h2>
                </CardHeader>
                <CardBody>
                    <form onSubmit={pwdForm.handleSubmit(onPwd)} className="space-y-4">
                        <Input
                            type="password"
                            label="Current password"
                            {...pwdForm.register('current_password')}
                            error={pwdForm.formState.errors.current_password?.message}
                        />
                        <Input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            label="New password (6 digits)"
                            {...pwdForm.register('new_password')}
                            error={pwdForm.formState.errors.new_password?.message}
                        />
                        <Input
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            label="Confirm new password"
                            {...pwdForm.register('confirm_password')}
                            error={pwdForm.formState.errors.confirm_password?.message}
                        />
                        <Button type="submit" loading={pwdForm.formState.isSubmitting}>
                            Update password
                        </Button>
                    </form>
                </CardBody>
            </Card>

            <Card>
                <CardHeader>
                    <h2 className="text-sm font-semibold text-gray-900">Deactivate account</h2>
                </CardHeader>
                <CardBody>
                    <p className="text-sm text-gray-600 mb-3">
                        Submit a request to deactivate your vendor account. Rogveda admin will review it.
                    </p>
                    <Button variant="danger" type="button" onClick={() => setShowDeact(true)}>
                        Request deactivation
                    </Button>
                </CardBody>
            </Card>

            <Modal open={showDeact} onClose={() => setShowDeact(false)} title="Request deactivation" size="sm">
                <form onSubmit={deactForm.handleSubmit(onDeact)} className="space-y-4">
                    <Textarea
                        label="Reason *"
                        rows={4}
                        {...deactForm.register('reason')}
                        error={deactForm.formState.errors.reason?.message}
                        placeholder="Tell us why you want to close this account…"
                    />
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setShowDeact(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="danger" loading={deactForm.formState.isSubmitting}>
                            Confirm request
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
