import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { login } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const schema = z.object({
    identifier: z.string().min(1, 'Email or Login ID is required'),
    password: z.string().min(1, 'Password is required'),
    remember_me: z.boolean().optional(),
});

export default function LoginPage() {
    const navigate = useNavigate();
    const setAuth = useAuthStore((s) => s.setAuth);
    const [serverError, setServerError] = useState('');

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({ resolver: zodResolver(schema) });

    const onSubmit = async (data) => {
        setServerError('');
        try {
            const res = await login(data);
            setAuth(res.data.token, res.data.user);
            navigate('/dashboard', { replace: true });
        } catch (err) {
            const msg = err.response?.data?.error || 'Login failed. Please try again.';
            setServerError(msg);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-sm">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xl">
                        R
                    </div>
                    <h1 className="text-2xl font-semibold text-gray-900">Rogveda Admin</h1>
                    <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                        <Input
                            label="Email or Login ID"
                            placeholder="admin@rogveda.com"
                            autoComplete="username"
                            error={errors.identifier?.message}
                            {...register('identifier')}
                        />
                        <Input
                            label="Password"
                            type="password"
                            placeholder="••••••••"
                            autoComplete="current-password"
                            error={errors.password?.message}
                            {...register('password')}
                        />

                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                            <input
                                type="checkbox"
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                {...register('remember_me')}
                            />
                            Remember me for 30 days
                        </label>

                        {serverError && (
                            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                                {serverError}
                            </p>
                        )}

                        <Button type="submit" loading={isSubmitting} className="w-full mt-1">
                            Sign in
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
