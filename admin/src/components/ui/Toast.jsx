import { create } from 'zustand';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Zustand store hook lives with Toaster for a single import path in the app shell.
// eslint-disable-next-line react-refresh/only-export-components -- useToast is not a React component
export const useToast = create((set) => ({
    toasts: [],
    toast: (message, type = 'success') => {
        const id = Date.now();
        set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
        setTimeout(() => {
            set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, 4000);
    },
    remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function Toaster() {
    const { toasts, remove } = useToast();

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={cn(
                        'flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg text-sm font-medium min-w-[280px]',
                        t.type === 'success' && 'bg-emerald-600 text-white',
                        t.type === 'error' && 'bg-red-600 text-white',
                        t.type === 'info' && 'bg-blue-600 text-white'
                    )}
                >
                    {t.type === 'success' && <CheckCircle className="h-4 w-4 shrink-0" />}
                    {t.type === 'error' && <XCircle className="h-4 w-4 shrink-0" />}
                    <span className="flex-1">{t.message}</span>
                    <button onClick={() => remove(t.id)} className="shrink-0 opacity-70 hover:opacity-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ))}
        </div>
    );
}
