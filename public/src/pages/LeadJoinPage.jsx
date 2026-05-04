import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { requestLeadOtp, verifyLeadOtp } from '@/api/leads';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

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
            const left = value.slice(0, i);
            const right = value.slice(i + 1);
            write(left + right);
            return;
        }
        const digit = raw.slice(-1);
        const left = value.slice(0, i);
        const right = value.slice(i + 1);
        write(left + digit + right);
        if (i < 5) refs.current[i + 1]?.focus();
    };

    const handleKeyDown = (i, e) => {
        if (e.key === 'Backspace') {
            if (value[i]) {
                const left = value.slice(0, i);
                const right = value.slice(i + 1);
                write(left + right);
            } else if (i > 0) {
                refs.current[i - 1]?.focus();
                const left = value.slice(0, i - 1);
                const right = value.slice(i);
                write(left + right);
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
                    ref={(el) => {
                        refs.current[i] = el;
                    }}
                    inputMode="numeric"
                    maxLength={1}
                    disabled={disabled}
                    value={chars[i]?.trim() ? chars[i] : ''}
                    onChange={(e) => handleChange(i, e)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className={cn(
                        'h-12 w-10 rounded-lg border text-center text-lg font-semibold outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-200',
                        disabled ? 'bg-gray-100 text-gray-400' : 'border-gray-300 bg-white text-gray-900'
                    )}
                />
            ))}
        </div>
    );
}

export default function LeadJoinPage() {
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
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
        mutationFn: () => verifyLeadOtp(email.trim().toLowerCase(), otp),
        onSuccess: () => {
            setStep(3);
            toast('Verified');
        },
        onError: (e) => toast(e.response?.data?.error || 'Invalid OTP', 'error'),
    });

    const resendMut = useMutation({
        mutationFn: () => requestLeadOtp(email.trim().toLowerCase()),
        onSuccess: () => {
            setCooldown(60);
            setOtp('');
            toast('New OTP sent');
        },
        onError: (e) => toast(e.response?.data?.error || 'Failed', 'error'),
    });

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
            <Card className="w-full max-w-md border-blue-100 shadow-xl">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] text-white font-bold">
                            R
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900">Join Rogveda as a vendor</h1>
                            <p className="text-xs text-gray-500">Medical tourism marketplace</p>
                        </div>
                    </div>
                </CardHeader>
                <CardBody className="space-y-6">
                    {step === 1 && (
                        <>
                            <p className="text-sm text-gray-600">
                                Enter your work email. We will send a one-time code to verify it.
                            </p>
                            <Input
                                type="email"
                                label="Email"
                                placeholder="you@hospital.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                            />
                            <Button
                                className="w-full bg-[#2563EB] hover:bg-blue-700"
                                loading={otpMut.isPending}
                                disabled={!emailValid}
                                onClick={() => otpMut.mutate()}
                            >
                                Get OTP
                            </Button>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <p className="text-sm text-gray-600">
                                Enter the 6-digit code sent to <span className="font-medium">{email}</span>
                            </p>
                            <OtpInputs value={otp} onChange={setOtp} disabled={verifyMut.isPending} />
                            <Button
                                className="w-full bg-[#2563EB] hover:bg-blue-700"
                                loading={verifyMut.isPending}
                                disabled={otp.length !== 6}
                                onClick={() => verifyMut.mutate()}
                            >
                                Verify OTP
                            </Button>
                            <div className="text-center text-sm">
                                <button
                                    type="button"
                                    className={cn(
                                        'font-medium transition-colors',
                                        cooldown > 0 || resendMut.isPending
                                            ? 'text-gray-400 cursor-not-allowed'
                                            : 'text-[#2563EB] cursor-pointer hover:text-blue-800 hover:underline'
                                    )}
                                    onClick={() => cooldown === 0 && !resendMut.isPending && resendMut.mutate()}
                                    disabled={cooldown > 0 || resendMut.isPending}
                                >
                                    {resendMut.isPending
                                        ? 'Sending…'
                                        : cooldown > 0
                                        ? `Resend OTP in ${cooldown}s`
                                        : 'Resend OTP'}
                                </button>
                            </div>
                        </>
                    )}

                    {step === 3 && (
                        <div className="text-center space-y-3 py-2">
                            <p className="text-lg font-semibold text-gray-900">Thank you!</p>
                            <p className="text-sm text-gray-600">
                                Our team will contact you within 24–48 hours.
                            </p>
                            <p className="text-xs text-gray-500 break-all">{email.trim().toLowerCase()}</p>
                        </div>
                    )}
                </CardBody>
            </Card>
        </div>
    );
}
