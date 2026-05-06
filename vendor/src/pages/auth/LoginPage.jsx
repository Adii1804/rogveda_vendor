import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import ReCAPTCHA from 'react-google-recaptcha';
import { login } from '@/api/auth';
import { requestLeadOtp, verifyLeadOtp } from '@/api/leads';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

// ─── Login schema ─────────────────────────────────────────────────────────────

const loginSchema = z.object({
    login_id: z.string().min(1, 'Login ID or email is required'),
    password: z.string().regex(/^\d{6}$/, 'Password must be exactly 6 digits'),
});

// ─── OTP input boxes ──────────────────────────────────────────────────────────

function OtpInputs({ value, onChange, disabled }) {
    const refs = useRef([]);
    const chars = (value + '      ').slice(0, 6).split('');
    const write = (next) => onChange(next.replace(/\D/g, '').slice(0, 6));

    useEffect(() => {
        refs.current[0]?.focus();
    }, []);

    const handleChange = (i, e) => {
        const raw = e.target.value.replace(/\D/g, '');
        if (!raw) {
            write(value.slice(0, i) + value.slice(i + 1));
            return;
        }
        write(value.slice(0, i) + raw.slice(-1) + value.slice(i + 1));
        if (i < 5) refs.current[i + 1]?.focus();
    };

    const handleKeyDown = (i, e) => {
        if (e.key === 'Backspace') {
            if (value[i]) {
                write(value.slice(0, i) + value.slice(i + 1));
            } else if (i > 0) {
                refs.current[i - 1]?.focus();
                write(value.slice(0, i - 1) + value.slice(i));
            }
            e.preventDefault();
        }
    };

    const onPaste = (e) => {
        e.preventDefault();
        const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        write(t);
        refs.current[Math.min(Math.max(t.length - 1, 0), 5)]?.focus();
    };

    return (
        <div className="flex gap-2 justify-center" onPaste={onPaste}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <input
                    key={i}
                    ref={(el) => { refs.current[i] = el; }}
                    inputMode="numeric"
                    maxLength={1}
                    disabled={disabled}
                    value={chars[i]?.trim() ? chars[i] : ''}
                    onChange={(e) => handleChange(i, e)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className={cn(
                        'h-12 w-10 rounded-lg border text-center text-lg font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200',
                        disabled ? 'bg-gray-100 text-gray-400' : 'border-gray-300 bg-white text-gray-900'
                    )}
                />
            ))}
        </div>
    );
}

// ─── Join flow (email → OTP → success) ───────────────────────────────────────

