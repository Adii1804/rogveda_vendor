import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getExpiringDocuments } from '@/api/vendors';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/Spinner';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

function urgencyClass(days) {
    if (days == null) return 'bg-gray-50';
    if (days < 0) return 'bg-red-50';
    if (days <= 7) return 'bg-red-50';
    if (days <= 30) return 'bg-amber-50';
    return 'bg-yellow-50';
}

function rowStatus(days) {
    if (days == null) return { label: '—', status: 'pending' };
    if (days < 0) return { label: 'Expired', status: 'expired' };
    return { label: 'Expiring soon', status: 'pending' };
}

export default function KycExpiringPage() {
    const { data, isLoading } = useQuery({
        queryKey: ['kyc-expiring', 60],
        queryFn: () => getExpiringDocuments({ days: 60 }),
    });

    const documents = data?.documents || [];

    return (
        <div className="p-8 max-w-6xl">
            <PageHeader
                title="Document expiry"
                subtitle="KYC documents renewing or expired within the next 60 days"
            />

            {isLoading ? (
                <PageLoader />
            ) : (
                <Card className="mt-6 overflow-hidden">
                    <CardHeader>
                        <h2 className="text-sm font-semibold text-gray-900">
                            {documents.length} document{documents.length === 1 ? '' : 's'}
                        </h2>
                    </CardHeader>
                    <CardBody className="p-0 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                                    <th className="px-4 py-3">Vendor</th>
                                    <th className="px-4 py-3">Document</th>
                                    <th className="px-4 py-3">Expiry</th>
                                    <th className="px-4 py-3">Days left</th>
                                    <th className="px-4 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((d) => {
                                    const days = d.days_until_expiry;
                                    const st = rowStatus(days);
                                    return (
                                        <tr
                                            key={d.id}
                                            className={cn('border-b border-gray-100', urgencyClass(days))}
                                        >
                                            <td className="px-4 py-3">
                                                <Link
                                                    to={`/vendors/${d.vendor_id}`}
                                                    className="font-medium text-blue-600 hover:text-blue-800"
                                                >
                                                    {d.facility_name || d.vendor_email}
                                                </Link>
                                                <p className="text-xs text-gray-500">{d.vendor_email}</p>
                                            </td>
                                            <td className="px-4 py-3 text-gray-900">{d.document_name}</td>
                                            <td className="px-4 py-3">{formatDate(d.renewal_date)}</td>
                                            <td className="px-4 py-3 font-mono">{days}</td>
                                            <td className="px-4 py-3">
                                                <Badge status={st.status} label={st.label} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {!documents.length && (
                            <p className="px-4 py-10 text-center text-sm text-gray-500">
                                No expiring documents in this window.
                            </p>
                        )}
                    </CardBody>
                </Card>
            )}
        </div>
    );
}
