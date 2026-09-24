export default function EmptyState({ title, description, action, icon = "🗂️" }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="mb-3 text-4xl" aria-hidden>{icon}</div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <EmptyState
      icon="⚠️"
      title="Không tải được dữ liệu"
      description={error ? error.message : "Đã có lỗi xảy ra"}
      action={onRetry && <button className="btn-secondary" onClick={onRetry}>Thử lại</button>}
    />
  );
}
