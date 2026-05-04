import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { login } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

const schema = z.object({
    login_id: z.string().regex(/^\d{10}$/, 'Login ID must be exactly 10 digits'),
    password: z.string().regex(/^\d{6}$/, 'Password must be exactly 6 digits'),
});

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const token = useAuthStore((s) => s.token);
    const user = useAuthStore((s) => s.user);
    const setAuth = useAuthStore((s) => s.setAuth);
    const { toast } = useToast();

    if (token && user?.password_reset_required) {
        return <Navigate to="/reset-password" replace />;
    }
    if (token && user && !user.password_reset_required) {
        return <Navigate to="/dashboard" replace />;
    }
    const [loading, setLoading] = useState(false);
    const [locked, setLocked] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({ resolver: zodResolver(schema) });

    const onSubmit = async (values) => {
        setLoading(true);
        setLocked(false);
        try {
            const data = await login({
                identifier: values.login_id,
                password: values.password,
            });
            setAuth(data.token, data.user);
            const dest =
                data.user.password_reset_required === true
                    ? '/reset-password'
                    : location.state?.from?.pathname || '/dashboard';
            navigate(dest, { replace: true });
        } catch (e) {
            const msg = e.response?.data?.error || 'Login failed';
            if (e.response?.status === 403 && /locked/i.test(msg)) {
                setLocked(true);
            }
            toast(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
                            R
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900">Rogveda Vendor</h1>
                            <p className="text-xs text-gray-500">vendor.rogveda.com</p>
                        </div>
                    </div>
                </CardHeader>
                <CardBody>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <Input
                            label="Login ID"
                            inputMode="numeric"
                            autoComplete="username"
                            maxLength={10}
                            placeholder="10-digit ID"
                            error={errors.login_id?.message}
                            {...register('login_id')}
                        />
                        <Input
                            label="Password"
                            type="password"
                            inputMode="numeric"
                            autoComplete="current-password"
                            maxLength={6}
                            placeholder="6-digit password"
                            error={errors.password?.message}
                            {...register('password')}
                        />
                        {locked && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                Your account is temporarily locked after too many failed attempts. Use
                                “Forgot password” on the main site or contact Rogveda support to request an
                                unlock link sent to your registered email.
                            </div>
                        )}
                        <Button type="submit" className="w-full" loading={loading}>
                            Sign in
                        </Button>
                    </form>
                </CardBody>
            </Card>
        </div>
    );
}
