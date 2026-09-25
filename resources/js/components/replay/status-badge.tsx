export function StatusBadge({ status }: { status: number }) {
    const isOk = status >= 200 && status < 300;
    const isServerError = status >= 500;
    const colour = isOk
        ? 'bg-green-100 text-green-800'
        : isServerError
          ? 'bg-red-100 text-red-800'
          : 'bg-yellow-100 text-yellow-800';

    return (
        <span
            className={`inline-block rounded px-2 py-0.5 font-mono text-xs font-semibold ${colour}`}
        >
            {status}
        </span>
    );
}
