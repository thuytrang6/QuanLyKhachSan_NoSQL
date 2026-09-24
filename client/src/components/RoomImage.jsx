import { useState } from "react";

// Màu nền khung thay thế theo mã loại phòng (chỉ là trang trí, không phải dữ liệu)
const GRADIENTS = [
  ["#fde68a", "#fdba74", "#fda4af"],
  ["#bae6fd", "#a5f3fc", "#bbf7d0"],
  ["#ddd6fe", "#c7d2fe", "#bae6fd"],
  ["#fecdd3", "#fed7aa", "#fef08a"],
];
const hash = (s) => [...(s || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// Ảnh phòng lấy từ Room.Images (đường dẫn trong DB, thư mục client/public/images/rooms).
// Nếu chưa có file ảnh thì hiển thị khung minh họa thay thế.
export default function RoomImage({ images, alt, label, typeId, className = "h-40", index = 0 }) {
  const [failed, setFailed] = useState(false);
  const path = images && images[index];
  const src = path ? "/" + path.replace(/^\/+/, "") : null;
  if (!src || failed) {
    const [a, b, c] = GRADIENTS[hash(typeId || label) % GRADIENTS.length];
    return (
      <div className={`relative flex items-center justify-center overflow-hidden ${className}`}
        style={{ background: `linear-gradient(135deg, ${a}, ${b} 55%, ${c})` }} role="img" aria-label={alt}>
        <svg viewBox="0 0 120 70" className="absolute bottom-0 left-1/2 w-3/4 max-w-xs -translate-x-1/2 opacity-60" aria-hidden>
          <rect x="8" y="30" width="104" height="26" rx="5" fill="#fff" />
          <rect x="8" y="18" width="16" height="44" rx="4" fill="#fff" />
          <rect x="30" y="22" width="30" height="12" rx="6" fill="#fff" opacity=".85" />
          <rect x="64" y="22" width="30" height="12" rx="6" fill="#fff" opacity=".85" />
          <rect x="12" y="56" width="6" height="10" rx="2" fill="#fff" />
          <rect x="102" y="56" width="6" height="10" rx="2" fill="#fff" />
        </svg>
        {label && <span className="relative mb-6 rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm">{label}</span>}
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} className={`w-full object-cover ${className}`} loading="lazy" />;
}
