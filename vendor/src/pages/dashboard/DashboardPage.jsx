import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Check } from 'lucide-react';

function Step({ done, label, to, hint }) {
    return (
        <div className="flex gap-3 py-3 border-b border-gray-100 last:border-0">
            <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done ? 'bg-emerald-500 text-white' : 'border border-gray-300 text-gray-400'
                }`}
            >
                {done ? <Check className="h-3.5 w-3.5" /> : ''}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{label}</p>
                {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
                {!done && to && (
                    <Link to={to} className="text-xs text-blue-600 hover:text-blue-800 mt-1 inline-block">
                        Go to step
                    </Link>
                )}
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const user = useAuthStore((s) => s.user);

    const pwdOk = !user?.password_reset_required;
    const kyc = user?.kyc_status;
    const profile = user?.profile_status;

    const kycComplete = kyc === 'complete';
    const profileApproved = profile === 'approved';

    const fullyOnboarded = pwdOk && kycComplete && profileApproved;

    return (
        <div className="p-8 max-w-xl">
            <PageHeader title="Dashboard" subtitle="Onboarding progress" />

            {fullyOnboarded ? (
                <Card className="mt-6">
                    <CardBody>
                        <p className="text-sm text-gray-800">
                            Onboarding complete! Your profile is live once you add a listing.
                        </p>
                    </CardBody>
                </Card>
            ) : (
                <Card className="mt-6">
                    <CardBody className="p-0 px-4">
                        <Step done={true} label="Account activated" />
                        <Step
                            done={pwdOk}
                            label="Password set"
                            to="/reset-password"
                            hint={!pwdOk ? 'You must set a new password to continue.' : undefined}
                        />
                        <Step
                            done={kycComplete}
                            label={`KYC complete (${kyc || 'pending'})`}
                            to="/kyc"
                            hint={!kycComplete ? 'Upload and submit your KYC documents.' : undefined}
                        />
                        <Step
                            done={profileApproved}
                            label={`Profile approved (${profile || 'draft'})`}
                            to="/profile"
                            hint={kycComplete && !profileApproved ? 'Complete and submit your facility profile.' : undefined}
                        />
                    </CardBody>
                </Card>
            )}
        </div>
    );
}
