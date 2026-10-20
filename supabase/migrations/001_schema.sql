-- =====================================================================
-- HỒ SƠ NGUYÊN TỬ BÍ ẨN - schema, RLS, RPC (Supabase PostgreSQL)
-- Chạy toàn bộ file này trong Supabase Dashboard > SQL Editor.
-- Yêu cầu: bật Authentication > Sign In / Providers > "Allow anonymous sign-ins".
-- =====================================================================

-- ---------- BẢNG ----------
create table public.tasks (
  no     int primary key check (no between 1 and 10),
  title  text not null,
  prompt text not null,
  kind   text not null check (kind in ('numeric','choice','symbol')),
  fields jsonb,   -- [{key,label}] cho câu nhập số
  options jsonb   -- [{id,text}] cho câu trắc nghiệm
);

-- Đáp án chuẩn: RLS bật, KHÔNG có policy => trình duyệt không đọc được.
create table public.task_secrets (
  task_no     int primary key references public.tasks(no) on delete cascade,
  answer      jsonb not null,
  answer_text text not null,
  explanation text not null,
  hint        text not null
);

create table public.rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  host_id    uuid not null,
  status     text not null default 'lobby' check (status in ('lobby','playing','closed')),
  started_at timestamptz,              -- đồng hồ chung: mọi giai đoạn suy ra từ mốc này
  ended_at   timestamptz,
  support_used boolean not null default false,
  support_active boolean not null default false,
  support_activated_at timestamptz,
  verdict    text check (verdict in ('confirmed','pending_verification')),
  created_at timestamptz not null default now()
);
create index rooms_host_idx on public.rooms(host_id);

create table public.room_secrets (   -- mã khôi phục quyền giáo viên; không policy
  room_id  uuid primary key references public.rooms(id) on delete cascade,
  host_key text not null
);

create table public.players (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  task_no      int  not null references public.tasks(no),
  joined_at    timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, task_no)
);
create unique index players_name_uq on public.players(room_id, lower(display_name));

create table public.player_results (
  player_id uuid primary key references public.players(id) on delete cascade,
  room_id   uuid not null references public.rooms(id) on delete cascade,
  attempts  int not null default 0,
  first_score int,
  first_submitted_at timestamptz,
  best_score int not null default 0,
  is_complete boolean not null default false,
  completed_at timestamptz,
  before_support_complete boolean,
  before_support_score int,
  updated_at timestamptz not null default now()
);
create index player_results_room_idx on public.player_results(room_id);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  task_no int not null,
  attempt int not null,
  nonce uuid not null,
  response jsonb not null,
  correct_fields int not null,
  total_fields int not null,
  is_correct boolean not null,
  phase text not null,
  after_support boolean not null default false,
  created_at timestamptz not null default now(),
  unique (player_id, attempt),
  unique (player_id, nonce)            -- chống nộp trùng khi client gửi lại
);

-- ---------- HÀM TIỆN ÍCH ----------
create or replace function public.required_completions(n int) returns int
language sql immutable as $$ select (7 * n + 9) / 10 $$;   -- ceil(70% * n), số nguyên

create or replace function public.room_phase(r public.rooms) returns text
language sql stable as $$
  select case
    when r.status = 'closed' then 'closed'
    when r.status = 'lobby' or r.started_at is null then 'lobby'
    when r.ended_at is not null then 'finished'
    when now() - r.started_at < interval '30 seconds'  then 'briefing'
    when now() - r.started_at < interval '210 seconds' then 'mission'
    when now() - r.started_at < interval '300 seconds' then 'review'
    when now() - r.started_at < interval '360 seconds' then 'confirm'
    else 'finished' end
$$;

create or replace function public.is_room_host(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms where id = p_room and host_id = auth.uid())
$$;

create or replace function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms where id = p_room and host_id = auth.uid())
      or exists (select 1 from players where room_id = p_room and user_id = auth.uid())
$$;

create or replace function public.server_time() returns timestamptz
language sql stable as $$ select now() $$;

