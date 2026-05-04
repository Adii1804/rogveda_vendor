import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { Toaster } from '@/components/ui/Toast';

import { VendorLayout } from '@/components/layout/VendorLayout';
import LoginPage from '@/pages/auth/LoginPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import KycPage from '@/pages/kyc/KycPage';
import ProfilePage from '@/pages/profile/ProfilePage';
import SettingsPage from '@/pages/settings/SettingsPage';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: 1, staleTime: 30_000 },
    },
});

function VendorAuthShell() {
    const token = useAuthStore((s) => s.token);
    const user = useAuthStore((s) => s.user);
    const loc = useLocation();

    if (!token) {
        return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
    }

    const needReset = user?.password_reset_required === true;
    if (needReset && loc.pathname !== '/reset-password') {
        return <Navigate to="/reset-password" replace />;
    }
    if (!needReset && loc.pathname === '/reset-password') {
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
}

function KycCompleteGate() {
    const user = useAuthStore((s) => s.user);
    if (user?.kyc_status !== 'complete') {
        return <Navigate to="/kyc" replace />;
    }
    return <Outlet />;
}

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route element={<VendorAuthShell />}>
                        <Route path="/reset-password" element={<ResetPasswordPage />} />
                        <Route element={<VendorLayout />}>
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/kyc" element={<KycPage />} />
                            <Route element={<KycCompleteGate />}>
                                <Route path="/profile" element={<ProfilePage />} />
                            </Route>
                            <Route path="/settings" element={<SettingsPage />} />
                        </Route>
                    </Route>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </BrowserRouter>
            <Toaster />
        </QueryClientProvider>
    );
}
