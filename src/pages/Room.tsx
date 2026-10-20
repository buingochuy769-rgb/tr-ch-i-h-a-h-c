import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConnBadge, ErrorBox, Spinner } from '../components/Ui';
import { joinRoom, reclaimHost, toMessage } from '../lib/api';
import { useRoom } from '../hooks/useRoom';
import HostView from './HostView';
import PlayerView from './PlayerView';

export default function RoomPage() {
  const { code = '' } = useParams();
  const c = code.toUpperCase();
  const rm = useRoom(c);

  if (rm.state === 'loading') return <Spinner />;
  if (rm.state === 'error')
    return (
      <main className="p-6">
        <ErrorBox message={rm.error} onRetry={rm.reload} />
      </main>
    );
  if (rm.state === 'notfound' || !rm.room) return <JoinPanel code={c} onDone={rm.reload} />;

  return (
    <>
      <ConnBadge conn={rm.conn} />
      {rm.isHost ? <HostView rm={rm} /> : rm.me ? <PlayerView rm={rm} /> : <JoinPanel code={c} onDone={rm.reload} />}
    </>
  );
}

function JoinPanel({ code, onDone }: { code: string; onDone: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      onDone();
      nav(`/room/${code}`, { replace: true });
    } catch (e) {
      setErr(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg space-y-5 p-4 sm:p-8">
      <Link to="/" className="text-cyan-200 underline">
        ← Trang chủ
      </Link>
      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => joinRoom(code, name));
        }}
      >
        <h1 className="text-2xl font-bold text-white">
          Tham gia phòng <span className="font-mono text-cyan-300">{code}</span>
        </h1>
        <p className="text-slate-300">Bạn chưa là thành viên của phòng này (hoặc phòng không tồn tại).</p>
        <input className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên hoặc mã điều tra viên" />
        <button className="btn-primary w-full" disabled={busy || !name.trim()}>
          Vào phòng
        </button>
      </form>

      <details className="card">
        <summary className="cursor-pointer font-semibold text-cyan-100">Tôi là giáo viên và mất quyền điều khiển phòng</summary>
        <div className="mt-3 space-y-3">
          <input className="input font-mono uppercase" maxLength={8} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Mã khôi phục (8 kí tự)" />
          <button className="btn-ghost w-full" disabled={busy || key.trim().length < 8} onClick={() => run(() => reclaimHost(code, key))}>
            Khôi phục quyền giáo viên
          </button>
        </div>
      </details>
      {err && <ErrorBox message={err} />}
    </main>
  );
}
