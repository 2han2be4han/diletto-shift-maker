-- =============================================================
-- Phase 30: エリアマーク ID ベース移行
--
-- 背景:
--   AreaLabel（テナント設定の pickup_areas / dropoff_areas、児童の custom_*_areas）は
--   `{emoji, name, time?, address?}` を持つだけで、識別キーが「emoji + ' ' + name」の
--   文字列マッチに依存していた。このため:
--     - テナント設定からマークを削除しても、児童の pickup_area_labels に
--       文字列が残り「幽霊マーク」が発生
--     - 同名・同 emoji の重複定義に弱い
--     - 名前変更で参照が壊れる
--
-- 本マイグレーションで:
--   1. AreaLabel に id (uuid 文字列) を付与
--   2. 児童 pickup_area_labels / dropoff_area_labels の文字列を id に置換、
--      マッチしない（幽霊）ものは drop
--   3. schedule_entries.pickup_mark / dropoff_mark の文字列を id に置換、
--      マッチしないものは null
--   4. staff.pickup_transport_areas / dropoff_transport_areas / transport_areas の
--      文字列を id に置換、マッチしないものは drop
--
-- 冪等性: 既に id が付与済み or UUID 形式の値はそのまま保持する。
-- =============================================================

create extension if not exists pgcrypto;

-- ---- ヘルパー関数（マイグレーション末尾で DROP） ----

/* areas に id が無いものへ gen_random_uuid() を付与。NULL や非配列は [] を返す。 */
create or replace function public._area_id_mig_add_ids(areas jsonb) returns jsonb as $$
declare
  result jsonb := '[]'::jsonb;
  area jsonb;
begin
  if areas is null or jsonb_typeof(areas) <> 'array' then
    return '[]'::jsonb;
  end if;
  for area in select * from jsonb_array_elements(areas) loop
    if area ? 'id' and (area->>'id') is not null and (area->>'id') <> '' then
      result := result || jsonb_build_array(area);
    else
      result := result || jsonb_build_array(jsonb_set(area, '{id}', to_jsonb(gen_random_uuid()::text)));
    end if;
  end loop;
  return result;
end;
$$ language plpgsql;

/* areas（id 付与済み）から「emoji+' '+name → id」のマップを構築。
   重複ラベルは「先勝ち」（後の値で上書きしない）。 */
create or replace function public._area_id_mig_label_map(areas jsonb) returns jsonb as $$
declare
  result jsonb := '{}'::jsonb;
  area jsonb;
  label text;
begin
  if areas is null or jsonb_typeof(areas) <> 'array' then
    return '{}'::jsonb;
  end if;
  for area in select * from jsonb_array_elements(areas) loop
    label := coalesce(area->>'emoji','') || ' ' || coalesce(area->>'name','');
    if not (result ? label) then
      result := result || jsonb_build_object(label, area->>'id');
    end if;
  end loop;
  return result;
end;
$$ language plpgsql;

/* "emoji name" 形式の単一文字列を id に変換。
   - 空/null → null
   - 既に UUID 形式 → そのまま返す
   - map に存在 → id を返す
   - map に無い（幽霊）→ null */
create or replace function public._area_id_mig_one(label text, label_map jsonb) returns text as $$
begin
  if label is null or label = '' then return null; end if;
  if label ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return label;
  end if;
  return label_map->>label;
end;
$$ language plpgsql;

/* text[] の各要素を上記ルールで id に変換。null/幽霊は drop、重複も drop。 */
create or replace function public._area_id_mig_array(labels text[], label_map jsonb) returns text[] as $$
declare
  result text[] := '{}';
  label text;
  id text;
begin
  if labels is null then return '{}'; end if;
  foreach label in array labels loop
    id := public._area_id_mig_one(label, label_map);
    if id is not null and not (id = any(result)) then
      result := array_append(result, id);
    end if;
  end loop;
  return result;
end;
$$ language plpgsql;

-- ---- 本処理: 全テナント分を順に変換 ----

do $$
declare
  t record;
  c record;
  s record;
  pickup_areas jsonb;
  dropoff_areas jsonb;
  pickup_map jsonb;
  dropoff_map jsonb;
  union_map jsonb;
  c_pickup_areas jsonb;
  c_dropoff_areas jsonb;
  c_pickup_map jsonb;
  c_dropoff_map jsonb;
