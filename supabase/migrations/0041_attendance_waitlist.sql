-- =============================================================
-- Phase 64: 出欠ステータスに 'waitlist' (キャンセル待ち) を追加
--
-- 新ステータスの仕様:
--  - 利用予定では時刻入力可。出席に切り替えた時に時刻が引き継がれる
--  - 送迎表では下部 1 行に集約（担当割当不可）。確認モーダル経由で
--    「利用に変える」操作で attendance_status='present' に昇格させる
--  - 日次出力にもシフトの下に「キャンセル待ち: ① ○○ ② △△」の 1 行を追加
--  - 順番 (waitlist_order) を 1〜10 で持てる。同日内で重複可（兄弟想定）。
--
-- 互換性:
--  - 既存ステータスはそのまま動作。waitlist 以外の場合 waitlist_order は NULL。
-- =============================================================

-- 1) attendance_status の CHECK 制約を貼り直し
alter table public.schedule_entries
  drop constraint if exists schedule_entries_attendance_status_check;

alter table public.schedule_entries
  add constraint schedule_entries_attendance_status_check
    check (attendance_status in (
      'planned', 'present', 'absent', 'late', 'early_leave', 'leave', 'waitlist'
    ));

comment on column public.schedule_entries.attendance_status is
  '出欠ステータス。planned=予定／present=出席／absent=欠席／late=遅刻／early_leave=早退／leave=お休み／waitlist=キャンセル待ち';

-- 2) waitlist_order カラム追加（1〜10、waitlist 以外は NULL を強制）
alter table public.schedule_entries
  add column if not exists waitlist_order smallint null;

alter table public.schedule_entries
  drop constraint if exists schedule_entries_waitlist_order_range;
alter table public.schedule_entries
  add constraint schedule_entries_waitlist_order_range
    check (waitlist_order is null or (waitlist_order between 1 and 10));

alter table public.schedule_entries
  drop constraint if exists schedule_entries_waitlist_order_only_for_waitlist;
alter table public.schedule_entries
  add constraint schedule_entries_waitlist_order_only_for_waitlist
    check (waitlist_order is null or attendance_status = 'waitlist');

comment on column public.schedule_entries.waitlist_order is
  'Phase 64: キャンセル待ちの順番 (1〜10)。waitlist 以外は NULL。同日内で重複可（兄弟想定）。';

-- 3) RPC 拡張: 第3引数 p_waitlist_order を追加。
--    既存の 2 引数呼び出しはデフォルト NULL でそのまま動作。
--    waitlist 以外のステータスに切り替えた場合は waitlist_order を強制 NULL にする。
create or replace function public.update_schedule_entry_attendance(
  p_entry_id uuid,
  p_status text,
  p_waitlist_order smallint default null
) returns public.schedule_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff record;
  v_entry public.schedule_entries;
  v_old_status text;
  v_new_order smallint;
begin
  -- セッションから職員情報取得（退職者・未ログインは弾かれる）
  select id, tenant_id, name
    into v_staff
    from public.staff
    where user_id = auth.uid()
      and is_active = true
    limit 1;

  if v_staff.id is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  if p_status not in ('planned', 'present', 'absent', 'late', 'early_leave', 'leave', 'waitlist') then
    raise exception '不正な出欠ステータスです: %', p_status using errcode = '22023';
  end if;

  -- waitlist_order の検証（waitlist 以外の場合は強制 NULL）
  if p_status = 'waitlist' then
    if p_waitlist_order is not null and (p_waitlist_order < 1 or p_waitlist_order > 10) then
      raise exception 'キャンセル待ちの順番は 1〜10 で指定してください' using errcode = '22023';
    end if;
    v_new_order := p_waitlist_order;
  else
    v_new_order := null;
  end if;

  -- エントリ取得（tenant 一致チェック）
  select * into v_entry
    from public.schedule_entries
    where id = p_entry_id
      and tenant_id = v_staff.tenant_id
    for update;

  if v_entry.id is null then
    raise exception '対象の利用予定が見つかりません' using errcode = 'P0002';
  end if;

  v_old_status := v_entry.attendance_status;

  -- 変更なし（status も order も同一）ならスキップ
  if v_old_status = p_status and coalesce(v_entry.waitlist_order, -1) = coalesce(v_new_order, -1) then
    return v_entry;
  end if;

  update public.schedule_entries
    set attendance_status = p_status,
        waitlist_order = v_new_order,
        attendance_updated_at = now(),
        attendance_updated_by = v_staff.id
    where id = p_entry_id
    returning * into v_entry;

  -- 履歴は status 変更時のみ記録（order だけの変更は履歴を膨らませないため記録しない）
  if v_old_status <> p_status then
    insert into public.attendance_audit_logs (
      tenant_id, schedule_entry_id, child_id, entry_date,
      changed_by_staff_id, changed_by_name,
      old_status, new_status
    ) values (
      v_entry.tenant_id, v_entry.id, v_entry.child_id, v_entry.date,
      v_staff.id, v_staff.name,
      v_old_status, p_status
    );
  end if;

  return v_entry;
end;
$$;
