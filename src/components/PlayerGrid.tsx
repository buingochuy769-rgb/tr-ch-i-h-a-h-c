import type { Player, PlayerResult } from '../lib/types';

interface Props {
  players: Player[];
  results: PlayerResult[];
  showCorrect: boolean;
  meId?: string;
}

export default function PlayerGrid({ players, results, showCorrect, meId }: Props) {
  const slots = Array.from({ length: 10 }, (_, i) => i + 1);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {slots.map((no) => {
        const p = players.find((x) => x.task_no === no);
        if (!p)
          return (
            <div key={no} className="rounded-2xl border border-dashed border-cyan-300/15 p-4 text-center text-slate-500">
              <p className="font-mono text-sm">Hồ sơ #{no}</p>
              <p className="mt-1">Trống</p>
            </div>
          );
        const r = results.find((x) => x.player_id === p.id);
        const submitted = (r?.attempts ?? 0) > 0;
        let label = 'Chưa nộp';
        let cls = 'border-slate-500/30 text-slate-300';
        if (showCorrect && r?.is_complete) {
          label = 'Hoàn thành ✔';
          cls = 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200';
        } else if (showCorrect && submitted) {
          label = 'Chưa đúng';
          cls = 'border-amber-400/60 bg-amber-400/10 text-amber-200';
        } else if (submitted) {
          label = 'Đã nộp';
          cls = 'border-cyan-300/60 bg-cyan-300/10 text-cyan-100';
        }
        return (
          <div key={no} className={`animate-rise rounded-2xl border p-4 text-center ${cls} ${p.id === meId ? 'ring-2 ring-cyan-300' : ''}`}>
            <p className="font-mono text-sm opacity-70">Hồ sơ #{no}</p>
            <p className="mt-1 truncate text-xl font-bold text-white" title={p.display_name}>
              {p.display_name}
              {p.id === meId && ' (bạn)'}
            </p>
            <p className="mt-1 text-base font-semibold">{label}</p>
          </div>
        );
      })}
    </div>
  );
}
