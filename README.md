# HỒ SƠ NGUYÊN TỬ BÍ ẨN

Game giáo dục trực tuyến, nhiều người chơi, dựa trên Hóa học 10 (Bài 1, Bài 2).
React + TypeScript + Vite + Tailwind CSS · Supabase (PostgreSQL, Realtime, Auth ẩn danh, RLS).

## Kiến trúc

```
Trình duyệt (React) ──supabase-js──► Supabase
   │  chỉ có URL + anon key             ├─ Auth: phiên ẩn danh (không email, không dữ liệu cá nhân)
   │                                    ├─ PostgreSQL: bảng + RLS + hàm RPC (SECURITY DEFINER)
   └── Realtime (postgres_changes) ◄────┘   rooms / players / player_results
```

- **Một nguồn thời gian**: `rooms.started_at` (giờ máy chủ). Giai đoạn được suy ra từ `now() - started_at`
  (0-30s hướng dẫn, 30-210s nhiệm vụ, 210-300s kiểm tra, 300-360s xác nhận). Trình duyệt chỉ đo độ lệch so với
  máy chủ (`server_time()`), không dùng đồng hồ riêng. Máy chủ từ chối nộp bài ngoài giai đoạn cho phép.
- **Đáp án chỉ ở máy chủ**: bảng `task_secrets` bật RLS và không có policy nào, nên API không đọc được.
  Chấm bài bằng `submit_answer()`. Lời giải/gợi ý chỉ ra qua `get_solutions()` theo giai đoạn.
- **Quyền giáo viên** = `rooms.host_id = auth.uid()`. Mọi hàm điều khiển (bắt đầu, chuyển giai đoạn, hỗ trợ,
  xác nhận, đóng, xóa) kiểm tra quyền này. Không có policy INSERT/UPDATE/DELETE, mọi ghi đều qua RPC.
- **Chống nộp trùng / đồng thời**: khóa dòng `players` khi nộp + `unique (player_id, nonce)`; gửi lại cùng
  `nonce` sau khi mất mạng trả kết quả cũ, không chấm lần hai.
- **Khôi phục khi tải lại**: phiên ẩn danh lưu trong trình duyệt; `join_room` trả về người chơi cũ; trạng thái đọc lại từ DB.

## Cấu trúc thư mục

```
ho-so-nguyen-tu/
├─ supabase/migrations/001_schema.sql   bảng, RLS, RPC, realtime, dữ liệu 10 nhiệm vụ
├─ src/
│  ├─ lib/        supabase.ts, api.ts, clock.ts, phase.ts, sound.ts, types.ts
│  ├─ hooks/      useRoom.ts (realtime, đồng hồ, lời giải)
│  ├─ components/ Atom, Ui, TaskForm, PlayerGrid, Summary, Solutions
│  └─ pages/      Home, Room (+JoinPanel), HostView, PlayerView
├─ .env.example · vercel.json · package.json · vite/tailwind/ts config
```

## Luật chơi đã cài đặt

- Tối đa 10 người/phòng, mỗi người một hồ sơ (task 1-10). Vào phòng chỉ khi phòng còn ở trạng thái chờ.
- Nhiệm vụ: **nộp một lần**. Kiểm tra: được nộp bản sửa cho đến khi đúng. Xác nhận: khóa nộp.
- Hoàn thành = đúng toàn bộ các ô của nhiệm vụ (điểm từng người = % ô đúng tốt nhất).
- Quyền hỗ trợ: giáo viên dùng **một lần** trong giai đoạn kiểm tra (sau khi đã có người nộp); hiện gợi ý cho người chưa
  đúng, không tự đổi câu trả lời. Lưu kết quả trước hỗ trợ (`before_support_*`) và sau (điểm cuối).
- Đáp án + lời giải: người chơi thấy của mình khi đã đúng (kiểm tra) hoặc từ giai đoạn xác nhận; giáo viên thấy tất cả từ
  giai đoạn kiểm tra; mọi người thấy tất cả khi kết thúc.
