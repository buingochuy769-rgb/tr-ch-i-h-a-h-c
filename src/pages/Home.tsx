import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Atom from '../components/Atom';
import { ErrorBox, SoundToggle } from '../components/Ui';
import { createRoom, joinRoom, toMessage } from '../lib/api';
import { isConfigured } from '../lib/supabase';

export default function Home() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!isConfigured)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <ErrorBox message="Chưa cấu hình Supabase. Hãy tạo file .env từ .env.example và điền VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (xem README)." />
      </main>
    );

  const create = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await createRoom();
      try {
        localStorage.setItem('hostkey_' + r.code, r.host_key);
      } catch {
        /* bỏ qua */
      }
      nav(`/room/${r.code}`);
    } catch (e) {
      setErr(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const c = code.trim().toUpperCase();
      await joinRoom(c, name);
      nav(`/room/${c}`);
    } catch (e2) {
      setErr(toMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Atom size={56} />
          <span className="text-lg font-bold tracking-widest text-cyan-200">PHÒNG THÍ NGHIỆM NGUYÊN TỬ</span>
        </div>
        <SoundToggle />
      </header>

      <section className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl">HỒ SƠ NGUYÊN TỬ BÍ ẨN</h1>
        <p className="mx-auto mt-4 max-w-2xl text-xl text-cyan-100/80">
          Tối đa 10 điều tra viên cùng giải mã 10 hồ sơ nguyên tử trong 6 phút. Hóa học 10: Thành phần của nguyên tử, Nguyên tố hóa học.
        </p>
      </section>

      {err && <ErrorBox message={err} />}

      <div className="grid gap-6 md:grid-cols-2">
        <form className="card space-y-4" onSubmit={join}>
          <h2 className="text-2xl font-bold text-white">Tham gia phòng</h2>
          <label className="block">
            <span className="label">Mã phòng (6 kí tự)</span>
            <input className="input text-center font-mono uppercase tracking-[.4em]" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" autoCapitalize="characters" />
          </label>
          <label className="block">
            <span className="label">Tên hoặc mã điều tra viên (không cần họ tên thật)</span>
            <input className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder="Điều tra viên 07" />
          </label>
          <button className="btn-primary w-full" disabled={busy || code.trim().length < 4 || !name.trim()}>
            Vào phòng
          </button>
        </form>

        <div className="card space-y-4">
          <h2 className="text-2xl font-bold text-white">Giáo viên / trưởng phòng</h2>
          <p className="text-slate-300">Tạo phòng mới, gửi mã hoặc đường link cho học sinh và điều khiển từng giai đoạn trò chơi.</p>
          <button className="btn-primary w-full" onClick={create} disabled={busy}>
            {busy ? 'Đang tạo...' : 'Tạo phòng chơi mới'}
          </button>
        </div>
      </div>

      <section className="card">
        <h2 className="mb-3 text-2xl font-bold text-white">Hướng dẫn nhanh</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['30 giây', 'Hướng dẫn: đọc luật chơi, chờ lệnh.'],
            ['3 phút', 'Nhiệm vụ: mỗi người giải một hồ sơ riêng và nộp bài một lần.'],
            ['90 giây', 'Kiểm tra: xem kết quả, đọc gợi ý (nếu giáo viên dùng quyền hỗ trợ) và sửa sai.'],
            ['60 giây', 'Xác nhận: đội cần ít nhất 70% người hoàn thành để vượt phòng.'],
          ].map(([t, d]) => (
            <li key={t} className="rounded-xl bg-navy-950/60 p-4">
              <p className="text-2xl font-extrabold text-cyan-300">{t}</p>
              <p className="mt-1 text-base text-slate-300">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-base text-slate-400">
          Đáp án được chấm trên máy chủ và không gửi về trình duyệt trước khi nộp. Dữ liệu phòng có thể được giáo viên xóa sau khi dùng.
        </p>
      </section>
    </main>
  );
}