-- ---------- CHẤM BÀI (chỉ dùng nội bộ) ----------
create or replace function public.grade_response(p_task int, p_response jsonb)
returns table(c_ok int, c_total int)
language plpgsql stable security definer set search_path = public as $$
declare
  s task_secrets; k text; f record; raw text; v numeric;
  n_ok int := 0; n_tot int := 0; norm text;
begin
  select * into s from task_secrets where task_no = p_task;
  if not found then raise exception 'task_not_found'; end if;
  k := s.answer->>'kind';

  if k = 'numeric' then
    for f in select key, value from jsonb_each_text(s.answer->'fields') loop
      n_tot := n_tot + 1;
      raw := replace(btrim(coalesce(p_response->>f.key, '')), ',', '.');
      if raw ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then
        v := raw::numeric;
        if abs(v - f.value::numeric) < 0.0005 then n_ok := n_ok + 1; end if;
      end if;
    end loop;

  elsif k = 'choice' then
    n_tot := 1;
    if p_response->>'choice' = s.answer->>'value' then n_ok := 1; end if;

  elsif k = 'symbol' then
    n_tot := 1;
    -- chuẩn hóa: chữ thường, đổi chỉ số trên/dưới Unicode thành số, bỏ ^ _ { } ( ) / - khoảng trắng
    norm := lower(coalesce(p_response->>'symbol', ''));
    norm := translate(norm, '⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉', '01234567890123456789');
    norm := regexp_replace(norm, '[\s^_{}()/\\.,:;-]', '', 'g');
    if norm in (select jsonb_array_elements_text(s.answer->'accepted')) then n_ok := 1; end if;
  end if;

  return query select n_ok, n_tot;
end $$;

