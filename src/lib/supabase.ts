import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT'));

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } },
});

let pending: Promise<string> | null = null;

/** Bảo đảm có phiên ẩn danh (không cần email, không thu thập dữ liệu cá nhân). Trả về user id. */
export function ensureSession(): Promise<string> {
  if (pending) return pending;
  pending = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: s, error } = await supabase.auth.signInAnonymously();
    if (error || !s.user) throw new Error('Không tạo được phiên ẩn danh: ' + (error?.message ?? ''));
    return s.user.id;
  })();
  pending.catch(() => {
    pending = null;
  });
  return pending;
}
