import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PlayerGrid from '../components/PlayerGrid';
import Solutions from '../components/Solutions';
import Summary from '../components/Summary';
import TaskForm from '../components/TaskForm';
import { ErrorBox, SoundToggle, Timer } from '../components/Ui';
import { submitAnswer, toMessage } from '../lib/api';
import { play } from '../lib/sound';
import type { Response } from '../lib/types';
import { usePhase, useSolutions, type useRoom } from '../hooks/useRoom';

type RM = ReturnType<typeof useRoom>;

export default function PlayerView({ rm }: { rm: RM }) {
  const { room, players, results, tasks, me } = rm;
  const info = usePhase(room);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const nonce = useRef<string>(crypto.randomUUID());

  const my = results.find((r) => r.player_id === me?.id);
  const task = tasks.find((t) => t.no === me?.task_no);
  const solKey = `${room?.support_active}-${my?.is_complete}-${my?.attempts}`;
  const solutions = useSolutions(room?.id, info.phase, solKey);

  // âm thanh khi đổi giai đoạn / hoàn thành
  const lastPhase = useRef(info.phase);
  useEffect(() => {
    if (lastPhase.current !== info.phase) {
      play('phase');
      lastPhase.current = info.phase;
    }
  }, [info.phase]);
  const wasDone = useRef(false);
  useEffect(() => {
    if (my?.is_complete && !wasDone.current) play('ok');
    wasDone.current = !!my?.is_complete;
  }, [my?.is_complete]);

  if (!room || !me || !task) return null;

  const submit = async (r: Response) => {
    setBusy(true);
    setErr('');
    try {
      await submitAnswer(room.id, nonce.current, r);
      nonce.current = crypto.randomUUID(); // thành công: lần nộp sau dùng mã mới
      await rm.reload();
    } catch (e) {
      setErr(toMessage(e)); // lỗi mạng: giữ nguyên nonce để gửi lại không bị chấm trùng
      play('bad');
    } finally {
      setBusy(false);
    }
  };

  const phase = info.phase;
  const showCorrect = ['review', 'confirm', 'finished', 'closed'].includes(phase);
  const attempts = my?.attempts ?? 0;
  const done = !!my?.is_complete;

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-cyan-200 underline">
            ← Trang chủ
          </Link>
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            Phòng <span className="font-mono text-cyan-300">{room.code}</span> · {me.display_name}
          </h1>
        </div>
        <SoundToggle />
      </header>

      <Timer phase={phase} remaining={info.remaining} total={info.total} />

      {phase === 'lobby' && (
        <section className="card text-center">
          <p className="text-2xl font-bold text-white">Đang chờ giáo viên bắt đầu...</p>
          <p className="mt-1 text-slate-300">Đã có {players.length}/10 điều tra viên trong phòng.</p>
        </section>
      )}

      {phase === 'briefing' && (
        <section className="card space-y-2 text-xl">
          <p className="text-2xl font-bold text-white">Hướng dẫn điều tra viên</p>
          <p>• Bạn nhận hồ sơ <b>#{me.task_no}</b>, hiện ra khi giai đoạn làm nhiệm vụ bắt đầu.</p>
          <p>• Bạn được nộp bài <b>một lần</b> trong 3 phút làm nhiệm vụ.</p>
          <p>• Sau đó có 90 giây để xem kết quả và sửa sai.</p>
          <p>• Số neutron N = A − Z. Nguyên tử trung hòa: số electron = số proton.</p>
        </section>
      )}

      {phase === 'mission' && (
        <section className="card space-y-4">
          <p className="font-mono text-cyan-300">Hồ sơ #{task.no}</p>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">{task.title}</h2>
          <p className="text-xl leading-relaxed">{task.prompt}</p>
          {attempts > 0 ? (
            <p className="rounded-xl border border-cyan-300/40 bg-cyan-300/10 p-4 text-xl text-cyan-100">✅ Đã nộp bài. Hãy chờ giai đoạn kiểm tra để xem kết quả.</p>
          ) : (
            <TaskForm task={task} busy={busy} submitLabel="Nộp bài (chỉ một lần)" onSubmit={submit} />
          )}
        </section>
      )}

      {phase === 'review' && (
        <section className="card space-y-4">
          <p className="font-mono text-cyan-300">Hồ sơ #{task.no}</p>
          <p className="text-xl">{task.prompt}</p>
          {done ? (
            <p className="rounded-xl border border-emerald-400/50 bg-emerald-400/10 p-4 text-2xl font-bold text-emerald-200">✔ Chính xác! Bạn đã hoàn thành nhiệm vụ.</p>
          ) : attempts === 0 ? (
            <>
              <p className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-amber-100">Bạn chưa nộp bài. Vẫn còn thời gian để nộp trong giai đoạn kiểm tra.</p>
              <TaskForm task={task} busy={busy} submitLabel="Nộp bài" onSubmit={submit} />
            </>
          ) : (
            <>
              <p className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-amber-100">Đáp án chưa đúng (đạt {my?.best_score ?? 0}%). Hãy kiểm tra lại và sửa.</p>
              <TaskForm task={task} busy={busy} submitLabel="Nộp bản sửa" onSubmit={submit} />
            </>
          )}
        </section>
      )}

      {['confirm', 'finished', 'closed'].includes(phase) && (
        <section className="card">
          <p className="text-xl">
            Hồ sơ #{task.no}:{' '}
            {done ? <b className="text-emerald-300">hoàn thành ✔</b> : <b className="text-amber-300">chưa đúng</b>}. Đã đóng nhận bài.
          </p>
        </section>
      )}

      {err && <ErrorBox message={err} />}

      {['review', 'confirm', 'finished', 'closed'].includes(phase) && <Solutions solutions={solutions} tasks={tasks} title={phase === 'review' ? 'Gợi ý và lời giải' : 'Đáp án và lời giải'} />}

      {['confirm', 'finished', 'closed'].includes(phase) && <Summary room={room} players={players} results={results} />}

      <section>
        <h2 className="mb-3 text-xl font-bold text-white">Các điều tra viên</h2>
        <PlayerGrid players={players} results={results} showCorrect={showCorrect} meId={me.id} />
      </section>
    </main>
  );
}