begin
  for t in select id, settings from public.tenants loop
    /* 1. テナント pickup_areas / dropoff_areas に id 付与
          transport_areas (legacy) は pickup_areas のミラーとして保存する
          （現行コードもそう書いており、独立した値を持つことは想定外） */
    pickup_areas := public._area_id_mig_add_ids(t.settings->'pickup_areas');
    dropoff_areas := public._area_id_mig_add_ids(t.settings->'dropoff_areas');

    /* pickup_areas が空の場合は legacy transport_areas を救済して継承（id 付与） */
    if jsonb_array_length(pickup_areas) = 0 then
      pickup_areas := public._area_id_mig_add_ids(t.settings->'transport_areas');
    end if;

    pickup_map := public._area_id_mig_label_map(pickup_areas);
    dropoff_map := public._area_id_mig_label_map(dropoff_areas);
    /* 職員 staff.transport_areas (legacy) 用の union map（迎優先） */
    union_map := dropoff_map || pickup_map;

    update public.tenants
    set settings = coalesce(settings, '{}'::jsonb)
                  || jsonb_build_object(
                       'pickup_areas', pickup_areas,
                       'dropoff_areas', dropoff_areas,
                       'transport_areas', pickup_areas
                     )
    where id = t.id;

    /* 2. 児童ごとに custom_areas に id 付与 → labels を id に変換 → schedule_entries の mark を変換 */
    for c in
      select id, custom_pickup_areas, custom_dropoff_areas, pickup_area_labels, dropoff_area_labels
      from public.children where tenant_id = t.id
    loop
      c_pickup_areas := public._area_id_mig_add_ids(c.custom_pickup_areas);
      c_dropoff_areas := public._area_id_mig_add_ids(c.custom_dropoff_areas);
      /* tenant 側を先に積み、後から custom を積む = tenant 優先（同 label の id 衝突は tenant 側 id を採用）
         label_map は「先勝ち」なので tenant_map → custom_map の順で || する */
      c_pickup_map := pickup_map || public._area_id_mig_label_map(c_pickup_areas);
      c_dropoff_map := dropoff_map || public._area_id_mig_label_map(c_dropoff_areas);

      update public.children
      set custom_pickup_areas = c_pickup_areas,
          custom_dropoff_areas = c_dropoff_areas,
          pickup_area_labels = public._area_id_mig_array(c.pickup_area_labels, c_pickup_map),
          dropoff_area_labels = public._area_id_mig_array(c.dropoff_area_labels, c_dropoff_map)
      where id = c.id;

      update public.schedule_entries
      set pickup_mark = public._area_id_mig_one(pickup_mark, c_pickup_map),
          dropoff_mark = public._area_id_mig_one(dropoff_mark, c_dropoff_map)
      where child_id = c.id;
    end loop;

    /* 3. 職員の対応エリアを id に変換 */
    for s in
      select id, pickup_transport_areas, dropoff_transport_areas, transport_areas
      from public.staff where tenant_id = t.id
    loop
      update public.staff
      set pickup_transport_areas = public._area_id_mig_array(s.pickup_transport_areas, pickup_map),
          dropoff_transport_areas = public._area_id_mig_array(s.dropoff_transport_areas, dropoff_map),
          transport_areas = public._area_id_mig_array(s.transport_areas, union_map)
      where id = s.id;
    end loop;
  end loop;
end $$;

-- ---- ヘルパー関数を後始末 ----
drop function if exists public._area_id_mig_array(text[], jsonb);
drop function if exists public._area_id_mig_one(text, jsonb);
drop function if exists public._area_id_mig_label_map(jsonb);
drop function if exists public._area_id_mig_add_ids(jsonb);

comment on column public.children.pickup_area_labels is
  '児童が利用可能なお迎えマーク（AreaLabel.id 配列）。tenant pickup_areas または '
  'children.custom_pickup_areas の id を参照。Phase 30 で emoji+name 文字列から id 配列に移行。';
comment on column public.children.dropoff_area_labels is
  '児童が利用可能なお送りマーク（AreaLabel.id 配列）。tenant dropoff_areas または '
  'children.custom_dropoff_areas の id を参照。Phase 30 で emoji+name 文字列から id 配列に移行。';
comment on column public.schedule_entries.pickup_mark is
  'お迎えマーク。AreaLabel.id（テナント pickup_areas または児童 custom_pickup_areas）。'
  'Phase 30 で emoji+name 文字列から id に移行。';
comment on column public.schedule_entries.dropoff_mark is
  'お送りマーク。AreaLabel.id（テナント dropoff_areas または児童 custom_dropoff_areas）。'
  'Phase 30 で emoji+name 文字列から id に移行。';
