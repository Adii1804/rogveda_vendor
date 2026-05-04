import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Users, Building2, FileCheck, TrendingUp } from 'lucide-react';
import { getDashboard } from '@/api/dashboard';
import { PageLoader } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/layout/PageHeader';

function StatCard({ title, value, sub, icon: Icon, color, to }) {
    const card = (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-500">{title}</p>
                    <p className={`mt-1 text-3xl font-bold ${color}`}>{value ?? '—'}</p>
                    {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
                </div>
                <div className={`rounded-lg p-2.5 ${color.replace('text', 'bg').replace('-700', '-100').replace('-600', '-100')}`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                </div>
            </div>
        </div>
    );

    return to ? <Link to={to}>{card}</Link> : card;
}

export default function DashboardPage() {
    const { data, isLoading } = useQuery({
        queryKey: ['dashboard'],
        queryFn: getDashboard,
        refetchInterval: 60_000,
    });

    if (isLoading) return <PageLoader />;

    const leads = data?.leads || {};
    const vendors = data?.vendors || {};

    return (
        <div className="p-8">
            <PageHeader title="Dashboard" subtitle="Welcome back — here's what's happening today." />

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Leads"
                    value={leads.total}
                    sub={`${leads.new ?? 0} new`}
                    icon={Users}
                    color="text-blue-700"
                    to="/leads"
                />
                <StatCard
                    title="Total Vendors"
                    value={vendors.total}
                    sub={`${vendors.active ?? 0} active`}
                    icon={Building2}
                    color="text-purple-700"
                    to="/vendors"
                />
                <StatCard
                    title="KYC Pending"
                    value={data?.pending_kyc_documents}
                    sub="documents to review"
                    icon={FileCheck}
                    color="text-amber-700"
                    to="/kyc"
                />
                <StatCard
                    title="Leads Converted"
                    value={leads.converted}
                    sub="total conversions"
                    icon={TrendingUp}
                    color="text-emerald-700"
                />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
                {/* Lead breakdown */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-4 text-sm font-semibold text-gray-900">Leads by Status</h2>
                    <div className="space-y-3">
                        {[
                            { label: 'New',          key: 'new',          color: 'bg-purple-500' },
                            { label: 'Contacted',    key: 'contacted',    color: 'bg-blue-500' },
                            { label: 'Under Review', key: 'under_review', color: 'bg-indigo-500' },
                            { label: 'Approved',     key: 'approved',     color: 'bg-emerald-500' },
                            { label: 'Rejected',     key: 'rejected',     color: 'bg-red-400' },
                        ].map(({ label, key, color }) => {
                            const count = leads[key] ?? 0;
                            const total = leads.total || 1;
                            const pct = Math.round((count / total) * 100);
                            return (
                                <div key={key}>
                                    <div className="mb-1 flex justify-between text-xs text-gray-600">
                                        <span>{label}</span>
                                        <span className="font-medium">{count}</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-gray-100">
                                        <div
                                            className={`h-1.5 rounded-full ${color} transition-all`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Vendor breakdown */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-4 text-sm font-semibold text-gray-900">Vendor KYC Status</h2>
                    <div className="space-y-3">
                        {[
                            { label: 'KYC Complete', key: 'complete', color: 'bg-emerald-500' },
                            { label: 'Under Review', key: 'under_review', color: 'bg-blue-500' },
                            { label: 'In Progress', key: 'in_progress', color: 'bg-yellow-500' },
                            { label: 'Not Started', key: 'not_started', color: 'bg-gray-400' },
                        ].map(({ label, key, color }) => {
                            const count = vendors[key] ?? 0;
                            const total = vendors.total || 1;
                            const pct = Math.round((count / total) * 100);
                            return (
                                <div key={key}>
                                    <div className="mb-1 flex justify-between text-xs text-gray-600">
                                        <span>{label}</span>
                                        <span className="font-medium">{count}</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-gray-100">
                                        <div
                                            className={`h-1.5 rounded-full ${color} transition-all`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
