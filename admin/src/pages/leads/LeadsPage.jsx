import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { getLeads } from '@/api/leads';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { PageLoader } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatDate } from '@/lib/utils';

// Matches the DB CHECK constraint on vendor_leads.status
const STATUSES = ['', 'new', 'contacted', 'under_review', 'approved', 'rejected'];
const PAGE_SIZE = 20;

export default function LeadsPage() {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimerRef = useRef(null);

    const { data, isLoading } = useQuery({
        queryKey: ['leads', page, status, debouncedSearch],
        queryFn: () =>
            getLeads({
                page,
                limit: PAGE_SIZE,
                ...(status && { status }),
                ...(debouncedSearch && { search: debouncedSearch }),
            }),
    });

    const leads = data?.leads || [];
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
            <PageHeader title="Vendor Leads" subtitle={`${total} total leads`} />

            <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Search by email…"
                        value={search}
                        onChange={handleSearch}
                    />
                </div>
                <Select
                    value={status}
                    onChange={(e) => {
                        setStatus(e.target.value);
                        setPage(1);
                    }}
                    className="w-44"
                >
                    {STATUSES.map((s) => (
                        <option key={s} value={s}>
                            {s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'All statuses'}
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
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Duplicate</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Submitted</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {leads.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-12 text-center text-sm text-gray-400">
                                        No leads found
                                    </td>
                                </tr>
                            ) : (
                                leads.map((lead) => (
                                    <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <Link
                                                to={`/leads/${lead.id}`}
                                                className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                                            >
                                                {lead.email}
                                            </Link>
                                            {lead.callback_reminder_at && (
                                                <p className="text-xs text-amber-600 mt-0.5">
                                                    Callback: {formatDate(lead.callback_reminder_at)}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge status={lead.status} />
                                        </td>
                                        <td className="px-4 py-3">
                                            {lead.is_duplicate ? (
                                                <span className="text-xs font-medium text-amber-600">Duplicate</span>
                                            ) : (
                                                <span className="text-xs text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{formatDate(lead.created_at)}</td>
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
                        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{' '}
                        {total}
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
        </div>
    );
}
