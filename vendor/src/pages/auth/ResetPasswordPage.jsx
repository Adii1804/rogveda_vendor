import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

const schema = z
    .object({
        new_password: z.string().regex(/^\d{6}$/, 'Must be exactly 6 digits'),
        confirm_password: z.string(),
    })
    .refine((d) => d.new_password === d.confirm_password, {
        message: 'Passwords do not match',
        path: ['confirm_password'],
    });

export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const patchUser = useAuthStore((s) => s.patchUser);
    const { toast } = useToast();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({ resolver: zodResolver(schema) });

    const onSubmit = async (values) => {
        try {
            await changePassword({ new_password: values.new_password });
            patchUser({ password_reset_required: false });
            toast('Password updated');
            navigate('/kyc', { replace: true });
        } catch (e) {
            toast(e.response?.data?.error || 'Failed', 'error');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <h1 className="text-lg font-semibold text-gray-900">Set a new password</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        For security, choose a new 6-digit numeric password before continuing.
                    </p>
                </CardHeader>
                <CardBody>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <Input
                            label="New password"
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            error={errors.new_password?.message}
                            {...register('new_password')}
                        />
                        <Input
                            label="Confirm password"
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            error={errors.confirm_password?.message}
                            {...register('confirm_password')}
                        />
                        <Button type="submit" className="w-full" loading={isSubmitting}>
                            Save password
                        </Button>
                    </form>
                </CardBody>
            </Card>
        </div>
    );
}
