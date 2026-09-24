import { useState } from "react";

const GRADIENTS = [
  "from-amber-200 via-orange-200 to-rose-200",
  "from-sky-200 via-cyan-100 to-emerald-100",
  "from-violet-200 via-indigo-100 to-sky-100",
  "from-rose-200 via-orange-100 to-amber-100",
];

// Ảnh phòng lấy từ Room.Images (đường dẫn trong DB, thư mục client/public/images/rooms).
// Nếu chưa có file ảnh thì hiển thị khung thay thế.
export default function RoomImage({ images, alt, label, className = "h-40" }) {
  const [failed, setFailed] = useState(false);
  const src = images && images[0] ? "/" + images[0].replace(/^\/+/, "") : null;
  if (!src || failed) {
    const g = GRADIENTS[(label || "").length % GRADIENTS.length];
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br ${g} ${className}`}>
        <span className="rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-slate-700">{label || alt}</span>
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} className={`w-full object-cover ${className}`} loading="lazy" />;
}
