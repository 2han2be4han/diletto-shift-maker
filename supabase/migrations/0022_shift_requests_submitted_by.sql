-- =============================================================
-- shift_requests.submitted_by_staff_id: 入力者 (代理入力判定用)
--
-- NULL or = staff_id なら本人提出、異なる場合は代理入力。
-- =============================================================

alter table public.shift_requests
  add column if not exists submitted_by_staff_id uuid references public.staff(id) on delete set null;

comment on column public.shift_requests.submitted_by_staff_id is
  '入力した職員の id。NULL or = staff_id なら本人、異なる場合は代理入力を表す';

create index if not exists idx_shiftreq_submitted_by on public.shift_requests(submitted_by_staff_id);