-- ---------- RPC: PHÒNG ----------
create or replace function public.create_room() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text; v_id uuid; v_key text := ''; i int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if (select count(*) from rooms where host_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited';
  end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into rooms(code, host_id) values (v_code, auth.uid()) returning id into v_id;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  for i in 1..8 loop
    v_key := v_key || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  insert into room_secrets(room_id, host_key) values (v_id, v_key);
  return jsonb_build_object('room_id', v_id, 'code', v_code, 'host_key', v_key);
end $$;

create or replace function public.reclaim_host(p_code text, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into r from rooms where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'room_not_found'; end if;
  if not exists (select 1 from room_secrets where room_id = r.id and host_key = upper(btrim(p_key))) then
    raise exception 'bad_key';
  end if;
  if exists (select 1 from players where room_id = r.id and user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  update rooms set host_id = auth.uid() where id = r.id;
  return jsonb_build_object('room_id', r.id);
end $$;

create or replace function public.join_room(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r rooms; p players; cnt int; tno int; nm text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(nm) < 1 or char_length(nm) > 24 then raise exception 'invalid_name'; end if;
  select * into r from rooms where code = upper(btrim(p_code)) for update;  -- khóa để tuần tự hóa việc vào phòng
  if not found then raise exception 'room_not_found'; end if;
  select * into p from players where room_id = r.id and user_id = auth.uid();
  if found then   -- tải lại trang / vào lại: khôi phục
    return jsonb_build_object('room_id', r.id, 'player_id', p.id, 'rejoined', true);
  end if;
  if r.host_id = auth.uid() then raise exception 'host_cannot_join'; end if;
  if r.status <> 'lobby' then raise exception 'room_started'; end if;
  select count(*) into cnt from players where room_id = r.id;
  if cnt >= 10 then raise exception 'room_full'; end if;
  select min(n) into tno from generate_series(1, 10) n
   where not exists (select 1 from players x where x.room_id = r.id and x.task_no = n);
  begin
    insert into players(room_id, user_id, display_name, task_no)
    values (r.id, auth.uid(), nm, tno) returning * into p;
  exception when unique_violation then raise exception 'name_taken';
  end;
  insert into player_results(player_id, room_id) values (p.id, r.id);
  return jsonb_build_object('room_id', r.id, 'player_id', p.id, 'rejoined', false);
end $$;

create or replace function public.kick_player(p_room uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room for update;
  if not found or r.host_id <> auth.uid() then raise exception 'forbidden'; end if;
  if r.status <> 'lobby' then raise exception 'bad_state'; end if;
  delete from players where id = p_player and room_id = p_room;
end $$;

create or replace function public.start_game(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room for update;
  if not found or r.host_id <> auth.uid() then raise exception 'forbidden'; end if;
  if r.status <> 'lobby' then raise exception 'bad_state'; end if;
  if not exists (select 1 from players where room_id = p_room) then raise exception 'no_players'; end if;
  update rooms set status = 'playing', started_at = now() where id = p_room;
end $$;

-- Chuyển sớm sang giai đoạn kế tiếp bằng cách dịch mốc started_at (vẫn một nguồn thời gian duy nhất)
create or replace function public.advance_phase(p_room uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r rooms; ph text;
begin
  select * into r from rooms where id = p_room for update;
  if not found or r.host_id <> auth.uid() then raise exception 'forbidden'; end if;
  ph := room_phase(r);
  if ph = 'briefing' then update rooms set started_at = now() - interval '30 seconds'  where id = p_room;
  elsif ph = 'mission' then update rooms set started_at = now() - interval '210 seconds' where id = p_room;
  elsif ph = 'review'  then update rooms set started_at = now() - interval '300 seconds' where id = p_room;
  elsif ph = 'confirm' then update rooms set ended_at = now() where id = p_room;
  else raise exception 'bad_state'; end if;
  return ph;
end $$;

create or replace function public.end_game(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room for update;
  if not found or r.host_id <> auth.uid() then raise exception 'forbidden'; end if;
  if r.status <> 'playing' then raise exception 'bad_state'; end if;
  update rooms set ended_at = coalesce(ended_at, now()) where id = p_room;
end $$;

create or replace function public.activate_support(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room for update;
  if not found or r.host_id <> auth.uid() then raise exception 'forbidden'; end if;
  if room_phase(r) <> 'review' then raise exception 'bad_state'; end if;
  if r.support_used then raise exception 'support_used'; end if;
  if not exists (select 1 from player_results where room_id = p_room and attempts > 0) then
    raise exception 'support_not_ready';
  end if;
  update player_results set before_support_complete = is_complete, before_support_score = best_score
   where room_id = p_room;
  update rooms set support_used = true, support_active = true, support_activated_at = now() where id = p_room;
end $$;

create or replace function public.set_verdict(p_room uuid, p_verdict text) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room for update;
  if not found or r.host_id <> auth.uid() then raise exception 'forbidden'; end if;
  if p_verdict not in ('confirmed','pending_verification') then raise exception 'bad_state'; end if;
  if room_phase(r) not in ('confirm','finished') then raise exception 'bad_state'; end if;
  update rooms set verdict = p_verdict where id = p_room;
end $$;

create or replace function public.close_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room for update;
  if not found or r.host_id <> auth.uid() then raise exception 'forbidden'; end if;
  if room_phase(r) <> 'finished' then raise exception 'bad_state'; end if;
  update rooms set status = 'closed', ended_at = coalesce(ended_at, now()) where id = p_room;
end $$;

create or replace function public.purge_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_room_host(p_room) then raise exception 'forbidden'; end if;
  delete from rooms where id = p_room;   -- cascade: players, results, answers, secrets
end $$;

-- Dọn tự động (không cấp cho người dùng; gọi bằng pg_cron, xem README)
create or replace function public.purge_old_rooms(p_days int default 7) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from rooms where created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- RPC: NỘP BÀI ----------
create or replace function public.submit_answer(p_room uuid, p_nonce uuid, p_response jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r rooms; p players; ph text; res player_results; ex answers;
  v_ok int; v_tot int; v_score int; att int; v_correct boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into p from players where room_id = p_room and user_id = auth.uid() for update;  -- khóa người chơi: chống nộp song song
  if not found then raise exception 'not_a_player'; end if;

  select * into ex from answers where player_id = p.id and nonce = p_nonce;
  if found then   -- gửi lại cùng một lần nộp => trả kết quả cũ, không chấm lần nữa
    return jsonb_build_object('duplicate', true, 'is_correct', ex.is_correct, 'attempt', ex.attempt);
  end if;

  select * into r from rooms where id = p_room;
  ph := room_phase(r);
  if ph not in ('mission','review') then raise exception 'submission_closed'; end if;

  select * into res from player_results where player_id = p.id for update;
  if res.is_complete then raise exception 'already_complete'; end if;
  if ph = 'mission' and res.attempts >= 1 then raise exception 'mission_already_submitted'; end if;
  if jsonb_typeof(p_response) <> 'object' or length(p_response::text) > 400 then raise exception 'bad_response'; end if;

  select g.c_ok, g.c_total into v_ok, v_tot from grade_response(p.task_no, p_response) g;
  v_correct := (v_ok = v_tot);
  v_score := round(100.0 * v_ok / v_tot);
  att := res.attempts + 1;

  insert into answers(room_id, player_id, task_no, attempt, nonce, response, correct_fields, total_fields, is_correct, phase, after_support)
  values (p_room, p.id, p.task_no, att, p_nonce, p_response, v_ok, v_tot, v_correct, ph, r.support_active);

  update player_results set
    attempts = att,
    first_score = coalesce(first_score, v_score),
    first_submitted_at = coalesce(first_submitted_at, now()),
    best_score = greatest(best_score, v_score),
    is_complete = v_correct,
    completed_at = case when v_correct then now() else null end,
    updated_at = now()
  where player_id = p.id;

  return jsonb_build_object('duplicate', false, 'is_correct', v_correct, 'attempt', att, 'score', v_score);
end $$;

-- ---------- RPC: ĐÁP ÁN / LỜI GIẢI / GỢI Ý (kiểm soát theo giai đoạn) ----------
create or replace function public.get_solutions(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r rooms; ph text; v_host boolean; v_task int; v_done boolean := false; v_pid uuid;
  v_all boolean; v_own boolean; out jsonb;
begin
  if not is_room_member(p_room) then raise exception 'forbidden'; end if;
  select * into r from rooms where id = p_room;
  ph := room_phase(r);
  v_host := (r.host_id = auth.uid());
  select pl.id, pl.task_no into v_pid, v_task from players pl where pl.room_id = p_room and pl.user_id = auth.uid();
  if v_pid is not null then
    select pr.is_complete into v_done from player_results pr where pr.player_id = v_pid;
  end if;

  v_all := ph in ('finished','closed') or (v_host and ph in ('review','confirm'));
  v_own := v_pid is not null and ((ph = 'review' and coalesce(v_done,false)) or ph = 'confirm');

  select coalesce(jsonb_agg(jsonb_build_object(
      'task_no', s.task_no,
      'answer_text', case when v_all or (v_own and s.task_no = v_task) then s.answer_text end,
      'explanation', case when v_all or (v_own and s.task_no = v_task) then s.explanation end,
      'hint', case when r.support_active and ph in ('review','confirm')
                    and (v_host or (s.task_no = v_task and not coalesce(v_done,false))) then s.hint end,
      'own', (v_pid is not null and s.task_no = v_task)
    ) order by s.task_no), '[]'::jsonb)
  into out from task_secrets s;
  return out;
end $$;

-- ---------- RLS ----------
alter table public.tasks          enable row level security;
alter table public.task_secrets   enable row level security;
alter table public.rooms          enable row level security;
alter table public.room_secrets   enable row level security;
alter table public.players        enable row level security;
alter table public.player_results enable row level security;
alter table public.answers        enable row level security;

create policy tasks_read on public.tasks for select to authenticated using (true);
create policy rooms_read on public.rooms for select to authenticated using (public.is_room_member(id));
create policy players_read on public.players for select to authenticated using (public.is_room_member(room_id));
create policy results_read on public.player_results for select to authenticated using (public.is_room_member(room_id));
create policy answers_read on public.answers for select to authenticated
  using (public.is_room_host(room_id) or player_id in (select id from public.players where user_id = auth.uid()));
-- task_secrets, room_secrets: không policy => không ai đọc được qua API. Không có policy INSERT/UPDATE/DELETE ở đâu cả.

-- ---------- QUYỀN ----------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.tasks, public.rooms, public.players, public.player_results, public.answers to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.server_time(), public.create_room(), public.reclaim_host(text, text), public.join_room(text, text),
  public.kick_player(uuid, uuid), public.start_game(uuid), public.advance_phase(uuid), public.end_game(uuid),
  public.activate_support(uuid), public.set_verdict(uuid, text), public.close_room(uuid), public.purge_room(uuid),
  public.submit_answer(uuid, uuid, jsonb), public.get_solutions(uuid),
  public.is_room_host(uuid), public.is_room_member(uuid), public.required_completions(int)
to authenticated;

-- ---------- REALTIME ----------
alter publication supabase_realtime add table public.rooms, public.players, public.player_results;

-- ---------- DỮ LIỆU 10 NHIỆM VỤ ----------
insert into public.tasks(no, title, prompt, kind, fields, options) values
(1, 'Nguyên tử trung hòa Z = 11',
 'Nguyên tử trung hòa X có Z = 11 và số khối A = 23. Tính số proton, neutron, electron.', 'numeric',
 '[{"key":"p","label":"Số proton"},{"key":"n","label":"Số neutron"},{"key":"e","label":"Số electron"}]', null),
(2, 'Nguyên tử trung hòa có 17p, 18n',
 'Nguyên tử trung hòa Y có 17 proton và 18 neutron. Tính điện tích hạt nhân Z, số khối A và số electron.', 'numeric',
 '[{"key":"z","label":"Z"},{"key":"a","label":"A"},{"key":"e","label":"Số electron"}]', null),
(3, 'Ion Mg²⁺',
 'Ion Mg²⁺ có Z = 12, A = 24. Tính số proton, neutron, electron.', 'numeric',
 '[{"key":"p","label":"Số proton"},{"key":"n","label":"Số neutron"},{"key":"e","label":"Số electron"}]', null),
(4, 'Ion Cl⁻',
 'Ion Cl⁻ có Z = 17, A = 35. Tính số proton, neutron, electron.', 'numeric',
 '[{"key":"p","label":"Số proton"},{"key":"n","label":"Số neutron"},{"key":"e","label":"Số electron"}]', null),
(5, 'Viết kí hiệu nguyên tử',
 'Nguyên tử có 13 proton và 14 neutron. Viết kí hiệu nguyên tử (gõ dạng 35/17Cl, ^35_17Cl hoặc ³⁵₁₇Cl: số khối A, số hiệu Z, rồi kí hiệu nguyên tố).', 'symbol',
 null, null),
(6, 'Đồng vị?',
 'Hai nguyên tử đều có Z = 6, số khối lần lượt là 12 và 14. Chúng có phải đồng vị của nhau không?', 'choice',
 null, '[{"id":"a","text":"Có, cùng số proton nhưng khác số neutron"},{"id":"b","text":"Không, vì khác số khối"},{"id":"c","text":"Không, vì cùng là một nguyên tố"},{"id":"d","text":"Có, vì cùng số khối"}]'),
(7, 'Điện tích hạt nhân',
 'Nguyên tử có Z = 8. Điện tích hạt nhân là bao nhiêu?', 'choice',
 null, '[{"id":"a","text":"+8e"},{"id":"b","text":"−8e"},{"id":"c","text":"+16e"},{"id":"d","text":"0"}]'),
(8, 'Từ số electron',
 'Nguyên tử trung hòa có 20 electron. Xác định số proton và Z.', 'numeric',
 '[{"key":"p","label":"Số proton"},{"key":"z","label":"Z"}]', null),
(9, 'Nguyên tử khối trung bình (B)',
 'Nguyên tố có hai đồng vị với khối lượng 10 và 11, tỉ lệ số nguyên tử lần lượt là 20% và 80%. Tính nguyên tử khối trung bình.', 'numeric',
 '[{"key":"m","label":"Nguyên tử khối trung bình"}]', null),
(10, 'Nguyên tử khối trung bình (Cl)',
 'Nguyên tố có hai đồng vị với khối lượng 35 và 37, tỉ lệ số nguyên tử lần lượt là 75% và 25%. Tính nguyên tử khối trung bình.', 'numeric',
 '[{"key":"m","label":"Nguyên tử khối trung bình"}]', null);

insert into public.task_secrets(task_no, answer, answer_text, explanation, hint) values
(1, '{"kind":"numeric","fields":{"p":11,"n":12,"e":11}}', 'p = 11; n = 12; e = 11',
 'Nguyên tử trung hòa: p = e = Z = 11. N = A − Z = 23 − 11 = 12.',
 'Nguyên tử trung hòa thì số electron bằng số proton. Số neutron N = A − Z.'),
(2, '{"kind":"numeric","fields":{"z":17,"a":35,"e":17}}', 'Z = 17; A = 35; e = 17',
 'Z bằng số proton = 17. A = Z + N = 17 + 18 = 35. Nguyên tử trung hòa nên e = p = 17.',
 'Số khối A là tổng số proton và số neutron.'),
(3, '{"kind":"numeric","fields":{"p":12,"n":12,"e":10}}', 'p = 12; n = 12; e = 10',
 'p = Z = 12. N = 24 − 12 = 12. Mg²⁺ đã mất 2 electron nên e = 12 − 2 = 10.',
 'Ion dương đã mất electron; số proton và neutron không đổi.'),
(4, '{"kind":"numeric","fields":{"p":17,"n":18,"e":18}}', 'p = 17; n = 18; e = 18',
 'p = Z = 17. N = 35 − 17 = 18. Cl⁻ đã nhận thêm 1 electron nên e = 17 + 1 = 18.',
 'Ion âm đã nhận thêm electron; số proton không đổi.'),
(5, '{"kind":"symbol","accepted":["2713al","27al","al27"]}', '²⁷₁₃Al',
 'Z = 13 là nhôm (Al). A = Z + N = 13 + 14 = 27. Kí hiệu nguyên tử: ²⁷₁₃Al.',
 'Tính A = p + n, lấy Z = số proton, tra nguyên tố có Z đó rồi viết A (trên), Z (dưới) cạnh kí hiệu.'),
(6, '{"kind":"choice","value":"a"}', 'Có, cùng số proton nhưng khác số neutron',
 'Cùng Z = 6 (cùng nguyên tố C). N = 12 − 6 = 6 và N = 14 − 6 = 8: khác số neutron nên là đồng vị.',
 'Đồng vị là các nguyên tử cùng số proton, khác số neutron. Tính N = A − Z cho từng nguyên tử.'),
(7, '{"kind":"choice","value":"a"}', '+8e',
 'Điện tích hạt nhân bằng số proton nhân với điện tích e. Z = 8 nên điện tích hạt nhân là +8e.',
 'Điện tích hạt nhân chỉ do proton quyết định, và proton mang điện tích dương.'),
(8, '{"kind":"numeric","fields":{"p":20,"z":20}}', 'p = 20; Z = 20',
 'Nguyên tử trung hòa: p = e = 20. Z bằng số proton nên Z = 20.',
 'Nguyên tử trung hòa thì số electron bằng số proton, và Z chính là số proton.'),
(9, '{"kind":"numeric","fields":{"m":10.8}}', '10,8',
 'M = (10 × 20 + 11 × 80) / 100 = 10,8.',
 'Nguyên tử khối trung bình = tổng (khối lượng × % số nguyên tử) chia 100.'),
(10, '{"kind":"numeric","fields":{"m":35.5}}', '35,5',
 'M = (35 × 75 + 37 × 25) / 100 = 35,5.',
 'Nguyên tử khối trung bình = tổng (khối lượng × % số nguyên tử) chia 100.');
