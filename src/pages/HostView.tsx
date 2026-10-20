import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PlayerGrid from '../components/PlayerGrid';
import Solutions from '../components/Solutions';
import Summary from '../components/Summary';
import { ErrorBox, SoundToggle, Timer } from '../components/Ui';
import { activateSupport, advancePhase, closeRoom, endGame, kickPlayer, purgeRoom, setVerdict, startGame, toMessage } from '../lib/api';
import { play } from '../lib/sound';
import { usePhase, useSolutions, type useRoom } from '../hooks/useRoom';

type RM = ReturnType<typeof useRoom>;

export default function HostView({ rm }: { rm: RM }) {
  const { room, players, results, tasks } = rm;
  const nav = useNavigate();
  const info = usePhase(room);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const solutions = useSolutions(room?.id, info.phase, `${room?.support_active}-${results.map((r) => r.attempts + '' + r.is_complete).join()}`);
  const last = useRef(info.phase);
  useEffect(() => {
    if (last.current !== info.phase) {
      play('phase');
      last.current = info.phase;
    }
  }, [info.phase]);

  if (!room) return null;
  const phase = info.phase;
  const hostKey = (() => {
    try {
      return localStorage.getItem('hostkey_' + room.code);
    } catch {
      return null;
    }
  })();
  const link = `${window.location.origin}/room/${room.code}`;

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await rm.reload();
      after?.();
    } catch (e) {
      setErr(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const anySubmitted = results.some((r) => r.attempts > 0);
  const nextLabel: Partial<Record<typeof phase, string>> = {
    briefing: 'Bỏ qua hướng dẫn, bắt đầu nhiệm vụ',
    mission: 'Mở giai đoạn kiểm tra ngay',
    review: 'Sang giai đoạn xác nhận',
    confirm: 'Kết thúc trò chơi',
  };

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm text-cyan-200 underline">
          ← Trang chủ
        </Link>
        <SoundToggle />
      </header>

      <section className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-cyan-200/70">Mã phòng</p>
          <p className="font-mono text-5xl font-extrabold tracking-[.3em] text-cyan-300 sm:text-6xl">{room.code}</p>
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-base">
          <p className="break-all text-slate-300">{link}</p>
          <button
            className="btn-ghost !py-2"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? 'Đã sao chép ✔' : 'Sao chép đường link'}
          </button>
          {hostKey && (
            <p className="text-sm text-slate-400">
              Mã khôi phục quyền giáo viên (ghi lại phòng khi đổi thiết bị): <b className="font-mono text-amber-200">{hostKey}</b>
            </p>
          )}
        </div>
      </section>

      <Timer phase={phase} remaining={info.remaining} total={info.total} />

      <section className="card space-y-3">
        <h2 className="text-xl font-bold text-white">Điều khiển</h2>
        <div className="flex flex-wrap gap-3">
          {phase === 'lobby' && (
            <button className="btn-primary" disabled={busy || players.length === 0} onClick={() => act(() => startGame(room.id))}>
              ▶ Bắt đầu ({players.length} người)
            </button>
          )}
          {nextLabel[phase] && (
            <button className="btn-ghost" disabled={busy} onClick={() => act(() => advancePhase(room.id))}>
              ⏭ {nextLabel[phase]}
            </button>
          )}
          {phase === 'review' && (
            <button className="btn-primary" disabled={busy || room.support_used || !anySubmitted} onClick={() => act(() => activateSupport(room.id))}>
              💡 {room.support_used ? 'Đã dùng quyền hỗ trợ' : 'Kích hoạt quyền hỗ trợ (1 lần)'}
            </button>
          )}
          {['playing'].includes(room.status) && phase !== 'finished' && phase !== 'lobby' && (
            <button className="btn-danger" disabled={busy} onClick={() => confirm('Kết thúc trò chơi ngay?') && act(() => endGame(room.id))}>
              ■ Kết thúc ngay
            </button>
          )}
          {['confirm', 'finished'].includes(phase) && (
            <>
              <button className="btn-primary" disabled={busy} onClick={() => act(() => setVerdict(room.id, 'confirmed'))}>
                ✔ Xác nhận kết quả
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => act(() => setVerdict(room.id, 'pending_verification'))}>
                ⏳ Đánh dấu CHỜ XÁC MINH BỔ SUNG
              </button>
            </>
          )}
          {phase === 'finished' && (
            <button className="btn-ghost" disabled={busy} onClick={() => act(() => closeRoom(room.id))}>
              🔒 Đóng phòng (khóa kết quả)
            </button>
          )}
          {phase !== 'lobby' || room.status === 'lobby' ? (
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => confirm('Xóa vĩnh viễn toàn bộ dữ liệu phòng này (người chơi, bài làm, kết quả)?') && act(() => purgeRoom(room.id), () => nav('/'))}
            >
              🗑 Xóa dữ liệu phòng
            </button>
          ) : null}
        </div>
        <p className="text-sm text-slate-400">
          Đồng hồ chạy theo máy chủ nên không có nút tạm dừng: tất cả thiết bị luôn thấy cùng một thời gian. Có thể chuyển sớm sang giai đoạn kế tiếp.
        </p>
      </section>

      {err && <ErrorBox message={err} />}

      <section>
        <h2 className="mb-3 text-xl font-bold text-white">
          Điều tra viên ({players.length}/10)
        </h2>
        <PlayerGrid players={players} results={results} showCorrect />
        {phase === 'lobby' && players.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {players.map((p) => (
              <button key={p.id} className="btn-ghost !px-3 !py-1 text-sm" onClick={() => act(() => kickPlayer(room.id, p.id))}>
                Xóa “{p.display_name}”
              </button>
            ))}
          </div>
        )}
      </section>

      {['review', 'confirm', 'finished', 'closed'].includes(phase) && <Summary room={room} players={players} results={results} />}
      {['review', 'confirm', 'finished', 'closed'].includes(phase) && <Solutions solutions={solutions} tasks={tasks} />}
    </main>
  );
}
