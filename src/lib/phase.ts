import type { Phase, Room } from './types';

// Phải khớp hàm SQL public.room_phase().
export const SEQUENCE: { key: Phase; secs: number; label: string }[] = [
  { key: 'briefing', secs: 30, label: 'Hướng dẫn' },
  { key: 'mission', secs: 180, label: 'Làm nhiệm vụ' },
  { key: 'review', secs: 90, label: 'Kiểm tra & sửa sai' },
  { key: 'confirm', secs: 60, label: 'Xác nhận kết quả' },
];

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'Phòng chờ',
  briefing: 'Hướng dẫn',
  mission: 'Làm nhiệm vụ',
  review: 'Kiểm tra & sửa sai',
  confirm: 'Xác nhận kết quả',
  finished: 'Kết thúc',
  closed: 'Đã đóng phòng',
};

export interface PhaseInfo {
  phase: Phase;
  remaining: number; // giây còn lại của giai đoạn hiện tại
  total: number;
}

export function computePhase(r: Room, nowMs: number): PhaseInfo {
  if (r.status === 'closed') return { phase: 'closed', remaining: 0, total: 0 };
  if (r.status === 'lobby' || !r.started_at) return { phase: 'lobby', remaining: 0, total: 0 };
  if (r.ended_at) return { phase: 'finished', remaining: 0, total: 0 };
  const el = (nowMs - Date.parse(r.started_at)) / 1000;
  let acc = 0;
  for (const p of SEQUENCE) {
    if (el < acc + p.secs) return { phase: p.key, remaining: Math.max(0, acc + p.secs - el), total: p.secs };
    acc += p.secs;
  }
  return { phase: 'finished', remaining: 0, total: 0 };
}

/** ceil(70% * n) bằng số nguyên, khớp SQL required_completions(). */
export const requiredCompletions = (n: number) => Math.floor((7 * n + 9) / 10);

export const fmtTime = (sec: number) => {
  const s = Math.ceil(sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
