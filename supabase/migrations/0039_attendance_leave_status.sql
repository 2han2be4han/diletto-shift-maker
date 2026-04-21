-- =============================================================
-- 出欠ステータスに 'leave' (お休み) を追加
--
-- これまで「お休み」と「欠席」は UI 上 2 つのボタンに分かれていたが
-- DB 上はどちらも attendance_status='absent' に集約されていたため、
--   - お休みボタンを押しても表示が「欠席」になる
--   - お休み／欠席の両ボタンが同時にハイライトされる
-- という問題があった。
--
-- 挙動（時刻 null・送迎表から除外など）は absent と完全に同じだが、
-- 表示と記録のために 'leave' を別ステータスとして独立させる。
-- =============================================================

-- check 制約を貼り直し
alter table public.schedule_entries
  drop constraint if exists schedule_entries_attendance_status_check;

alter table public.schedule_entries
  add constraint schedule_entries_attendance_status_check
    check (attendance_status in ('planned', 'present', 'absent', 'late', 'early_leave', 'leave'));

comment on column public.schedule_entries.attendance_status is
  '出欠ステータス。planned=予定／present=出席／absent=欠席／late=遅刻／early_leave=早退／leave=お休み（欠席と同じ扱いだが区別表示）';

-- RPC 側の検証リストも更新
create or replace function public.update_schedule_entry_attendance(
  p_entry_id uuid,
  p_status text
) returns public.schedule_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff record;
  v_entry public.schedule_entries;
  v_old_status text;
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

  if p_status not in ('planned', 'present', 'absent', 'late', 'early_leave', 'leave') then
    raise exception '不正な出欠ステータスです: %', p_status using errcode = '22023';
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

  -- 変更なしならスキップ
  if v_old_status = p_status then
    return v_entry;
  end if;

  update public.schedule_entries
    set attendance_status = p_status,
        attendance_updated_at = now(),
        attendance_updated_by = v_staff.id
    where id = p_entry_id
    returning * into v_entry;

  insert into public.attendance_audit_logs (
    tenant_id, schedule_entry_id, child_id, entry_date,
    changed_by_staff_id, changed_by_name,
    old_status, new_status
  ) values (
    v_entry.tenant_id, v_entry.id, v_entry.child_id, v_entry.date,
    v_staff.id, v_staff.name,
    v_old_status, p_status
  );

  return v_entry;
end;
$$;
