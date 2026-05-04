import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/Toast';
import LeadJoinPage from '@/pages/LeadJoinPage';

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    <Route path="/vendors/join" element={<LeadJoinPage />} />
                    <Route path="/" element={<Navigate to="/vendors/join" replace />} />
                    <Route path="*" element={<Navigate to="/vendors/join" replace />} />
                </Routes>
            </BrowserRouter>
            <Toaster />
        </QueryClientProvider>
    );
}
