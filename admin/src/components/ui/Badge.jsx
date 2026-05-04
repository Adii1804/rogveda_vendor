import { cn } from '@/lib/utils';

const colors = {
    // KYC / profile status
    not_started: 'bg-gray-100 text-gray-600',
    in_progress: 'bg-yellow-100 text-yellow-700',
    under_review: 'bg-blue-100 text-blue-700',
    complete: 'bg-emerald-100 text-emerald-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
    // Vendor lead pipeline status
    new: 'bg-purple-100 text-purple-700',
    contacted: 'bg-blue-100 text-blue-700',
    // under_review and approved/rejected already covered above
    // Profile status
    draft: 'bg-gray-100 text-gray-600',
    // User status
    active: 'bg-emerald-100 text-emerald-700',
    inactive: 'bg-gray-100 text-gray-600',
    deactivated: 'bg-gray-200 text-gray-700',
    expired: 'bg-red-100 text-red-800',
    suspended: 'bg-red-100 text-red-700',
    // Generic
    pending: 'bg-yellow-100 text-yellow-700',
    uploaded: 'bg-blue-100 text-blue-700',
};

export function Badge({ status, label, className }) {
    const color = colors[status] || 'bg-gray-100 text-gray-600';
    const text = label || status?.replace(/_/g, ' ') || '';

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                color,
                className
            )}
        >
            {text}
        </span>
    );
}
