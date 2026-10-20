import { supabase } from './supabase';

// Độ lệch giữa đồng hồ máy chủ và đồng hồ trình duyệt (ms). Mọi thiết bị dùng chung đồng hồ máy chủ.
let offset = 0;

export const serverNow = () => Date.now() + offset;

export async function syncClock(): Promise<void> {
  let best: { rtt: number; off: number } | null = null;
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('server_time');
    const t1 = Date.now();
    if (error || !data) continue;
    const rtt = t1 - t0;
    const off = Date.parse(data as string) + rtt / 2 - t1;
    if (!best || rtt < best.rtt) best = { rtt, off };
  }
  if (best) offset = best.off;
}
