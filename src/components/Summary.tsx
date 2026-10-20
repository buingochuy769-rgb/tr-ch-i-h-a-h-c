import { requiredCompletions } from '../lib/phase';
import type { Player, PlayerResult, Room } from '../lib/types';

interface Props {
  room: Room;
  players: Player[];
  results: PlayerResult[];
}

export function teamStatus(room: Room, completed: number, required: number): { text: string; tone: string } {
  const passed = completed >= required;
  if (room.verdict === 'pending_verification') return { text: 'CHỜ XÁC MINH BỔ SUNG', tone: 'text-amber-300 border-amber-400/50' };
  if (room.verdict === 'confirmed')
    return passed
      ? { text: 'VƯỢT PHÒNG - ĐÃ XÁC NHẬN', tone: 'text-emerald-300 border-emerald-400/50' }
      : { text: 'KHÔNG ĐẠT - ĐÃ XÁC NHẬN', tone: 'text-rose-300 border-rose-400/50' };
  return passed
    ? { text: 'ĐỦ ĐIỀU KIỆN - CHỜ GIÁO VIÊN XÁC NHẬN', tone: 'text-cyan-200 border-cyan-300/50' }
    : { text: 'CHƯA ĐỦ ĐIỀU KIỆN', tone: 'text-slate-300 border-slate-400/40' };
}

export default function Summary({ room, players, results }: Props) {
  const n = players.length;
  const required = requiredCompletions(n);
  const completed = results.filter((r) => players.some((p) => p.id === r.player_id) && r.is_complete).length;
  const rate = n ? Math.round((completed / n) * 100) : 0;
  const status = teamStatus(room, completed, required);
  const rows = [...players].sort((a, b) => a.task_no - b.task_no);

  return (
    <section className="card space-y-5">
      <h2 className="text-2xl font-extrabold text-white">Tổng kết của đội</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Điều tra viên" value={String(n)} />
        <Stat label="Hoàn thành" value={`${completed}/${n}`} />
        <Stat label="Cần tối thiểu" value={`${required}/${n}`} />
        <Stat label="Tỉ lệ đạt" value={`${rate}%`} />
      </div>
      <p className={`rounded-xl border px-4 py-3 text-center text-xl font-extrabold ${status.tone}`}>{status.text}</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-base">
          <thead className="text-sm uppercase text-cyan-200/70">
            <tr>
              <th className="py-2 pr-3">Hồ sơ</th>
              <th className="pr-3">Điều tra viên</th>
              <th className="pr-3">Lần nộp 1</th>
              <th className="pr-3">Trước hỗ trợ</th>
              <th className="pr-3">Điểm cuối</th>
              <th>Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const r = results.find((x) => x.player_id === p.id);
              return (
                <tr key={p.id} className="border-t border-cyan-300/10">
                  <td className="py-2 pr-3 font-mono">#{p.task_no}</td>
                  <td className="pr-3 font-semibold text-white">{p.display_name}</td>
                  <td className="pr-3">{r?.first_score != null ? r.first_score : '-'}</td>
                  <td className="pr-3">
                    {room.support_used ? `${r?.before_support_score ?? 0}${r?.before_support_complete ? ' ✔' : ''}` : '-'}
                  </td>
                  <td className="pr-3 font-bold">{r?.best_score ?? 0}</td>
                  <td className={r?.is_complete ? 'text-emerald-300' : 'text-amber-300'}>{r?.is_complete ? 'Đúng ✔' : 'Chưa đúng'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {room.support_used && <p className="text-sm text-slate-400">Quyền hỗ trợ đã được dùng: cột “Trước hỗ trợ” là kết quả tại thời điểm giáo viên kích hoạt.</p>}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-navy-950/60 p-3 text-center">
      <p className="text-sm text-cyan-200/70">{label}</p>
      <p className="text-3xl font-extrabold text-white">{value}</p>
    </div>
  );
}
