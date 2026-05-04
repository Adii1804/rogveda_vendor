export function PageHeader({ title, subtitle, action }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div>
                <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
                {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
            </div>
            {action && <div>{action}</div>}
        </div>
    );
}
