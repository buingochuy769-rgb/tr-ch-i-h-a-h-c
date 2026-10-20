import { useState } from 'react';
import { isMuted, setMuted } from '../lib/sound';
import type { Conn } from '../hooks/useRoom';
import { fmtTime, PHASE_LABEL } from '../lib/phase';
import type { Phase } from '../lib/types';

export function Spinner({ text = 'Đang tải dữ liệu...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-cyan-100/80" role="status">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/30 border-t-cyan-300" />
      <p>{text}</p>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card mx-auto max-w-xl border-rose-400/40 text-center" role="alert">
      <p className="text-xl font-semibold text-rose-200">Có lỗi xảy ra</p>
      <p className="mt-2 break-words text-slate-300">{message}</p>
      {onRetry && (
        <button className="btn-primary mt-4" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function SoundToggle() {
  const [m, setM] = useState(isMuted());
  return (
    <button
      className="btn-ghost !px-3 !py-2 text-base"
      onClick={() => {
        setMuted(!m);
        setM(!m);
      }}
      aria-pressed={!m}
      title={m ? 'Bật âm thanh' : 'Tắt âm thanh'}
    >
      {m ? '🔇 Âm thanh: tắt' : '🔊 Âm thanh: bật'}
    </button>
  );
}

export function ConnBadge({ conn }: { conn: Conn }) {
  if (conn === 'online') return null;
  const reconnecting = conn === 'reconnecting';
  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 px-4 py-2 text-center text-base font-semibold ${
        reconnecting ? 'bg-amber-400 text-navy-950' : 'bg-rose-500 text-white'
      }`}
      role="alert"
    >
      {reconnecting ? 'Đang kết nối lại... dữ liệu của bạn vẫn được lưu trên máy chủ.' : 'Mất kết nối. Hệ thống sẽ tự động thử lại, bài đã nộp không bị mất.'}
    </div>
  );
}

export function Timer({ phase, remaining, total }: { phase: Phase; remaining: number; total: number }) {
  const pct = total ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  const urgent = total > 0 && remaining <= 10;
  return (
    <div className="card flex items-center gap-4 !py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm uppercase tracking-wide text-cyan-200/70">Giai đoạn</p>
        <p className="truncate text-xl font-bold text-white">{PHASE_LABEL[phase]}</p>
        {total > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-700">
            <div className={`h-full transition-all ${urgent ? 'bg-rose-400' : 'bg-cyan-300'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {total > 0 && (
        <div className={`font-mono text-4xl font-extrabold tabular-nums sm:text-5xl ${urgent ? 'animate-glow text-rose-300' : 'text-cyan-200'}`}>
          {fmtTime(remaining)}
        </div>
      )}
    </div>
  );
}
