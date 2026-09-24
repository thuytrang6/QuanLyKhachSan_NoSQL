import { useEffect, useState } from "react";

// Đếm ngược tới expiresAt (epoch giây do server trả), bù lệch đồng hồ theo serverTime
export function useCountdown(expiresAt, serverTime) {
  const [skew] = useState(() => (serverTime ? serverTime * 1000 - Date.now() : 0));
  const calc = () => (expiresAt ? Math.max(0, Math.floor((expiresAt * 1000 - (Date.now() + skew)) / 1000)) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    const t = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);
  return { seconds: left, mm: String(Math.floor(left / 60)).padStart(2, "0"), ss: String(left % 60).padStart(2, "0") };
}