function JoinForm({ onBack }) {
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        if (step !== 2 || cooldown <= 0) return undefined;
        const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
        return () => clearInterval(id);
    }, [step, cooldown]);

    const otpMut = useMutation({
        mutationFn: () => requestLeadOtp(email.trim().toLowerCase()),
        onSuccess: () => {
            setStep(2);
            setOtp('');
            setCooldown(60);
            toast('OTP sent to your email');
        },
        onError: (e) => toast(e.response?.data?.error || 'Could not send OTP', 'error'),
    });

    const verifyMut = useMutation({
        mutationFn: () => verifyLeadOtp(email.trim().toLowerCase(), otp, phone.trim()),
        onSuccess: () => { setStep(3); },
        onError: (e) => toast(e.response?.data?.error || 'Invalid OTP', 'error'),
    });

    const resendMut = useMutation({
        mutationFn: () => requestLeadOtp(email.trim().toLowerCase()),
        onSuccess: () => { setCooldown(60); setOtp(''); toast('New OTP sent'); },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const phoneValid = /^\d{10}$/.test(phone.trim());

    if (step === 3) {
        return (
            <div className="text-center space-y-3 py-2">
                <div className="flex justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                        <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>
                <p className="text-base font-semibold text-gray-900">Interest submitted!</p>
                <p className="text-sm text-gray-600">
                    Our team will review your request and contact you at{' '}
                    <span className="font-medium">{email.trim().toLowerCase()}</span> within 24–48 hours.
                </p>
                <button
                    type="button"
                    onClick={onBack}
                    className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                    ← Back to sign in
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {step === 1 && (
                <>
                    <p className="text-sm text-gray-600">
                        Enter your details below. We'll send a one-time code to verify your email.
                    </p>
                    <Input
                        type="email"
                        label="Work Email"
                        placeholder="you@hospital.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                    />
                    <Input
                        type="tel"
                        label="Phone Number"
                        placeholder="10-digit mobile number"
                        inputMode="numeric"
                        maxLength={10}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        autoComplete="tel"
                        onKeyDown={(e) => e.key === 'Enter' && emailValid && phoneValid && otpMut.mutate()}
                    />
                    <Button
                        className="w-full"
                        loading={otpMut.isPending}
                        disabled={!emailValid || !phoneValid}
                        onClick={() => otpMut.mutate()}
                    >
                        Send OTP
                    </Button>
                </>
            )}

            {step === 2 && (
                <>
                    <p className="text-sm text-gray-600">
                        Enter the 6-digit code sent to{' '}
                        <span className="font-medium">{email}</span>
                    </p>
                    <OtpInputs value={otp} onChange={setOtp} disabled={verifyMut.isPending} />
                    <Button
                        className="w-full"
                        loading={verifyMut.isPending}
                        disabled={otp.length !== 6}
                        onClick={() => verifyMut.mutate()}
                    >
                        Verify &amp; Submit
                    </Button>
                    <div className="text-center text-sm">
                        <button
                            type="button"
                            className={cn(
                                'font-medium transition-colors',
                                cooldown > 0 || resendMut.isPending
                                    ? 'text-gray-400 cursor-not-allowed'
                                    : 'text-blue-600 cursor-pointer hover:text-blue-800 hover:underline'
                            )}
                            onClick={() => cooldown === 0 && !resendMut.isPending && resendMut.mutate()}
                            disabled={cooldown > 0 || resendMut.isPending}
                        >
                            {resendMut.isPending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                        </button>
                    </div>
                </>
            )}

            <div className="pt-1 text-center">
                <button
                    type="button"
                    onClick={onBack}
                    className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
                >
                    ← Back to sign in
                </button>
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const token = useAuthStore((s) => s.token);
    const user = useAuthStore((s) => s.user);
    const setAuth = useAuthStore((s) => s.setAuth);
    const { toast } = useToast();

    const [mode, setMode] = useState('login'); // 'login' | 'join'
    const [loading, setLoading] = useState(false);
    const [locked, setLocked] = useState(false);
    const [captchaToken, setCaptchaToken] = useState('');
    const captchaRef = useRef(null);

    if (token && user?.password_reset_required) return <Navigate to="/reset-password" replace />;
    if (token && user && !user.password_reset_required) return <Navigate to="/dashboard" replace />;

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({ resolver: zodResolver(loginSchema) });

    const onSubmit = async (values) => {
        if (RECAPTCHA_SITE_KEY && !captchaToken) {
            toast('Please complete the CAPTCHA', 'error');
            return;
        }
        setLoading(true);
        setLocked(false);
        try {
            const data = await login({
                identifier: values.login_id,
                password: values.password,
                recaptcha_token: captchaToken,
            });
            setAuth(data.token, data.user);
            const dest = data.user.password_reset_required === true
                ? '/reset-password'
                : location.state?.from?.pathname || '/dashboard';
            navigate(dest, { replace: true });
        } catch (e) {
            const msg = e.response?.data?.error || 'Login failed';
            if (e.response?.status === 403 && /locked/i.test(msg)) setLocked(true);
            toast(msg, 'error');
            // Reset captcha on any error so user must re-verify
            captchaRef.current?.reset();
            setCaptchaToken('');
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
                    {mode === 'login' ? (
                        <div className="space-y-4">
                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                <Input
                                    label="Login ID or Email"
                                    autoComplete="username"
                                    placeholder="10-digit ID or email address"
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
                                        Your account is temporarily locked after too many failed attempts.
                                        Contact Rogveda support to request an unlock link.
                                    </div>
                                )}
                                {RECAPTCHA_SITE_KEY && (
                                    <div className="flex justify-center">
                                        <ReCAPTCHA
                                            ref={captchaRef}
                                            sitekey={RECAPTCHA_SITE_KEY}
                                            onChange={(token) => setCaptchaToken(token || '')}
                                            onExpired={() => setCaptchaToken('')}
                                        />
                                    </div>
                                )}
                                <Button
                                    type="submit"
                                    className="w-full"
                                    loading={loading}
                                    disabled={RECAPTCHA_SITE_KEY ? !captchaToken : false}
                                >
                                    Sign in
                                </Button>
                            </form>

                            {/* ── Divider ── */}
                            <div className="flex items-center gap-3 py-1">
                                <div className="flex-1 border-t border-gray-200" />
                                <span className="text-xs text-gray-400 shrink-0">New to Rogveda?</span>
                                <div className="flex-1 border-t border-gray-200" />
                            </div>

                            <button
                                type="button"
                                onClick={() => setMode('join')}
                                className="w-full rounded-lg border border-blue-200 bg-blue-50 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                                Join us as a vendor →
                            </button>
                        </div>
                    ) : (
                        <JoinForm onBack={() => setMode('login')} />
                    )}
                </CardBody>
            </Card>
        </div>
    );
}
