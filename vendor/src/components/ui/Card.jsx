import { cn } from '@/lib/utils';

export function Card({ children, className, ...props }) {
    return (
        <div
            className={cn('rounded-xl border border-gray-200 bg-white shadow-sm', className)}
            {...props}
        >
            {children}
        </div>
    );
}

export function CardHeader({ children, className }) {
    return (
        <div className={cn('border-b border-gray-200 px-6 py-4', className)}>{children}</div>
    );
}

export function CardBody({ children, className }) {
    return <div className={cn('px-6 py-4', className)}>{children}</div>;
}
