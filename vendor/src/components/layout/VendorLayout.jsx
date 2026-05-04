import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, FileCheck, UserCircle, Settings, LogOut, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { logout as apiLogout } from '@/api/auth';
import { getProfile } from '@/api/profile';
import { getNotifications, markNotificationsRead } from '@/api/notifications';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '@/lib/utils';

const NAV = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/kyc', icon: FileCheck, label: 'KYC' },
    { to: '/profile', icon: UserCircle, label: 'Profile' },
    { to: '/settings', icon: Settings, label: 'Settings' },
];

export function VendorLayout() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const token = useAuthStore((s) => s.token);
    const { user, clearAuth, patchUser } = useAuthStore();
    const [notifOpen, setNotifOpen] = useState(false);
    const panelRef = useRef(null);

    const { data: profile } = useQuery({
        queryKey: ['vendor-profile'],
        queryFn: getProfile,
        enabled: Boolean(token),
        staleTime: 30_000,
    });

    useEffect(() => {
        if (profile?.kyc_status != null) {
            patchUser({
                kyc_status: profile.kyc_status,
                profile_status: profile.profile_status,
            });
        }
    }, [profile, patchUser]);

    const { data: notifData } = useQuery({
        queryKey: ['vendor-notifications'],
        queryFn: getNotifications,
        refetchInterval: 60_000,
    });

    const markReadMut = useMutation({
        mutationFn: markNotificationsRead,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['vendor-notifications'] });
        },
    });

    useEffect(() => {
        const h = (e) => {
            if (!panelRef.current?.contains(e.target)) setNotifOpen(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const handleLogout = async () => {
        try {
            await apiLogout();
        } finally {
            clearAuth();
            navigate('/login');
        }
    };

    const toggleNotif = () => {
        const next = !notifOpen;
        setNotifOpen(next);
        if (next) markReadMut.mutate();
    };

    const unread = notifData?.unread_count ?? 0;
    const list = notifData?.notifications || [];

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs">
                                R
                            </div>
                            <span className="font-semibold text-gray-900 text-sm">Rogveda Vendor</span>
                        </div>
                        <nav className="hidden md:flex items-center gap-1">
                            {NAV.map(({ to, icon: Icon, label }) => (
                                <NavLink
                                    key={to}
                                    to={to}
                                    className={({ isActive }) =>
                                        cn(
                                            'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium',
                                            isActive
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-gray-600 hover:bg-gray-100'
                                        )
                                    }
                                >
                                    <Icon className="h-4 w-4" />
                                    {label}
                                </NavLink>
                            ))}
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative" ref={panelRef}>
                            <button
                                type="button"
                                onClick={toggleNotif}
                                className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                                aria-label="Notifications"
                            >
                                <Bell className="h-5 w-5" />
                                {unread > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                        {unread > 9 ? '9+' : unread}
                                    </span>
                                )}
                            </button>
                            {notifOpen && (
                                <div className="absolute right-0 mt-1 w-80 rounded-xl border border-gray-200 bg-white shadow-lg max-h-96 overflow-y-auto">
                                    <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">
                                        Notifications
                                    </div>
                                    {!list.length ? (
                                        <p className="px-3 py-6 text-sm text-gray-500 text-center">No notifications yet.</p>
                                    ) : (
                                        list.map((n) => (
                                            <div key={n.id} className="border-b border-gray-50 px-3 py-2.5">
                                                <p className="text-sm font-medium text-gray-900">{n.title}</p>
                                                {n.body && <p className="text-xs text-gray-600 mt-0.5">{n.body}</p>}
                                                <p className="text-[10px] text-gray-400 mt-1">
                                                    {formatDateTime(n.created_at)}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                        <span className="hidden sm:inline text-xs text-gray-500 truncate max-w-[140px]">
                            {user?.email}
                        </span>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="hidden sm:inline">Sign out</span>
                        </button>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-6xl">
                <Outlet />
            </main>
        </div>
    );
}
