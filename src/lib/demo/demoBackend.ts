/**
 * デモモード用モックバックエンド。
 *
 * DemoProvider の window.fetch モンキーパッチから呼ばれ、/api/* を sessionStorage 上の
 * DemoState に置き換える。対応外の /api/* パスは { ok: true } を 200 で返してフォールバック
 * （通知ポーリング等の未対応 endpoint で壊れないように）。
 *
 * 設計:
 *  - Pure function (Request | string, init) => Response | null
 *  - null 返却時: DemoProvider は本物の fetch にフォールバック
 *  - すべての書き込みは mutateDemoState(fn) 経由で sessionStorage に反映
 *  - tenant_id / role チェックは行わない（デモは常に admin 扱い）
 *
 * 注意:
 *  - 本番経路では絶対に呼ばれない（isDemoClient() が false なら patch しない）
 *  - Claude API / Stripe / Supabase Storage への本物の通信は一切発生させない
 *  - /api/import/pdf は 403 を返す（フロントの D-11 ロックモーダルのフェイルセーフ）
 */

import { mutateDemoState, loadDemoState, genId } from './store';
import type { DemoState } from './seedData';
import { DEMO_STAFF_ID_ME, DEMO_TENANT_ID } from './seedData';
import type {
  AreaLabel,
  ChildRow,
  CommentRow,
  CommentTargetType,
  NotificationRow,
  ScheduleEntryRow,
  ShiftAssignmentRow,
  ShiftAssignmentType,
  ShiftChangeRequestPayload,
  ShiftChangeRequestRow,
  ShiftChangeRequestType,
  ShiftRequestRow,
  StaffRow,
  TenantSettings,
  TransportAssignmentRow,
  TransportColumnKey,
} from '@/types';
import { DEFAULT_TRANSPORT_COLUMN_ORDER } from '@/types';

type HandlerInput = {
  method: string;
  url: URL;
  body: unknown;
};

/* ───────────────────────── レスポンスヘルパ ───────────────────────── */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ok(): Response {
  return json({ ok: true });
}

function bad(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/* ───────────────────────── 入出力パース ───────────────────────── */

function toUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    return new URL(raw, base);
  } catch {
    return null;
  }
}

async function toBody(init?: RequestInit, req?: Request): Promise<unknown> {
  if (init?.body != null) {
    if (typeof init.body === 'string') {
      try {
        return JSON.parse(init.body);
      } catch {
        return null;
      }
    }
    if (init.body instanceof FormData) return init.body;
    return null;
  }
  if (req) {
    try {
      const clone = req.clone();
      const ct = clone.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) return await clone.json();
      if (ct.includes('multipart/form-data')) return await clone.formData();
      const text = await clone.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/* ───────────────────────── 共通ユーティリティ ───────────────────────── */

function sanitizeIdArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v === 'string' && v.length > 0) seen.add(v);
  }
  return Array.from(seen);
}

function sanitizeAreaLabels(input: unknown): AreaLabel[] {
  if (!Array.isArray(input)) return [];
  const out: AreaLabel[] = [];
  for (const v of input) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const emoji = typeof r.emoji === 'string' ? r.emoji.trim() : '';
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!emoji && !name) continue;
    const id = typeof r.id === 'string' && r.id.length > 0 ? r.id : genId('area');
    const item: AreaLabel = { id, emoji, name };
    if (typeof r.time === 'string' && r.time.trim()) item.time = r.time.trim();
    if (typeof r.address === 'string' && r.address.trim()) item.address = r.address.trim();
    out.push(item);
  }
  return out;
}

