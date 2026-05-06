import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Select = forwardRef(function Select(
    { label, error, children, className, ...props },
    ref
) {
    return (
        <div className="flex flex-col gap-1">
            {label && (
                <label className="text-sm font-medium text-gray-700">
                    {label.split('*').map((part, i, arr) =>
                        i < arr.length - 1 ? (
                            <span key={i}>
                                {part}
                                <span className="text-red-500">*</span>
                            </span>
                        ) : (
                            part
                        )
                    )}
                </label>
            )}
            <select
                ref={ref}
                {...props}
                className={cn(
                    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50',
                    error && 'border-red-400',
                    className
                )}
            >
                {children}
            </select>
            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    );
});
