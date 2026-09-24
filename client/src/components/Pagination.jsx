// Thanh phân trang: "Hiển thị 11–20 / 36" + chọn số dòng/trang + nút trang (rút gọn bằng "…" khi nhiều trang)
function pageList(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…" + p);
    out.push(p);
  });
  return out;
}

export default function Pagination({ page, pageSize, total, totalPages, onPage, onPageSize, sizes = [10, 20, 50], unit = "dòng", busy }) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = "tabular min-w-9 rounded-lg px-2.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <div className="flex items-center gap-3">
        <span>Hiển thị <b className="tabular text-slate-800">{from}–{to}</b> / <b className="tabular text-slate-800">{total}</b> {unit}</span>
        {onPageSize && (
          <label className="flex items-center gap-1.5">
            <select className="input w-auto py-1" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Số dòng mỗi trang">
              {sizes.map((s) => <option key={s} value={s}>{s} / trang</option>)}
            </select>
          </label>
        )}
        {busy && <span className="text-xs text-slate-400">Đang tải...</span>}
      </div>
      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Phân trang">
          <button className={`${btn} text-slate-600 hover:bg-slate-100`} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Trang trước">‹ Trước</button>
          {pageList(page, totalPages).map((p) => (typeof p === "string"
            ? <span key={p} className="px-1 text-slate-400">…</span>
            : (
              <button key={p} onClick={() => onPage(p)} aria-current={p === page ? "page" : undefined}
                className={`${btn} ${p === page ? "bg-brand-500 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                {p}
              </button>
            )))}
          <button className={`${btn} text-slate-600 hover:bg-slate-100`} onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Trang sau">Sau ›</button>
        </nav>
      )}
    </div>
  );
}
