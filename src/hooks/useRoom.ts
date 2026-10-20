import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureSession, supabase } from '../lib/supabase';
import { serverNow, syncClock } from '../lib/clock';
import { computePhase, type PhaseInfo } from '../lib/phase';
import { getSolutions } from '../lib/api';
import type { Player, PlayerResult, Room, Solution, TaskDef } from '../lib/types';

export type LoadState = 'loading' | 'ready' | 'notfound' | 'error';
export type Conn = 'online' | 'reconnecting' | 'offline';

export function useRoom(code: string) {
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [tasks, setTasks] = useState<TaskDef[]>([]);
  const [userId, setUserId] = useState('');
  const [conn, setConn] = useState<Conn>('online');
  const roomId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const uid = await ensureSession();
      setUserId(uid);
      const { data: r, error: e } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
      if (e) throw e;
      if (!r) {
        roomId.current = null;
        setRoom(null);
        setState('notfound');
        return;
      }
      roomId.current = r.id;
      const [p, res, t] = await Promise.all([
        supabase.from('players').select('*').eq('room_id', r.id).order('task_no'),
        supabase.from('player_results').select('*').eq('room_id', r.id),
        supabase.from('tasks').select('*').order('no'),
      ]);
      if (p.error) throw p.error;
      if (res.error) throw res.error;
      if (t.error) throw t.error;
      setRoom(r as Room);
      setPlayers(p.data as Player[]);
      setResults(res.data as PlayerResult[]);
      setTasks(t.data as TaskDef[]);
      setState('ready');
      setError('');
      setConn((c) => (c === 'offline' ? 'online' : c));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
      setError(msg);
      setConn('offline');
      setState((s) => (s === 'ready' ? 'ready' : 'error')); // đã có dữ liệu thì giữ màn hình, chỉ báo mất kết nối
    }
  }, [code]);

  // Tải lần đầu
  useEffect(() => {
    setState('loading');
    syncClock();
    load();
  }, [load]);

  // Realtime: mọi thay đổi trong phòng => nạp lại (đơn giản, nhất quán)
  const id = room?.id;
  useEffect(() => {
    if (!id) return;
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 120);
    };
    const ch = supabase
      .channel('room-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_results', filter: `room_id=eq.${id}` }, refresh)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConn('online');
          syncClock();
          load();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConn('reconnecting');
        else if (status === 'CLOSED') setConn('offline');
      });
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [id, load]);

  // Dự phòng: thăm dò 4 giây/lần khi tab đang hiển thị; tải lại khi có mạng / quay lại tab
  useEffect(() => {
    const poll = window.setInterval(() => {
      if (!document.hidden) load();
    }, 4000);
    const onVis = () => {
      if (!document.hidden) {
        syncClock();
        load();
      }
    };
    const onOnline = () => {
      setConn('reconnecting');
      syncClock();
      load();
    };
    const onOffline = () => setConn('offline');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [load]);

  const isHost = !!room && room.host_id === userId;
  const me = players.find((p) => p.user_id === userId) ?? null;
  return { state, error, room, players, results, tasks, userId, conn, isHost, me, reload: load };
}

/** Đồng hồ chung: suy ra giai đoạn từ mốc thời gian của máy chủ. */
export function usePhase(room: Room | null): PhaseInfo {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const i = window.setInterval(() => setNow(serverNow()), 250);
    return () => window.clearInterval(i);
  }, []);
  return room ? computePhase(room, now) : { phase: 'lobby', remaining: 0, total: 0 };
}

/** Lấy lời giải/gợi ý (máy chủ tự quyết định được xem gì theo giai đoạn). */
export function useSolutions(roomId: string | undefined, phase: string, key: string) {
  const [data, setData] = useState<Solution[]>([]);
  useEffect(() => {
    if (!roomId || !['review', 'confirm', 'finished', 'closed'].includes(phase)) {
      setData([]);
      return;
    }
    let cancel = false;
    getSolutions(roomId)
      .then((d) => !cancel && setData(d))
      .catch(() => !cancel && setData([]));
    return () => {
      cancel = true;
    };
  }, [roomId, phase, key]);
  return data;
}