function filterRange<T extends { date: string }>(rows: T[], from: string | null, to: string | null): T[] {
  return rows.filter((r) => {
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    return true;
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthBoundsOf(ym: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad2(last)}` };
}

function nowIso(): string {
  return new Date().toISOString();
}

/* ───────────────────────── パスパターンマッチ ───────────────────────── */

type PathMatch = { matched: boolean; params: Record<string, string> };

function matchPath(pathname: string, pattern: string): PathMatch {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return { matched: false, params: {} };
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    const pv = pathParts[i];
    if (pp.startsWith('[') && pp.endsWith(']')) {
      params[pp.slice(1, -1)] = decodeURIComponent(pv);
    } else if (pp !== pv) {
      return { matched: false, params: {} };
    }
  }
  return { matched: true, params };
}

/* ───────────────────────── ハンドラ本体 ───────────────────────── */

async function dispatch({ method, url, body }: HandlerInput): Promise<Response> {
  const { pathname } = url;
  const q = url.searchParams;
  const state = loadDemoState();

  /* ----------- /api/me ----------- */
  if (pathname === '/api/me' && method === 'GET') {
    const me = state.staff.find((s) => s.id === DEMO_STAFF_ID_ME) ?? null;
    return json({ staff: me, on_duty_admin: true });
  }

  /* ----------- Phase 61: batch API（page-data 系） -----------
     本番 API と同じ形式で集約データを返す。個別 API と同じ state を合成して返すだけ。 */
  if (pathname === '/api/schedule-page-data' && method === 'GET') {
    const from = q.get('from');
    const to = q.get('to');
    const entries = filterRange(state.schedule_entries, from, to).sort((a, b) => a.date.localeCompare(b.date));
    const children = [...state.children].sort(
      (a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999)
    );
    const tenant = state.tenants[0];
    const entryIds = new Set(entries.map((e) => e.id));
    const confirmedTransportEntryIds = Array.from(
      new Set(
        state.transport_assignments
          .filter((t) => t.is_confirmed && entryIds.has(t.schedule_entry_id))
          .map((t) => t.schedule_entry_id)
      )
    );
    return json({ children, entries, tenant, confirmedTransportEntryIds });
  }

  if (pathname === '/api/shift-page-data' && method === 'GET') {
    const month = q.get('month') ?? '';
    if (!/^\d{4}-\d{2}$/.test(month)) return bad('month=YYYY-MM が必要です');
    const [y, mo] = month.split('-').map(Number);
    const last = new Date(y, mo, 0).getDate();
    const from = `${month}-01`;
    const to = `${month}-${String(last).padStart(2, '0')}`;
    const staff = [...state.staff]
      .filter((s) => s.is_active)
      .sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.name.localeCompare(b.name));
    const entries = filterRange(state.schedule_entries, from, to).sort((a, b) => a.date.localeCompare(b.date));
    const requests = state.shift_requests.filter((r) => r.month === month);
    const assignments = filterRange(state.shift_assignments, from, to).sort((a, b) => a.date.localeCompare(b.date));
    const comments = state.shift_request_comments.filter((c) => c.month === month);
    const me = state.staff.find((s) => s.id === DEMO_STAFF_ID_ME) ?? null;
    return json({
      staff,
      entries,
      requests,
      assignments,
      comments,
      me: me ? { role: me.role, id: me.id, tenant_id: me.tenant_id } : null,
    });
  }

  if (pathname === '/api/settings-children-data' && method === 'GET') {
    const children = [...state.children].sort(
      (a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999)
    );
    const tenant = state.tenants[0];
    const staff = [...state.staff]
      .filter((s) => s.is_active)
      .sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.name.localeCompare(b.name));
    return json({ children, tenant, staff });
  }

  if (pathname === '/api/settings-staff-data' && method === 'GET') {
    const includeRetired = q.get('include_retired') === '1';
    const staff = [...state.staff]
      .filter((s) => includeRetired || s.is_active)
      .sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.name.localeCompare(b.name));
    const tenant = state.tenants[0];
    return json({ staff, tenant });
  }

  /* ----------- /api/tenant ----------- */
  if (pathname === '/api/tenant' && method === 'GET') {
    return json({ tenant: state.tenants[0] });
  }
  if (pathname === '/api/tenant' && method === 'PATCH') {
    const b = (body ?? {}) as { name?: string; settings?: TenantSettings };
    mutateDemoState((s) => {
      const t = s.tenants[0];
      if (!t) return;
      if (typeof b.name === 'string') t.name = b.name;
      if (b.settings && typeof b.settings === 'object') {
        const merged: TenantSettings = { ...t.settings, ...b.settings };
        if (b.settings.pickup_areas !== undefined) merged.pickup_areas = sanitizeAreaLabels(b.settings.pickup_areas);
        if (b.settings.dropoff_areas !== undefined) merged.dropoff_areas = sanitizeAreaLabels(b.settings.dropoff_areas);
        if (b.settings.transport_areas !== undefined) merged.transport_areas = sanitizeAreaLabels(b.settings.transport_areas);
        t.settings = merged;
      }
    });
    return json({ tenant: loadDemoState().tenants[0] });
  }

  /* ----------- /api/tenant/transport-column-order ----------- */
  if (pathname === '/api/tenant/transport-column-order' && method === 'GET') {
    const order = state.tenants[0]?.settings?.transport_column_order ?? DEFAULT_TRANSPORT_COLUMN_ORDER;
    return json({ order });
  }
  if (pathname === '/api/tenant/transport-column-order' && method === 'POST') {
    const raw = Array.isArray((body as { order?: unknown })?.order) ? ((body as { order: unknown[] }).order) : [];
    const known: TransportColumnKey[] = ['pickup_time', 'pickup_location', 'pickup_staff', 'dropoff_time', 'dropoff_location', 'dropoff_staff'];
    const filtered = raw.filter((k): k is TransportColumnKey => typeof k === 'string' && (known as string[]).includes(k));
    const missing = known.filter((k) => !filtered.includes(k));
    const order: TransportColumnKey[] = [...filtered, ...missing];
    mutateDemoState((s) => {
      const t = s.tenants[0];
      if (t) t.settings = { ...t.settings, transport_column_order: order };
    });
    return json({ order });
  }

  /* ----------- /api/staff ----------- */
  if (pathname === '/api/staff' && method === 'GET') {
    const includeRetired = q.get('include_retired') === '1';
    const list = [...state.staff]
      .filter((s) => includeRetired || s.is_active)
      .sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.name.localeCompare(b.name));
    return json({ staff: list });
  }
  if (pathname === '/api/staff' && method === 'POST') {
    const b = (body ?? {}) as Partial<StaffRow>;
    if (!b.name) return bad('氏名は必須です');
    const row: StaffRow = {
      id: genId('staff'),
      tenant_id: DEMO_TENANT_ID,
      user_id: null,
      name: b.name,
      email: b.email ?? null,
      role: b.role ?? 'admin',
      employment_type: b.employment_type ?? 'part_time',
      default_start_time: b.default_start_time ?? null,
      default_end_time: b.default_end_time ?? null,
      transport_areas: sanitizeIdArray(b.transport_areas),
      pickup_transport_areas: sanitizeIdArray(b.pickup_transport_areas ?? b.transport_areas),
      dropoff_transport_areas: sanitizeIdArray(b.dropoff_transport_areas ?? b.transport_areas),
      qualifications: Array.isArray(b.qualifications) ? b.qualifications : [],
      is_qualified: Boolean(b.is_qualified),
      is_driver: Boolean(b.is_driver),
      is_attendant: Boolean(b.is_attendant),
      display_order: typeof b.display_order === 'number' ? b.display_order : state.staff.length + 1,
      is_active: true,
      retired_at: null,
      display_name: typeof b.display_name === 'string' && b.display_name.trim() ? b.display_name.trim() : null,
      created_at: nowIso(),
    };
    mutateDemoState((s) => {
      s.staff.push(row);
    });
    return json({ staff: row });
  }
  {
    const m = matchPath(pathname, '/api/staff/[id]');
    if (m.matched && (method === 'PATCH' || method === 'DELETE')) {
      const id = m.params.id;
      if (method === 'DELETE') {
        mutateDemoState((s) => {
          const t = s.staff.find((x) => x.id === id);
          if (t) {
            t.is_active = false;
            t.retired_at = nowIso();
          }
        });
        return json({ ok: true, soft_deleted: true });
      }
      const b = (body ?? {}) as Partial<StaffRow>;
      mutateDemoState((s) => {
        const t = s.staff.find((x) => x.id === id);
        if (!t) return;
        const allowed = ['name', 'email', 'role', 'employment_type', 'default_start_time', 'default_end_time', 'qualifications', 'is_qualified', 'is_driver', 'is_attendant', 'is_active', 'display_name'] as const;
        for (const k of allowed) {
          if (k in b) (t as unknown as Record<string, unknown>)[k] = (b as Record<string, unknown>)[k];
        }
        if ('transport_areas' in b) t.transport_areas = sanitizeIdArray(b.transport_areas);
        if ('pickup_transport_areas' in b) t.pickup_transport_areas = sanitizeIdArray(b.pickup_transport_areas);
        if ('dropoff_transport_areas' in b) t.dropoff_transport_areas = sanitizeIdArray(b.dropoff_transport_areas);
        if (typeof t.display_name === 'string') {
          const trimmed = t.display_name.trim();
          t.display_name = trimmed ? trimmed : null;
        }
        if ('is_active' in b) {
          t.retired_at = t.is_active === false ? nowIso() : null;
        }
      });
      const updated = loadDemoState().staff.find((x) => x.id === id);
      return json({ staff: updated });
    }
  }
  if (pathname === '/api/staff/invite' && method === 'POST') {
    /* デモでは招待メール送信は行わない。UI で isDemoClient() 分岐して呼ばれない想定。
       防御的に ok を返して画面遷移は保つが、staff 行は追加しない（副作用最小化）。 */
    return json({ ok: true, demo_skipped: true });
  }
  {
    const m = matchPath(pathname, '/api/staff/[id]/resend-invite');
    if (m.matched && method === 'POST') return json({ ok: true, demo_skipped: true });
  }
  {
    const m = matchPath(pathname, '/api/staff/[id]/reset-password');
    if (m.matched && method === 'POST') return json({ ok: true, demo_skipped: true });
  }
  if (pathname === '/api/staff/reorder' && method === 'POST') {
    const b = (body ?? {}) as { orders?: Array<{ id: string; display_order: number }> };
    const orders = Array.isArray(b.orders) ? b.orders : [];
    mutateDemoState((s) => {
      for (const o of orders) {
        const t = s.staff.find((x) => x.id === o.id);
        if (t && typeof o.display_order === 'number') t.display_order = o.display_order;
      }
    });
    return json({ ok: true, updated: orders.length });
  }

  /* ----------- /api/children ----------- */
  if (pathname === '/api/children' && method === 'GET') {
    const list = [...state.children].sort(
      (a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999) || a.created_at.localeCompare(b.created_at),
    );
    return json({ children: list });
  }
  if (pathname === '/api/children' && method === 'POST') {
    const b = (body ?? {}) as Partial<ChildRow>;
    if (!b.name || !b.grade_type) return bad('氏名と学年は必須です');
    const row: ChildRow = {
      id: genId('child'),
      tenant_id: DEMO_TENANT_ID,
      name: b.name,
      grade_type: b.grade_type,
      is_active: b.is_active ?? true,
      parent_contact: b.parent_contact ?? null,
      display_order: typeof b.display_order === 'number' ? b.display_order : state.children.length + 1,
      home_address: b.home_address ?? null,
      pickup_area_labels: sanitizeIdArray(b.pickup_area_labels),
      dropoff_area_labels: sanitizeIdArray(b.dropoff_area_labels),
      custom_pickup_areas: sanitizeAreaLabels(b.custom_pickup_areas),
      custom_dropoff_areas: sanitizeAreaLabels(b.custom_dropoff_areas),
      created_at: nowIso(),
    };
    mutateDemoState((s) => {
      s.children.push(row);
    });
    return json({ child: row });
  }
  {
    const m = matchPath(pathname, '/api/children/[id]');
    if (m.matched && (method === 'PATCH' || method === 'DELETE')) {
      const id = m.params.id;
      if (method === 'DELETE') {
        mutateDemoState((s) => {
          s.children = s.children.filter((c) => c.id !== id);
        });
        return json({ ok: true });
      }
      const b = (body ?? {}) as Partial<ChildRow>;
      mutateDemoState((s) => {
        const c = s.children.find((x) => x.id === id);
        if (!c) return;
        const allowed = ['name', 'grade_type', 'is_active', 'parent_contact', 'home_address'] as const;
        for (const k of allowed) {
          if (k in b) (c as unknown as Record<string, unknown>)[k] = (b as Record<string, unknown>)[k];
        }
        if ('pickup_area_labels' in b) c.pickup_area_labels = sanitizeIdArray(b.pickup_area_labels);
        if ('dropoff_area_labels' in b) c.dropoff_area_labels = sanitizeIdArray(b.dropoff_area_labels);
        if ('custom_pickup_areas' in b) c.custom_pickup_areas = sanitizeAreaLabels(b.custom_pickup_areas);
        if ('custom_dropoff_areas' in b) c.custom_dropoff_areas = sanitizeAreaLabels(b.custom_dropoff_areas);
      });
      return json({ child: loadDemoState().children.find((x) => x.id === id) });
    }
  }
  if (pathname === '/api/children/reorder' && method === 'POST') {
    const b = (body ?? {}) as { orders?: Array<{ id: string; display_order: number }> };
    const orders = Array.isArray(b.orders) ? b.orders : [];
    mutateDemoState((s) => {
      for (const o of orders) {
        const c = s.children.find((x) => x.id === o.id);
        if (c && typeof o.display_order === 'number') c.display_order = o.display_order;
      }
    });
    return json({ ok: true, updated: orders.length });
  }
  {
    const m = matchPath(pathname, '/api/children/[id]/area-eligibility');
    if (m.matched && method === 'GET') {
      const id = m.params.id;
      return json({ items: state.child_area_eligible_staff.filter((r) => r.child_id === id) });
    }
    if (m.matched && method === 'PUT') {
      const childId = m.params.id;
      const b = (body ?? {}) as { items?: Array<{ area_id: string; staff_id: string; direction: 'pickup' | 'dropoff' }> };
      const items = Array.isArray(b.items) ? b.items : [];
      mutateDemoState((s) => {
        s.child_area_eligible_staff = s.child_area_eligible_staff.filter((r) => r.child_id !== childId);
        for (const it of items) {
          if (!it.area_id || !it.staff_id || (it.direction !== 'pickup' && it.direction !== 'dropoff')) continue;
          s.child_area_eligible_staff.push({
            id: genId('caes'),
            tenant_id: DEMO_TENANT_ID,
            child_id: childId,
            area_id: it.area_id,
            staff_id: it.staff_id,
            direction: it.direction,
            created_at: nowIso(),
          });
        }
      });
      return json({ ok: true });
    }
  }

  /* ----------- /api/child-area-eligibility ----------- */
  if (pathname === '/api/child-area-eligibility' && method === 'GET') {
    return json({ items: state.child_area_eligible_staff });
  }

  /* ----------- /api/schedule-entries ----------- */
  if (pathname === '/api/schedule-entries' && method === 'GET') {
    const from = q.get('from');
    const to = q.get('to');
    const entries = filterRange(state.schedule_entries, from, to).sort((a, b) => a.date.localeCompare(b.date));
    return json({ entries });
  }
  if (pathname === '/api/schedule-entries' && method === 'POST') {
    const b = (body ?? {}) as { entries?: Array<Partial<ScheduleEntryRow>>; replaceRange?: { from?: string; to?: string } };
    const entries = Array.isArray(b.entries) ? b.entries : [];
    if (entries.length === 0) return bad('entries が空です');
    const rr = b.replaceRange;
    const result: ScheduleEntryRow[] = [];
    mutateDemoState((s) => {
      if (rr?.from && rr?.to) {
        s.schedule_entries = s.schedule_entries.filter((e) => {
          if (e.date < rr.from! || e.date > rr.to!) return true;
          return !(e.attendance_status === null || e.attendance_status === 'planned');
        });
      }
      for (const e of entries) {
        const child_id = String(e.child_id ?? '');
        const date = String(e.date ?? '');
        if (!child_id || !date) continue;
        const existing = s.schedule_entries.find((x) => x.tenant_id === DEMO_TENANT_ID && x.child_id === child_id && x.date === date);
        const row: ScheduleEntryRow = {
          id: existing?.id ?? genId('entry'),
          tenant_id: DEMO_TENANT_ID,
          child_id,
          date,
          pickup_time: (e.pickup_time as string | null) ?? null,
          dropoff_time: (e.dropoff_time as string | null) ?? null,
          pickup_method: e.pickup_method === 'self' ? 'self' : 'pickup',
          dropoff_method: e.dropoff_method === 'self' ? 'self' : 'dropoff',
          pickup_mark: typeof e.pickup_mark === 'string' ? e.pickup_mark : null,
          dropoff_mark: typeof e.dropoff_mark === 'string' ? e.dropoff_mark : null,
          is_confirmed: Boolean(e.is_confirmed ?? existing?.is_confirmed ?? false),
          attendance_status: existing?.attendance_status ?? 'planned',
          attendance_updated_at: existing?.attendance_updated_at ?? null,
          attendance_updated_by: existing?.attendance_updated_by ?? null,
          waitlist_order: existing?.waitlist_order ?? null,
          created_at: existing?.created_at ?? nowIso(),
        };
        if (existing) {
          Object.assign(existing, row);
          result.push(existing);
        } else {
          s.schedule_entries.push(row);
          result.push(row);
        }
      }
    });
    return json({ entries: result });
  }
  if (pathname === '/api/schedule-entries' && method === 'DELETE') {
    const id = q.get('id');
    if (!id) return bad('id が必要です');
    mutateDemoState((s) => {
      s.schedule_entries = s.schedule_entries.filter((e) => e.id !== id);
      s.transport_assignments = s.transport_assignments.filter((t) => t.schedule_entry_id !== id);
    });
    return json({ ok: true });
  }
  {
    const m = matchPath(pathname, '/api/schedule-entries/[id]/attendance');
    if (m.matched && method === 'PATCH') {
      const id = m.params.id;
      const b = (body ?? {}) as { status?: string; waitlist_order?: number | null };
      const validStatuses = ['planned', 'present', 'absent', 'late', 'early_leave', 'leave', 'waitlist'];
      if (!b.status || !validStatuses.includes(b.status)) return bad('不正な出欠ステータスです');
      /* Phase 64: waitlist_order の検証。waitlist 以外では強制 NULL。 */
      let nextOrder: number | null = null;
      if (b.status === 'waitlist' && b.waitlist_order != null) {
        const n = Number(b.waitlist_order);
        if (!Number.isInteger(n) || n < 1 || n > 10) {
          return bad('キャンセル待ちの順番は 1〜10 で指定してください');
        }
        nextOrder = n;
      }
      let updated: ScheduleEntryRow | undefined;
      mutateDemoState((s) => {
        const e = s.schedule_entries.find((x) => x.id === id);
        if (!e) return;
        const old = e.attendance_status;
        e.attendance_status = b.status as ScheduleEntryRow['attendance_status'];
        e.waitlist_order = nextOrder;
        e.attendance_updated_at = nowIso();
        e.attendance_updated_by = DEMO_STAFF_ID_ME;
        /* Phase 64: status 変更時のみ履歴を残す（order だけの変更では log を膨らませない）。 */
        if (old !== e.attendance_status) {
          s.attendance_audit_logs.push({
            id: genId('aal'),
            tenant_id: DEMO_TENANT_ID,
            schedule_entry_id: id,
            entry_date: e.date,
            child_id: e.child_id,
            old_status: old,
            new_status: e.attendance_status,
            changed_by_staff_id: DEMO_STAFF_ID_ME,
            changed_by_name: 'デモ太郎',
            changed_at: nowIso(),
          });
        }
        updated = e;
      });
      if (!updated) return json({ error: 'エントリが見つかりません' }, 404);
      return json({ entry: updated });
    }
  }

  /* ----------- /api/attendance-logs ----------- */
  if (pathname === '/api/attendance-logs' && method === 'GET') {
    const entryId = q.get('entry_id');
    const from = q.get('from');
    const to = q.get('to');
    let logs = [...state.attendance_audit_logs];
    if (entryId) logs = logs.filter((l) => l.schedule_entry_id === entryId);
    if (from) logs = logs.filter((l) => l.entry_date >= from);
    if (to) logs = logs.filter((l) => l.entry_date <= to);
    logs.sort((a, b) => b.changed_at.localeCompare(a.changed_at));
    return json({ logs: logs.slice(0, 500) });
  }

  /* ----------- /api/shift-assignments ----------- */
  if (pathname === '/api/shift-assignments' && method === 'GET') {
    const from = q.get('from');
    const to = q.get('to');
    const assignments = filterRange(state.shift_assignments, from, to).sort((a, b) => a.date.localeCompare(b.date));
    return json({ assignments });
  }
  if (pathname === '/api/shift-assignments' && method === 'POST') {
    /* Phase 65: replaceForDay モード。サーバ側で segment_order を 0..N に再採番。
       (staff_id, date) の既存全セグメントを削除してから segments を INSERT する。 */
    const b0 = (body ?? {}) as {
      mode?: string;
      staff_id?: string;
      date?: string;
      segments?: Array<Partial<ShiftAssignmentRow>>;
      is_confirmed?: boolean;
      assignments?: Array<Partial<ShiftAssignmentRow>>;
    };
    if (b0.mode === 'replaceForDay') {
      const staff_id = String(b0.staff_id ?? '');
      const date = String(b0.date ?? '');
      const segs = Array.isArray(b0.segments) ? b0.segments : [];
      const isConfirmed = Boolean(b0.is_confirmed ?? false);
      if (!staff_id || !date) return bad('staff_id と date は必須です');
      const inserted: ShiftAssignmentRow[] = [];
      mutateDemoState((s) => {
        /* 既存全セグメントを削除 */
        s.shift_assignments = s.shift_assignments.filter(
          (x) => !(x.tenant_id === DEMO_TENANT_ID && x.staff_id === staff_id && x.date === date),
        );
        /* segment_order=0..N で INSERT */
        segs.forEach((seg, idx) => {
          const row: ShiftAssignmentRow = {
            id: genId('shift'),
            tenant_id: DEMO_TENANT_ID,
            staff_id,
            date,
            start_time: (seg.start_time as string | null) ?? null,
            end_time: (seg.end_time as string | null) ?? null,
            assignment_type: (seg.assignment_type as ShiftAssignmentType) ?? 'normal',
            is_confirmed: isConfirmed,
            segment_order: idx,
            note: typeof seg.note === 'string' && seg.note.trim() ? seg.note.trim().slice(0, 40) : null,
            created_at: nowIso(),
          };
          s.shift_assignments.push(row);
          inserted.push(row);
        });
      });
      return json({ assignments: inserted });
    }

    const b = (body ?? {}) as { assignments?: Array<Partial<ShiftAssignmentRow>> };
    const assignments = Array.isArray(b.assignments) ? b.assignments : [];
    if (assignments.length === 0) return bad('assignments が空です');
    const result: ShiftAssignmentRow[] = [];
    mutateDemoState((s) => {
      for (const a of assignments) {
        const staff_id = String(a.staff_id ?? '');
        const date = String(a.date ?? '');
        const segment_order = Number.isFinite(a.segment_order as number) ? Number(a.segment_order) : 0;
        if (!staff_id || !date) continue;
        const existing = s.shift_assignments.find(
          (x) => x.tenant_id === DEMO_TENANT_ID && x.staff_id === staff_id && x.date === date && (x.segment_order ?? 0) === segment_order,
        );
        const row: ShiftAssignmentRow = {
          id: existing?.id ?? genId('shift'),
          tenant_id: DEMO_TENANT_ID,
          staff_id,
          date,
          start_time: (a.start_time as string | null) ?? null,
          end_time: (a.end_time as string | null) ?? null,
          assignment_type: (a.assignment_type as ShiftAssignmentType) ?? 'off',
          is_confirmed: Boolean(a.is_confirmed ?? false),
          segment_order,
          note: null,
          created_at: existing?.created_at ?? nowIso(),
        };
        if (existing) {
          Object.assign(existing, row);
          result.push(existing);
        } else {
          s.shift_assignments.push(row);
          result.push(row);
        }
      }
    });
    return json({ assignments: result });
  }
  if (pathname === '/api/shift-assignments/confirm' && method === 'POST') {
    const b = (body ?? {}) as { year?: number; month?: number; confirmed?: boolean };
    const year = Number(b.year);
    const month = Number(b.month);
    if (!year || !month) return bad('year, month は必須です');
    const from = `${year}-${pad2(month)}-01`;
    const last = new Date(year, month, 0).getDate();
    const to = `${year}-${pad2(month)}-${pad2(last)}`;
    const confirmed = typeof b.confirmed === 'boolean' ? b.confirmed : true;
    mutateDemoState((s) => {
      for (const a of s.shift_assignments) {
        if (a.date >= from && a.date <= to) a.is_confirmed = confirmed;
      }
    });
    return json({ ok: true, confirmed });
  }

  /* ----------- /api/shift/generate （簡易） ----------- */
  if (pathname === '/api/shift/generate' && method === 'POST') {
    const b = (body ?? {}) as { year?: number; month?: number };
    const year = Number(b.year);
    const month = Number(b.month);
    if (!year || !month) return bad('year, month は必須です');
    const last = new Date(year, month, 0).getDate();
    /* 休み希望の staff_id を除外材料として取得 */
    const monthStr = `${year}-${pad2(month)}`;
    const leaveMap = new Map<string, Set<string>>(); // staff_id -> set(date)
    for (const r of state.shift_requests) {
      if (r.month !== monthStr) continue;
      const key = r.staff_id;
      const set = leaveMap.get(key) ?? new Set<string>();
      for (const d of r.dates ?? []) set.add(d);
      leaveMap.set(key, set);
    }
    const assignments: ShiftAssignmentRow[] = [];
    for (let day = 1; day <= last; day++) {
      const d = new Date(year, month - 1, day);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue; // 平日のみ
      const dateStr = ymd(d);
      for (const staff of state.staff) {
        if (!staff.is_active) continue;
        const isLeave = leaveMap.get(staff.id)?.has(dateStr) ?? false;
        assignments.push({
          id: genId('shift'),
          tenant_id: DEMO_TENANT_ID,
          staff_id: staff.id,
          date: dateStr,
          start_time: isLeave ? null : staff.default_start_time ?? '09:30',
          end_time: isLeave ? null : staff.default_end_time ?? '18:30',
          assignment_type: isLeave ? 'paid_leave' : 'normal',
          is_confirmed: false,
          segment_order: 0,
          note: null,
          created_at: nowIso(),
        });
      }
    }
    return json({
      assignments,
      warnings: [],
      summary: { totalDays: last, totalAssignments: assignments.length, warningCount: 0 },
    });
  }

  /* ----------- /api/shift-requests ----------- */
  if (pathname === '/api/shift-requests' && method === 'GET') {
    const month = q.get('month');
    let reqs = [...state.shift_requests];
    if (month) reqs = reqs.filter((r) => r.month === month);
    reqs.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
    return json({ requests: reqs });
  }
  if (pathname === '/api/shift-requests' && method === 'POST') {
    const b = (body ?? {}) as Partial<ShiftRequestRow> & { staff_id?: string };
    if (!b.month || !b.request_type || !Array.isArray(b.dates)) return bad('month, request_type, dates は必須です');
    const staff_id = b.staff_id ?? DEMO_STAFF_ID_ME;
    let row: ShiftRequestRow | undefined;
    mutateDemoState((s) => {
      const existing = s.shift_requests.find(
        (r) => r.tenant_id === DEMO_TENANT_ID && r.staff_id === staff_id && r.month === b.month && r.request_type === b.request_type,
      );
      const next: ShiftRequestRow = {
        id: existing?.id ?? genId('req'),
        tenant_id: DEMO_TENANT_ID,
        staff_id,
        month: b.month!,
        request_type: b.request_type!,
        dates: b.dates!,
        notes: b.notes ?? null,
        submitted_at: nowIso(),
        submitted_by_staff_id: DEMO_STAFF_ID_ME,
      };
      if (existing) {
        Object.assign(existing, next);
        row = existing;
      } else {
        s.shift_requests.push(next);
        row = next;
      }
    });
    return json({ request: row });
  }

  /* ----------- /api/shift-request-comments ----------- */
  if (pathname === '/api/shift-request-comments' && method === 'GET') {
    const month = q.get('month');
    let rows = [...state.shift_request_comments];
    if (month) rows = rows.filter((r) => r.month === month);
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return json({ comments: rows });
  }
  if (pathname === '/api/shift-request-comments' && method === 'POST') {
    const b = (body ?? {}) as { month?: string; date?: string; staff_id?: string; comment_text?: string };
    if (!b.month || !b.date) return bad('month と date は必須です');
    const staff_id = b.staff_id ?? DEMO_STAFF_ID_ME;
    const text = typeof b.comment_text === 'string' ? b.comment_text.trim() : '';
    if (text === '') {
      mutateDemoState((s) => {
        s.shift_request_comments = s.shift_request_comments.filter((c) => !(c.tenant_id === DEMO_TENANT_ID && c.staff_id === staff_id && c.date === b.date));
      });
      return json({ ok: true, deleted: true });
    }
    let row: DemoState['shift_request_comments'][number] | undefined;
    mutateDemoState((s) => {
      const existing = s.shift_request_comments.find((c) => c.tenant_id === DEMO_TENANT_ID && c.staff_id === staff_id && c.date === b.date);
      const next = {
        id: existing?.id ?? genId('src'),
        tenant_id: DEMO_TENANT_ID,
        staff_id,
        month: b.month!,
        date: b.date!,
        comment_text: text,
        updated_at: nowIso(),
      };
      if (existing) {
        Object.assign(existing, next);
        row = existing;
      } else {
        s.shift_request_comments.push(next);
        row = next;
      }
    });
    return json({ comment: row });
  }

  /* ----------- /api/shift-change-requests ----------- */
  if (pathname === '/api/shift-change-requests' && method === 'GET') {
    const status = q.get('status');
    const from = q.get('from');
    const to = q.get('to');
    const staffId = q.get('staff_id');
    let rows = [...state.shift_change_requests];
    if (status) rows = rows.filter((r) => r.status === status);
    if (from) rows = rows.filter((r) => r.target_date >= from);
    if (to) rows = rows.filter((r) => r.target_date <= to);
    if (staffId) rows = rows.filter((r) => r.staff_id === staffId);
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return json({ requests: rows.slice(0, 500) });
  }
  if (pathname === '/api/shift-change-requests' && method === 'POST') {
    const b = (body ?? {}) as { target_date?: string; change_type?: ShiftChangeRequestType; requested_payload?: ShiftChangeRequestPayload; staff_id?: string; reason?: string };
    if (!b.target_date || !b.change_type) return bad('target_date / change_type は必須です');
    const staff_id = b.staff_id ?? DEMO_STAFF_ID_ME;
    const existingShift = state.shift_assignments.find((a) => a.staff_id === staff_id && a.date === b.target_date);
    const row: ShiftChangeRequestRow = {
      id: genId('scr'),
      tenant_id: DEMO_TENANT_ID,
      staff_id,
      target_date: b.target_date,
      change_type: b.change_type,
      requested_payload: b.requested_payload ?? ({} as ShiftChangeRequestPayload),
      snapshot_before: existingShift ?? null,
      reason: b.reason ?? null,
      status: 'pending',
      reviewed_by_staff_id: null,
      reviewed_by_name: null,
      reviewed_at: null,
      admin_note: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    mutateDemoState((s) => {
      s.shift_change_requests.push(row);
    });
    return json({ request: row });
  }
  {
    const m = matchPath(pathname, '/api/shift-change-requests/[id]');
    if (m.matched && method === 'PATCH') {
      const id = m.params.id;
      const b = (body ?? {}) as { action?: 'approve' | 'reject' | 'cancel'; admin_note?: string };
      if (!b.action || !['approve', 'reject', 'cancel'].includes(b.action)) return bad('action が不正です');
      let updated: ShiftChangeRequestRow | undefined;
      mutateDemoState((s) => {
        const r = s.shift_change_requests.find((x) => x.id === id);
        if (!r) return;
        if (r.status !== 'pending') return;
        r.status = b.action === 'approve' ? 'approved' : b.action === 'reject' ? 'rejected' : 'cancelled';
        if (b.action !== 'cancel') {
          r.reviewed_by_staff_id = DEMO_STAFF_ID_ME;
          r.reviewed_by_name = 'デモ太郎';
          r.reviewed_at = nowIso();
          r.admin_note = b.admin_note ?? null;
        }
        if (b.action === 'approve') {
          /* shift_assignments を payload で上書き */
          const payload = r.requested_payload;
          const existing = s.shift_assignments.find((a) => a.staff_id === r.staff_id && a.date === r.target_date);
          const patch: Partial<ShiftAssignmentRow> = { is_confirmed: true };
          if (r.change_type === 'time') {
            const p = payload as { start_time: string; end_time: string };
            patch.start_time = p.start_time;
            patch.end_time = p.end_time;
            patch.assignment_type = 'normal';
          } else {
            const p = payload as { assignment_type: ShiftAssignmentType; start_time?: string | null; end_time?: string | null };
            patch.assignment_type = p.assignment_type;
            if (p.start_time !== undefined) patch.start_time = p.start_time;
            if (p.end_time !== undefined) patch.end_time = p.end_time;
          }
          if (existing) {
            Object.assign(existing, patch);
          } else {
            s.shift_assignments.push({
              id: genId('shift'),
              tenant_id: DEMO_TENANT_ID,
              staff_id: r.staff_id,
              date: r.target_date,
              start_time: patch.start_time ?? null,
              end_time: patch.end_time ?? null,
              assignment_type: patch.assignment_type ?? 'normal',
              is_confirmed: true,
              segment_order: 0,
              note: null,
              created_at: nowIso(),
            });
          }
        }
        updated = r;
      });
      if (!updated) return json({ error: '申請が見つかりません' }, 404);
      return json({ request: updated });
    }
  }

  /* ----------- /api/transport-assignments ----------- */
  if (pathname === '/api/transport-assignments' && method === 'GET') {
    const from = q.get('from');
    const to = q.get('to');
    /* schedule_entries と JOIN してデモ状態から同等の結果を作る */
    const entryMap = new Map(state.schedule_entries.map((e) => [e.id, e]));
    const rows = state.transport_assignments
      .map((t) => {
        const e = entryMap.get(t.schedule_entry_id);
        if (!e) return null;
        if (from && e.date < from) return null;
        if (to && e.date > to) return null;
        return {
          ...t,
          schedule_entries: {
            date: e.date,
            child_id: e.child_id,
            pickup_time: e.pickup_time,
            dropoff_time: e.dropoff_time,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return json({ assignments: rows });
  }
  if (pathname === '/api/transport-assignments' && method === 'POST') {
    const b = (body ?? {}) as { assignments?: Array<Partial<TransportAssignmentRow>> };
    const list = Array.isArray(b.assignments) ? b.assignments : [];
    if (list.length === 0) return bad('assignments が空です');
    const cleanUuid = (input: unknown): string[] =>
      Array.isArray(input) ? input.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
    const result: TransportAssignmentRow[] = [];
    mutateDemoState((s) => {
      for (const a of list) {
        const schedule_entry_id = String(a.schedule_entry_id ?? '');
        if (!schedule_entry_id) continue;
        const existing = s.transport_assignments.find((t) => t.tenant_id === DEMO_TENANT_ID && t.schedule_entry_id === schedule_entry_id);
        const row: TransportAssignmentRow = {
          id: existing?.id ?? genId('ta'),
          tenant_id: DEMO_TENANT_ID,
          schedule_entry_id,
          pickup_staff_ids: cleanUuid(a.pickup_staff_ids),
          dropoff_staff_ids: cleanUuid(a.dropoff_staff_ids),
          is_unassigned: Boolean(a.is_unassigned ?? false),
          is_confirmed: Boolean(a.is_confirmed ?? false),
          is_locked: Boolean(a.is_locked ?? false),
          created_at: existing?.created_at ?? nowIso(),
        };
        if (existing) {
          Object.assign(existing, row);
          result.push(existing);
        } else {
          s.transport_assignments.push(row);
          result.push(row);
        }
      }
    });
    return json({ assignments: result });
  }

  /* ----------- /api/transport/generate （簡易） ----------- */
  if (pathname === '/api/transport/generate' && method === 'POST') {
    const b = (body ?? {}) as {
      date?: string;
      scheduleEntries?: ScheduleEntryRow[];
      staff?: StaffRow[];
      shiftAssignments?: ShiftAssignmentRow[];
    };
    if (!b.date) return bad('date は必須です');
    const entries = (b.scheduleEntries ?? state.schedule_entries.filter((e) => e.date === b.date)) as ScheduleEntryRow[];
    const staffList = (b.staff ?? state.staff) as StaffRow[];
    const shiftRows = (b.shiftAssignments ?? state.shift_assignments.filter((s) => s.date === b.date)) as ShiftAssignmentRow[];
    const workingStaffIds = new Set(
      shiftRows.filter((s) => s.assignment_type === 'normal').map((s) => s.staff_id),
    );
    const available = staffList.filter((s) => workingStaffIds.has(s.id));
    const assignments: TransportAssignmentRow[] = [];
    let unassignedCount = 0;
    let i = 0;
    for (const e of entries) {
      const pickStaff = available[i % Math.max(available.length, 1)];
      const dropStaff = available[(i + 1) % Math.max(available.length, 1)];
      const pickIds = pickStaff?.is_driver || pickStaff?.is_attendant ? [pickStaff.id] : [];
      const dropIds = dropStaff?.is_driver || dropStaff?.is_attendant ? [dropStaff.id] : [];
      const hasAny = pickIds.length > 0 || dropIds.length > 0;
      if (!hasAny) unassignedCount++;
      assignments.push({
        id: genId('ta'),
        tenant_id: DEMO_TENANT_ID,
        schedule_entry_id: e.id,
        pickup_staff_ids: pickIds,
        dropoff_staff_ids: dropIds,
        is_unassigned: !hasAny,
        is_confirmed: false,
        is_locked: false,
        created_at: nowIso(),
      });
      i++;
    }
    return json({ assignments, unassignedCount });
  }

  /* ----------- /api/transport/child-order ----------- */
  if (pathname === '/api/transport/child-order' && method === 'GET') {
    const rows = [...state.child_display_order_memory].sort(
      (a, b) => a.slot_signature.localeCompare(b.slot_signature) || a.display_order - b.display_order,
    );
    return json({ orders: rows });
  }
  if (pathname === '/api/transport/child-order' && method === 'POST') {
    const b = (body ?? {}) as { signature?: string; orders?: Array<{ child_id?: string; display_order?: number }> };
    if (!b.signature || !Array.isArray(b.orders)) return bad('signature / orders が必要です');
    mutateDemoState((s) => {
      /* upsert by (tenant_id, signature, child_id) */
      for (const o of b.orders!) {
        if (typeof o.child_id !== 'string' || typeof o.display_order !== 'number') continue;
        const existing = s.child_display_order_memory.find(
          (r) => r.tenant_id === DEMO_TENANT_ID && r.slot_signature === b.signature && r.child_id === o.child_id,
        );
        if (existing) {
          existing.display_order = Math.trunc(o.display_order);
          existing.updated_at = nowIso();
        } else {
          s.child_display_order_memory.push({
            id: genId('cdom'),
            tenant_id: DEMO_TENANT_ID,
            slot_signature: b.signature!,
            child_id: o.child_id,
            display_order: Math.trunc(o.display_order),
            updated_at: nowIso(),
          });
        }
      }
    });
    return json({ ok: true, count: b.orders.length });
  }

  /* ----------- /api/comments ----------- */
  if (pathname === '/api/comments' && method === 'GET') {
    const target_type = q.get('target_type') as CommentTargetType | null;
    const target_id = q.get('target_id');
    let rows = [...state.comments];
    if (target_type) rows = rows.filter((c) => c.target_type === target_type);
    if (target_id) rows = rows.filter((c) => c.target_id === target_id);
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    /* 本物は comments(*, staff:author_staff_id(name), comment_images(...)) を返す。
       デモでは staff name は state から解決して付与、画像は空配列にする。 */
    const enriched = rows.map((c) => {
      const author = state.staff.find((s) => s.id === c.author_staff_id);
      return {
        ...c,
        staff: author ? { name: author.name } : null,
        comment_images: [],
      };
    });
    return json({ comments: enriched });
  }
  if (pathname === '/api/comments' && method === 'POST') {
    const b = (body ?? {}) as Partial<CommentRow>;
    if (!b.target_type || !b.target_id || !b.body) return bad('target_type, target_id, body は必須です');
    const row: CommentRow = {
      id: genId('comment'),
      tenant_id: DEMO_TENANT_ID,
      author_staff_id: DEMO_STAFF_ID_ME,
      target_type: b.target_type as CommentTargetType,
      target_id: b.target_id,
      body: b.body,
      status: 'pending',
      approved_by_staff_id: null,
      approved_at: null,
      created_at: nowIso(),
    };
    mutateDemoState((s) => {
      s.comments.push(row);
    });
    return json({ comment: row });
  }
  {
    const m = matchPath(pathname, '/api/comments/[id]/approve');
    if (m.matched && method === 'POST') {
      const id = m.params.id;
      const action = q.get('action') === 'reject' ? 'rejected' : 'approved';
      let updated: CommentRow | undefined;
      mutateDemoState((s) => {
        const c = s.comments.find((x) => x.id === id);
        if (!c) return;
        c.status = action;
        c.approved_by_staff_id = DEMO_STAFF_ID_ME;
        c.approved_at = nowIso();
        updated = c;
      });
      if (!updated) return json({ error: 'コメントが見つかりません' }, 404);
      return json({ comment: updated });
    }
  }

  /* ----------- /api/notifications ----------- */
  if (pathname === '/api/notifications' && method === 'GET') {
    const unreadOnly = q.get('unread') === '1';
    let rows = state.notifications.filter((n) => n.recipient_staff_id === DEMO_STAFF_ID_ME);
    if (unreadOnly) rows = rows.filter((n) => !n.is_read);
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return json({ notifications: rows.slice(0, 50) });
  }
  if (pathname === '/api/notifications' && method === 'POST') {
    const b = (body ?? {}) as { ids?: string[] };
    const ids = Array.isArray(b.ids) ? b.ids : null;
    mutateDemoState((s) => {
      for (const n of s.notifications) {
        if (n.recipient_staff_id !== DEMO_STAFF_ID_ME) continue;
        if (ids && !ids.includes(n.id)) continue;
        n.is_read = true;
      }
    });
    return json({ ok: true });
  }

  /* ----------- /api/status/month ----------- */
  if (pathname === '/api/status/month' && method === 'GET') {
    const month = q.get('month') ?? '';
    const bounds = monthBoundsOf(month);
    if (!bounds) return bad('?month=YYYY-MM が必要です');
    type S = 'empty' | 'incomplete' | 'complete';
    const entries = state.schedule_entries.filter((e) => e.date >= bounds.from && e.date <= bounds.to);
    const entryIds = new Set(entries.map((e) => e.id));
    let transport: S = 'empty';
    if (entryIds.size > 0) {
      const t = state.transport_assignments.filter((r) => entryIds.has(r.schedule_entry_id));
      if (t.length === 0) transport = 'empty';
      else {
        const allConfirmed = t.every((r) => r.is_confirmed);
        const anyUnassigned = t.some((r) => r.is_unassigned);
        transport = allConfirmed && !anyUnassigned ? 'complete' : 'incomplete';
      }
    }
    const sRows = state.shift_assignments.filter((r) => r.date >= bounds.from && r.date <= bounds.to);
    const shift: S = sRows.length === 0 ? 'empty' : sRows.every((r) => r.is_confirmed) ? 'complete' : 'incomplete';
    const schedule: S = entries.length > 0 ? 'complete' : 'empty';
    const activeStaff = state.staff.filter((s) => s.is_active);
    let requestStatus: S = 'empty';
    if (activeStaff.length > 0) {
      const submitted = new Set(state.shift_requests.filter((r) => r.month === month).map((r) => r.staff_id));
      requestStatus = submitted.size >= activeStaff.length ? 'complete' : 'incomplete';
    }
    return json({ month, transport, shift, schedule, request: requestStatus });
  }

  /* ----------- /api/upload（画像アップロード: blob URL を返す） ----------- */
  if (pathname === '/api/upload' && method === 'POST') {
    const fd = body instanceof FormData ? body : null;
    const file = fd?.get('file');
    if (!file || !(file instanceof File)) return bad('file がありません');
    const subpath = String(fd?.get('subpath') ?? 'misc');
    const storage_path = `demo/${subpath}/${Date.now()}-${file.name}`;
    return json({ storage_path });
  }
  if (pathname === '/api/upload/signed-url' && method === 'GET') {
    /* デモでは画像の署名 URL を発行する宛先がないので、空 URL を返す（画像は未表示扱い） */
    return json({ url: '' });
  }

  /* ----------- /api/import/pdf（デモでは常に 403） ----------- */
  if (pathname === '/api/import/pdf' && method === 'POST') {
    return json(
      {
        error: 'デモモードでは PDF 取り込みは利用できません。有料版でご利用ください。',
        demo_locked: true,
      },
      403,
    );
  }

  /* ----------- /api/signup（デモでは無効） ----------- */
  if (pathname === '/api/signup' && method === 'POST') {
    return json({ error: 'デモモードでは新規登録は利用できません' }, 403);
  }

  /* ----------- フォールバック ----------- */
  /* 未対応の /api/*（例: 新規追加 API、通知ポーリング等）は { ok: true } で握りつぶす。
     呼び出し側のエラー処理を壊さないための安全弁。 */
  return ok();
}

/* ───────────────────────── エクスポート ───────────────────────── */

/**
 * DemoProvider から呼ばれるエントリポイント。
 * /api/* にマッチしなければ null を返して本物 fetch に委譲。
 */
export async function handleDemoRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  const url = toUrl(input);
  if (!url) return null;
  /* /api/* のみ処理。Next.js RSC payload (_next/) は対象外 */
  if (!url.pathname.startsWith('/api/')) return null;
  if (url.pathname.startsWith('/api/webhooks/')) return null; // Stripe 等は絶対に触らない

  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const req = input instanceof Request ? input : undefined;
  const body = await toBody(init, req);

  try {
    return await dispatch({ method, url, body });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'demo backend error';
    /* 予期せぬ例外はエラー JSON で返す。console には出さない（本番への影響なし） */
    return json({ error: `デモモード内部エラー: ${message}` }, 500);
  }
}
