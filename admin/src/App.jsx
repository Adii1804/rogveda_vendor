import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGuard } from '@/components/AuthGuard';
import { AppLayout } from '@/components/layout/AppLayout';
import { Toaster } from '@/components/ui/Toast';

import LoginPage from '@/pages/auth/LoginPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import LeadsPage from '@/pages/leads/LeadsPage';
import LeadDetailPage from '@/pages/leads/LeadDetailPage';
import VendorsPage from '@/pages/vendors/VendorsPage';
import VendorDetailPage from '@/pages/vendors/VendorDetailPage';
import KycQueuePage from '@/pages/kyc/KycQueuePage';
import KycChecklistPage from '@/pages/kyc/KycChecklistPage';
import KycExpiringPage from '@/pages/kyc/KycExpiringPage';
import DeactivationRequestsPage from '@/pages/vendors/DeactivationRequestsPage';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 30_000,
        },
    },
});

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route element={<AuthGuard />}>
                        <Route element={<AppLayout />}>
                            <Route index element={<Navigate to="/dashboard" replace />} />
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/leads" element={<LeadsPage />} />
                            <Route path="/leads/:id" element={<LeadDetailPage />} />
                            <Route path="/vendors" element={<VendorsPage />} />
                            <Route path="/vendors/:id" element={<VendorDetailPage />} />
                            <Route path="/vendors/deactivation-requests" element={<DeactivationRequestsPage />} />
                            <Route path="/kyc" element={<KycQueuePage />} />
                            <Route path="/kyc/checklist" element={<KycChecklistPage />} />
                            <Route path="/kyc/expiring" element={<KycExpiringPage />} />
                        </Route>
                    </Route>
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </BrowserRouter>
            <Toaster />
        </QueryClientProvider>
    );
}
