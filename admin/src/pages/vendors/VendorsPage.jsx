import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { getVendors } from '@/api/vendors';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { PageLoader } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/layout/PageHeader';
import { CreateVendorModal } from './CreateVendorModal';
import { formatDate } from '@/lib/utils';

const KYC_STATUSES = ['', 'not_started', 'in_progress', 'under_review', 'complete'];
const PAGE_SIZE = 20;

export default function VendorsPage() {
    const [page, setPage] = useState(1);
    const [kycStatus, setKycStatus] = useState('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [createModalKey, setCreateModalKey] = useState(0);
    const searchTimerRef = useRef(null);

    const { data, isLoading } = useQuery({
        queryKey: ['vendors', page, kycStatus, debouncedSearch],
        queryFn: () =>
            getVendors({
                page,
                limit: PAGE_SIZE,
                ...(kycStatus && { kyc_status: kycStatus }),
                ...(debouncedSearch && { search: debouncedSearch }),
            }),
    });

    const vendors = data?.vendors || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const handleSearch = useCallback((e) => {
        const value = e.target.value;
        setSearch(value);
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            setDebouncedSearch(value);
            setPage(1);
        }, 400);
    }, []);

    return (
        <div className="p-8">
            <PageHeader
                title="Vendors"
                subtitle={`${total} total vendors`}
                action={
                    <Button
                        onClick={() => {
                            setCreateModalKey((k) => k + 1);
                            setShowCreate(true);
                        }}
                    >
                        <Plus className="h-4 w-4" />
                        Add Vendor
                    </Button>
                }
            />

            <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Search vendors…"
                        value={search}
                        onChange={handleSearch}
                    />
                </div>
                <Select
                    value={kycStatus}
                    onChange={(e) => { setKycStatus(e.target.value); setPage(1); }}
                    className="w-44"
                >
                    {KYC_STATUSES.map((s) => (
                        <option key={s} value={s}>
                            {s ? s.replace(/_/g, ' ') : 'All KYC statuses'}
                        </option>
                    ))}
                </Select>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {isLoading ? (
                    <PageLoader />
                ) : (
                    <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Vendor</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Category</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Account</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">KYC</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Profile</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Added</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {vendors.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-sm text-gray-400">
                                        No vendors found
                                    </td>
                                </tr>
                            ) : (
                                vendors.map((v) => (
                                    <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <Link
                                                to={`/vendors/${v.id}`}
                                                className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                                            >
                                                {v.facility_name || v.email}
                                            </Link>
                                            <p className="text-xs text-gray-400">{v.email}</p>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 capitalize">{v.category_name || '—'}</td>
                                        <td className="px-4 py-3">
                                            <Badge status={v.account_status} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge status={v.kyc_status} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge status={v.profile_status} />
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{formatDate(v.created_at)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                    <span>
                        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                    </span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setPage((p) => p - 1)}
                            disabled={page === 1}
                            className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-40"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setPage((p) => p + 1)}
                            disabled={page === totalPages}
                            className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50 disabled:opacity-40"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            <CreateVendorModal
                key={createModalKey}
                open={showCreate}
                onClose={() => setShowCreate(false)}
            />
        </div>
    );
}