- Vượt phòng: số người đúng ≥ ceil(70% × số người tham gia) = `(7n+9)/10` (7/10, 7/9, 6/8). Giáo viên bấm **Xác nhận**
  hoặc **CHỜ XÁC MINH BỔ SUNG**. Chỉ giáo viên (host) ghi được kết luận.
- Không có nút tạm dừng: đồng hồ dựa trên mốc máy chủ nên tạm dừng sẽ làm lệch các thiết bị. Giáo viên có thể
  chuyển sớm sang giai đoạn kế tiếp hoặc kết thúc ngay.
- Kí hiệu nguyên tử chấp nhận: `^27_13Al`, `27/13Al`, `27 13 Al`, `²⁷₁₃Al`, `{}^{27}_{13}Al`, `27Al`, `Al-27`, `Al27`.
  Số thập phân chấp nhận dấu `,` hoặc `.`.

## Phần BẠN phải tự làm (cần tài khoản của bạn)

### 1. Tạo dự án Supabase
1. Vào https://supabase.com/dashboard, tạo project mới (chọn vùng gần Việt Nam, ví dụ Singapore).
2. **Authentication → Sign In / Providers → bật "Allow anonymous sign-ins"** (bắt buộc).
   Khuyến nghị bật CAPTCHA (Authentication → Attack Protection → Cloudflare Turnstile/hCaptcha) để chống lạm dụng phiên ẩn danh.
3. **SQL Editor → New query**, dán toàn bộ `supabase/migrations/001_schema.sql` → Run.
   (Chỉ chạy một lần. Nếu cần chạy lại, xóa các bảng/hàm cũ trước.)
4. **Project Settings → API**: lấy `Project URL` và `anon public key`. Không dùng `service_role` ở frontend.
5. Kiểm tra **Database → Replication / Publications → supabase_realtime** có 3 bảng `rooms`, `players`, `player_results`
   (file SQL đã thêm sẵn).

### 2. Chạy thử trên máy
```bash
cp .env.example .env     # điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY
npm install
npm run dev              # http://localhost:5173
```
Mở một cửa sổ thường (giáo viên) và các cửa sổ ẩn danh/điện thoại khác (học sinh) để thử nhiều người chơi thật.

### 3. Triển khai lên Vercel
1. Đẩy mã lên GitHub.
2. https://vercel.com/new → Import repo (Framework: Vite, build `npm run build`, output `dist`).
3. Environment Variables: thêm `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Deploy.
4. Gửi link `https://<tên-dự-án>.vercel.app` hoặc link phòng `https://.../room/MÃPHÒNG`. `vercel.json` đã cấu hình chuyển hướng SPA.
(Có thể dùng Netlify/Cloudflare Pages tương tự; nhớ rewrite mọi đường dẫn về `index.html`.)

## Xóa dữ liệu
- Giáo viên bấm **Xóa dữ liệu phòng** (xóa cascade người chơi, bài làm, kết quả).
- Dọn tự động phòng cũ hơn 7 ngày (tùy chọn): bật extension `pg_cron` rồi chạy trong SQL Editor
  ```sql
  select cron.schedule('purge-old-rooms', '0 3 * * *', $$select public.purge_old_rooms(7)$$);
  ```
  Người dùng không gọi được `purge_old_rooms` (chỉ chạy bằng cron/quản trị).

## Lưu ý vận hành
- Giáo viên mất phiên trình duyệt: dùng **mã khôi phục** hiện trên màn hình giáo viên (trang vào phòng → "Tôi là giáo viên...").
- Học sinh đổi thiết bị giữa chừng sẽ là người chơi mới (phiên ẩn danh gắn với trình duyệt), và chỉ vào được khi phòng còn ở trạng thái chờ.
- Mã phòng 6 kí tự: ai biết mã có thể vào phòng khi còn ở trạng thái chờ. Giáo viên có thể xóa người lạ trước khi bắt đầu.
- Trình duyệt vẫn nhận được trạng thái "đã nộp/hoàn thành" của mọi người trong phòng (hiển thị theo giai đoạn ở giao diện), nhưng không bao giờ nhận đáp án.
