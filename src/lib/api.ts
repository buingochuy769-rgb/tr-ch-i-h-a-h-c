import { ensureSession, supabase } from './supabase';
import type { Response, Solution } from './types';

const MSG: Record<string, string> = {
  not_authenticated: 'Chưa có phiên đăng nhập ẩn danh. Hãy tải lại trang.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  room_not_found: 'Không tìm thấy phòng với mã này.',
  room_full: 'Phòng đã đủ 10 điều tra viên.',
  room_started: 'Trò chơi đã bắt đầu, không thể tham gia thêm.',
  name_taken: 'Tên này đã có người dùng trong phòng. Hãy chọn tên khác.',
  invalid_name: 'Tên phải có từ 1 đến 24 kí tự.',
  host_cannot_join: 'Bạn là người tạo phòng nên không thể tham gia làm điều tra viên.',
  submission_closed: 'Đã hết thời gian nộp bài ở giai đoạn hiện tại.',
  already_complete: 'Bạn đã hoàn thành nhiệm vụ rồi.',
  mission_already_submitted: 'Bạn đã nộp bài. Hãy chờ giai đoạn kiểm tra để sửa.',
  bad_response: 'Câu trả lời không hợp lệ.',
  bad_state: 'Thao tác không hợp lệ ở giai đoạn hiện tại.',
  no_players: 'Chưa có điều tra viên nào trong phòng.',
  support_used: 'Đội đã dùng quyền hỗ trợ.',
  support_not_ready: 'Chưa có ai nộp bài nên chưa thể dùng quyền hỗ trợ.',
  bad_key: 'Mã khôi phục không đúng.',
  rate_limited: 'Bạn tạo phòng quá nhanh. Hãy thử lại sau.',
  not_a_player: 'Bạn chưa tham gia phòng này.',
};

export function toMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  for (const k of Object.keys(MSG)) if (m.includes(k)) return MSG[k];
  if (/fetch|network|Failed/i.test(m)) return 'Mất kết nối mạng. Hãy kiểm tra Internet rồi thử lại.';
  return 'Lỗi máy chủ: ' + m;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  await ensureSession();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(toMessage(error));
  return data as T;
}

export const createRoom = () => rpc<{ room_id: string; code: string; host_key: string }>('create_room');
export const joinRoom = (code: string, name: string) =>
  rpc<{ room_id: string; player_id: string; rejoined: boolean }>('join_room', { p_code: code, p_name: name });
export const reclaimHost = (code: string, key: string) => rpc<{ room_id: string }>('reclaim_host', { p_code: code, p_key: key });
export const kickPlayer = (room: string, player: string) => rpc<void>('kick_player', { p_room: room, p_player: player });
export const startGame = (room: string) => rpc<void>('start_game', { p_room: room });
export const advancePhase = (room: string) => rpc<string>('advance_phase', { p_room: room });
export const endGame = (room: string) => rpc<void>('end_game', { p_room: room });
export const activateSupport = (room: string) => rpc<void>('activate_support', { p_room: room });
export const setVerdict = (room: string, v: 'confirmed' | 'pending_verification') =>
  rpc<void>('set_verdict', { p_room: room, p_verdict: v });
export const closeRoom = (room: string) => rpc<void>('close_room', { p_room: room });
export const purgeRoom = (room: string) => rpc<void>('purge_room', { p_room: room });
export const submitAnswer = (room: string, nonce: string, response: Response) =>
  rpc<{ duplicate: boolean; is_correct: boolean; attempt: number; score?: number }>('submit_answer', {
    p_room: room,
    p_nonce: nonce,
    p_response: response,
  });
export const getSolutions = (room: string) => rpc<Solution[]>('get_solutions', { p_room: room });
