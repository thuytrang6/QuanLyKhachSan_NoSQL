import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Filler,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Filler);
ChartJS.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
ChartJS.defaults.color = "#52514e";

// Bảng màu dataviz (một chuỗi màu xanh cho độ lớn, trục/lưới nhạt)
export const VIZ = {
  series: "#2a78d6",
  seriesMuted: "#b7d3f6",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
};

export const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: "#0b0b0b", padding: 10, cornerRadius: 6, displayColors: false, titleFont: { weight: "600" } },
  },
  scales: {
    x: { grid: { display: false }, border: { color: VIZ.axis }, ticks: { color: VIZ.muted } },
    y: { beginAtZero: true, grid: { color: VIZ.grid }, border: { display: false }, ticks: { color: VIZ.muted } },
  },
};
