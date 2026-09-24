import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, Line } from "react-chartjs-2";
import { adminApi } from "../../api/admin";
import { VIZ, baseOptions } from "../../components/charts";
import RoomBoard from "../../components/RoomBoard";
import { BookingStatusBadge } from "../../components/Badges";
import { Skeleton, TableSkeleton } from "../../components/Skeleton";
import EmptyState, { ErrorState } from "../../components/EmptyState";
import { BOOKING_STATUS, SAMPLE_DATA_DATE } from "../../utils/constants";
import { formatDate, formatDateTime, formatMoney, formatMoneyShort, formatMonth, formatNumber, todayVN } from "../../utils/format";

function Panel({ title, subtitle, children, right, className = "" }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, loading }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      {loading ? <Skeleton className="mt-2 h-7 w-32" /> : <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>}
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

const Loading = ({ h = "h-64" }) => <Skeleton className={`w-full ${h}`} />;

export default function DashboardPage() {
  const [date, setDate] = useState(todayVN());
  const [month, setMonth] = useState(date.slice(0, 7));
  const year = Number(month.slice(0, 4));

  const changeDate = (d) => { if (!d) return; setDate(d); setMonth(d.slice(0, 7)); };

  const revenue = useQuery({ queryKey: ["admin", "revenue", year], queryFn: () => adminApi.revenue(year) });
  const invoices = useQuery({ queryKey: ["admin", "invoices", month], queryFn: () => adminApi.invoices(month) });
  const statuses = useQuery({ queryKey: ["admin", "booking-status"], queryFn: adminApi.bookingStatus });
  const occupancy = useQuery({ queryKey: ["admin", "occupancy", month], queryFn: () => adminApi.occupancy(month) });
  const overview = useQuery({ queryKey: ["admin", "overview", date], queryFn: () => adminApi.overview(date) });
  const board = useQuery({ queryKey: ["admin", "room-board"], queryFn: adminApi.roomBoard, refetchInterval: 5000 });

  const avgOcc = occupancy.data
    ? occupancy.data.days.reduce((s, d) => s + d.rate, 0) / occupancy.data.days.length
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard quản lý</h1>
          <p className="text-sm text-slate-500">Mọi số liệu được truy vấn trực tiếp từ DynamoDB.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Ngày “hôm nay”</label>
            <input type="date" className="input" value={date} onChange={(e) => changeDate(e.target.value)} />
          </div>
          <button className="btn-secondary" onClick={() => changeDate(todayVN())}>Hôm nay</button>
          <button className="btn-secondary" onClick={() => changeDate(SAMPLE_DATA_DATE)}>Dùng ngày dữ liệu mẫu</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat label={`Doanh thu ${formatMonth(month)}`} value={invoices.data && formatMoney(invoices.data.total)} loading={invoices.isLoading}
          sub={invoices.data && `${formatNumber(invoices.data.count)} hóa đơn`} />
        <Stat label={`Công suất TB ${formatMonth(month)}`} value={avgOcc != null && `${avgOcc.toFixed(1)}%`} loading={occupancy.isLoading}
          sub={occupancy.data && `${occupancy.data.totalRooms} phòng`} />
        <Stat label="Khách đến" value={overview.data && overview.data.arrivals.length} loading={overview.isLoading} sub={formatDate(date)} />
        <Stat label="Đang lưu trú" value={overview.data && overview.data.inHouse.length} loading={overview.isLoading} sub="booking CheckedIn" />
        <Stat label="Điểm đánh giá" value={overview.data && overview.data.hotel && `${overview.data.hotel.RatingAvg} / 5`} loading={overview.isLoading}
          sub={overview.data && overview.data.hotel && `${formatNumber(overview.data.hotel.ReviewCount)} lượt đánh giá`} />
        <Stat label="Phòng trống lúc này" value={board.data && `${board.data.counts.Available || 0} / ${board.data.total}`} loading={board.isLoading}
          sub="tự làm mới mỗi 5 giây" />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel className="lg:col-span-3" title={`Doanh thu theo tháng năm ${year}`} subtitle="Tổng TotalAmount của hóa đơn (GSI3 INVMONTH#). Bấm vào cột để chọn tháng.">
          {revenue.isLoading ? <Loading /> : revenue.isError ? <ErrorState error={revenue.error} onRetry={revenue.refetch} /> : (
            <div className="h-72">
              <Bar
                data={{
                  labels: revenue.data.map((m) => `T${Number(m.month.slice(5))}`),
                  datasets: [{
                    data: revenue.data.map((m) => m.total),
                    backgroundColor: revenue.data.map((m) => (m.month === month ? VIZ.series : VIZ.seriesMuted)),
                    hoverBackgroundColor: VIZ.series,
                    borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: "bottom", maxBarThickness: 36,
                  }],
                }}
                options={{
                  ...baseOptions,
                  onClick: (_, els) => { if (els.length) setMonth(revenue.data[els[0].index].month); },
                  onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
                  plugins: { ...baseOptions.plugins, tooltip: { ...baseOptions.plugins.tooltip, callbacks: {
                    title: (items) => `Tháng ${formatMonth(revenue.data[items[0].dataIndex].month)}`,
                    label: (c) => [`Doanh thu: ${formatMoney(c.raw)}`, `${formatNumber(revenue.data[c.dataIndex].count)} hóa đơn`],
                  } } },
                  scales: { ...baseOptions.scales, y: { ...baseOptions.scales.y, ticks: { ...baseOptions.scales.y.ticks, callback: (v) => formatMoneyShort(v) } } },
                }}
              />
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title={`Top hóa đơn tháng ${formatMonth(month)}`}
          right={<input type="month" className="input w-40 py-1" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />}>
          {invoices.isLoading ? <TableSkeleton cols={3} rows={8} /> : invoices.isError ? <ErrorState error={invoices.error} onRetry={invoices.refetch} /> :
            invoices.data.top.length === 0 ? <EmptyState icon="🧾" title="Chưa có hóa đơn trong tháng" /> : (
              <div className="max-h-72 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white"><tr><th className="th">Số HĐ</th><th className="th">Khách</th><th className="th text-right">Tổng</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.data.top.map((i) => (
                      <tr key={i.InvoiceID}>
                        <td className="td"><div className="font-medium">{i.InvoiceNo}</div><div className="text-xs text-slate-500">{i.BookingID} · P.{i.RoomID}</div></td>
                        <td className="td">{i.CustomerName}<div className="text-xs text-slate-500">{formatDateTime(i.IssuedAt)}</div></td>
                        <td className="td tabular text-right font-medium">{formatMoney(i.TotalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel className="lg:col-span-2" title="Số booking theo trạng thái" subtitle="GSI3 BKSTATUS#<status>, Select=COUNT">
          {statuses.isLoading ? <Loading /> : statuses.isError ? <ErrorState error={statuses.error} onRetry={statuses.refetch} /> : (
            <div className="h-64">
              <Bar
                data={{
                  labels: statuses.data.map((s) => (BOOKING_STATUS[s.status] || {}).label || s.status),
                  datasets: [{ data: statuses.data.map((s) => s.count), backgroundColor: VIZ.series, borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: "left", maxBarThickness: 22 }],
                }}
                options={{
                  ...baseOptions, indexAxis: "y",
                  plugins: { ...baseOptions.plugins, tooltip: { ...baseOptions.plugins.tooltip, callbacks: {
                    title: (items) => statuses.data[items[0].dataIndex].status,
                    label: (c) => `${formatNumber(c.raw)} booking`,
                  } } },
                  scales: {
                    x: { ...baseOptions.scales.y, ticks: { ...baseOptions.scales.y.ticks, precision: 0 } },
                    y: { ...baseOptions.scales.x },
                  },
                }}
              />
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-3" title={`Công suất phòng theo ngày — tháng ${formatMonth(month)}`} subtitle="Số RoomNight Booked (GSI1 NIGHT#<ngày>) / tổng số phòng">
          {occupancy.isLoading ? <Loading /> : occupancy.isError ? <ErrorState error={occupancy.error} onRetry={occupancy.refetch} /> : (
            <div className="h-64">
              <Line
                data={{
                  labels: occupancy.data.days.map((d) => Number(d.date.slice(8))),
                  datasets: [{
                    data: occupancy.data.days.map((d) => d.rate),
                    borderColor: VIZ.series, backgroundColor: "rgba(42,120,214,0.10)", fill: true, borderWidth: 2,
                    pointRadius: occupancy.data.days.map((d) => (d.date === date ? 5 : 0)), pointHoverRadius: 5,
                    pointBackgroundColor: VIZ.series, pointBorderColor: "#ffffff", pointBorderWidth: 2, tension: 0.25,
                  }],
                }}
                options={{
                  ...baseOptions,
                  interaction: { mode: "index", intersect: false },
                  plugins: { ...baseOptions.plugins, tooltip: { ...baseOptions.plugins.tooltip, callbacks: {
                    title: (items) => formatDate(occupancy.data.days[items[0].dataIndex].date),
                    label: (c) => {
                      const d = occupancy.data.days[c.dataIndex];
                      return `${d.rate}% — ${d.booked}/${occupancy.data.totalRooms} phòng`;
                    },
                  } } },
                  scales: {
                    x: { ...baseOptions.scales.x, ticks: { ...baseOptions.scales.x.ticks, maxRotation: 0, autoSkipPadding: 8 } },
                    y: { ...baseOptions.scales.y, max: 100, ticks: { ...baseOptions.scales.y.ticks, callback: (v) => `${v}%` } },
                  },
                }}
              />
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Trạng thái phòng hiện tại" subtitle="GSI3 ROOMSTATUS#<status> — tự làm mới mỗi 5 giây. Bấm vào phòng để xem nhật ký."
        right={board.isFetching && <span className="text-xs text-slate-400">Đang cập nhật...</span>}>
        {board.isLoading ? <Loading h="h-48" /> : board.isError ? <ErrorState error={board.error} onRetry={board.refetch} /> : <RoomBoard board={board.data} />}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`Khách đến ngày ${formatDate(date)}`} subtitle="GSI3 BKSTATUS#Confirmed, begins_with CHECKIN#<ngày>">
          <BookingTable q={overview} rows={overview.data && overview.data.arrivals} empty="Không có khách đến trong ngày" />
        </Panel>
        <Panel title="Khách đang lưu trú" subtitle="GSI3 BKSTATUS#CheckedIn">
          <BookingTable q={overview} rows={overview.data && overview.data.inHouse} empty="Không có khách đang lưu trú" showCheckout today={date} />
        </Panel>
      </div>

      <Panel title="10 đánh giá mới nhất" subtitle={overview.data && overview.data.hotel ? `Trung bình ${overview.data.hotel.RatingAvg} sao · ${formatNumber(overview.data.hotel.ReviewCount)} lượt` : undefined}>
        {overview.isLoading ? <TableSkeleton cols={1} rows={4} /> : overview.isError ? <ErrorState error={overview.error} onRetry={overview.refetch} /> :
          overview.data.reviews.length === 0 ? <EmptyState icon="⭐" title="Chưa có đánh giá" /> : (
            <ul className="grid gap-3 md:grid-cols-2">
              {overview.data.reviews.map((r) => (
                <li key={r.ReviewID} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.CustomerName}</span>
                    <span className="text-amber-500" aria-label={`${r.Rating} sao`}>{"★".repeat(r.Rating)}<span className="text-slate-300">{"★".repeat(5 - r.Rating)}</span></span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{r.Comment}</p>
                  <p className="mt-1 text-xs text-slate-400">{r.RoomTypeID} · {r.BookingID} · {formatDateTime(r.CreatedAt)}</p>
                </li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  );
}

function BookingTable({ q, rows, empty, showCheckout, today }) {
  if (q.isLoading) return <TableSkeleton cols={4} rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  if (!rows || rows.length === 0) return <EmptyState icon="🛎️" title={empty} />;
  return (
    <div className="max-h-80 overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr><th className="th">Đơn</th><th className="th">Khách</th><th className="th">Phòng</th><th className="th">{showCheckout ? "Trả phòng" : "Lưu trú"}</th><th className="th">TT</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((b) => (
            <tr key={b.BookingID}>
              <td className="td font-medium">{b.BookingID}</td>
              <td className="td">{b.CustomerName}<div className="text-xs text-slate-500">{b.CustomerPhone}</div></td>
              <td className="td">{b.RoomID}<div className="text-xs text-slate-500">{b.RoomTypeID}</div></td>
              <td className="td whitespace-nowrap">
                {showCheckout ? (
                  <span className={b.CheckOutDate === today ? "font-semibold text-brand-700" : ""}>
                    {formatDate(b.CheckOutDate)}{b.CheckOutDate === today && " (hôm nay)"}
                  </span>
                ) : `${b.Nights} đêm`}
              </td>
              <td className="td"><BookingStatusBadge status={b.Status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
