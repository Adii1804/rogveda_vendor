import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Building2,
    FileCheck,
    ListChecks,
    CalendarClock,
    UserX,
    LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { logout as apiLogout } from '@/api/auth';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getDeactivationRequests } from '@/api/vendors';

const MAIN_NAV = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/leads', icon: Users, label: 'Leads' },
    { to: '/vendors', icon: Building2, label: 'Vendors' },
];

const KYC_NAV = [
    { to: '/kyc', icon: FileCheck, label: 'Queue' },
    { to: '/kyc/checklist', icon: ListChecks, label: 'Checklist' },
    { to: '/kyc/expiring', icon: CalendarClock, label: 'Expiring' },
];

function NavItem({ to, icon: Icon, label, badge }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )
            }
        >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {badge > 9 ? '9+' : badge}
                </span>
            )}
        </NavLink>
    );
}

export function Sidebar() {
    const { user, clearAuth } = useAuthStore();
    const navigate = useNavigate();

    const { data: deactData } = useQuery({
        queryKey: ['deactivation-requests'],
        queryFn: getDeactivationRequests,
        staleTime: 60_000,
    });
    const pendingDeact = deactData?.total ?? 0;

    const handleLogout = async () => {
        try {
            await apiLogout();
        } finally {
            clearAuth();
            navigate('/login');
        }
    };

    return (
        <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
            <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
                    R
                </div>
                <span className="font-semibold text-gray-900">Rogveda Admin</span>
            </div>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
                {MAIN_NAV.map((item) => (
                    <NavItem key={item.to} {...item} />
                ))}

                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    KYC
                </p>
                {KYC_NAV.map((item) => (
                    <NavItem key={item.to} {...item} />
                ))}

                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Vendors
                </p>
                <NavItem
                    to="/vendors/deactivation-requests"
                    icon={UserX}
                    label="Deactivation requests"
                    badge={pendingDeact}
                />
            </nav>

            <div className="border-t border-gray-200 p-3">
                <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-sm">
                        {user?.account_type === 'system_admin' ? 'SA' : 'A'}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                            {user?.email || 'Admin'}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">
                            {user?.account_type?.replace('_', ' ')}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                    <LogOut className="h-4 w-4" />
                    Sign out
                </button>
            </div>
        </aside>
    );
}
