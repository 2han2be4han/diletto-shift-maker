import type {
  AreaLabel,
  ChildRow,
  ScheduleEntryRow,
  ShiftAssignmentRow,
  StaffRow,
  TenantRow,
  TransportAssignmentRow,
  ShiftRequestRow,
  CommentRow,
  NotificationRow,
  ShiftChangeRequestRow,
  ChildAreaEligibleStaffRow,
  AttendanceAuditLogRow,
  ChildDropoffLocationRow,
  ShiftRequestCommentRow,
  ChildDisplayOrderMemoryRow,
} from '@/types';

/**
 * デモモード初期データ。
 * tenant 1 / staff 3 / 児童 5 / エリア（迎・送）/ 当月の利用予定を seed する。
 *
 * 全ての id は固定文字列（'demo-...'）。本番テナントと衝突しても、
 * デモは sessionStorage 内で完結するので影響なし。
 */

export const DEMO_TENANT_ID = 'demo-tenant-0001';
export const DEMO_STAFF_ID_ME = 'demo-staff-me'; // 「自分」= admin
export const DEMO_STAFF_ID_2 = 'demo-staff-002';
export const DEMO_STAFF_ID_3 = 'demo-staff-003';

const PICKUP_AREAS: AreaLabel[] = [
  { id: 'demo-area-pickup-1', emoji: '🏫', name: '○○小学校', time: '14:30', address: '東京都渋谷区xxx 1-1-1' },
  { id: 'demo-area-pickup-2', emoji: '🌳', name: '△△公園前', time: '15:00', address: '東京都渋谷区xxx 2-2-2' },
  { id: 'demo-area-pickup-3', emoji: '🏬', name: '駅前ロータリー', time: '15:30', address: '東京都渋谷区xxx 3-3-3' },
];

const DROPOFF_AREAS: AreaLabel[] = [
  { id: 'demo-area-dropoff-1', emoji: '🏠', name: '北エリア', time: '17:00', address: '東京都渋谷区north' },
  { id: 'demo-area-dropoff-2', emoji: '🌸', name: '南エリア', time: '17:30', address: '東京都渋谷区south' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nextMonthFirstDay(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * デモストアの正規化済みスナップショット。
 * 各テーブル相当を配列で持ち、demoBackend は ID 検索 / フィルタを直接行う。
 */
export type DemoState = {
  tenants: TenantRow[];
  staff: StaffRow[];
  children: ChildRow[];
  schedule_entries: ScheduleEntryRow[];
  shift_assignments: ShiftAssignmentRow[];
  shift_requests: ShiftRequestRow[];
  shift_request_comments: ShiftRequestCommentRow[];
  shift_change_requests: ShiftChangeRequestRow[];
  transport_assignments: TransportAssignmentRow[];
  comments: CommentRow[];
  notifications: NotificationRow[];
  child_area_eligible_staff: ChildAreaEligibleStaffRow[];
  attendance_audit_logs: AttendanceAuditLogRow[];
  child_dropoff_locations: ChildDropoffLocationRow[];
  child_display_order_memory: ChildDisplayOrderMemoryRow[];
  /* メタ情報 */
  meta: {
    seed_version: number;
    created_at: string;
  };
};

export const DEMO_SEED_VERSION = 1;

export function buildSeedState(): DemoState {
  const nowIso = new Date().toISOString();
  const tenants: TenantRow[] = [
    {
      id: DEMO_TENANT_ID,
      name: 'デモ事業所（体験用）',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      status: 'active',
      settings: {
        pickup_areas: PICKUP_AREAS,
        dropoff_areas: DROPOFF_AREAS,
        transport_areas: PICKUP_AREAS,
        qualification_types: [
          { name: '保育士', countable: true },
          { name: '児童指導員', countable: true },
        ],
        min_qualified_staff: 2,
        request_deadline_day: 20,
        transport_min_end_time: '16:31',
        transport_pickup_cooldown_minutes: 45,
      },
      created_at: nowIso,
    },
  ];

  const staff: StaffRow[] = [
    {
      id: DEMO_STAFF_ID_ME,
      tenant_id: DEMO_TENANT_ID,
      user_id: null,
      name: 'デモ太郎',
      email: 'demo@example.com',
      role: 'admin',
      employment_type: 'full_time',
      default_start_time: '09:30',
      default_end_time: '18:30',
      transport_areas: ['demo-area-pickup-1', 'demo-area-pickup-2', 'demo-area-dropoff-1'],
      pickup_transport_areas: ['demo-area-pickup-1', 'demo-area-pickup-2'],
      dropoff_transport_areas: ['demo-area-dropoff-1', 'demo-area-dropoff-2'],
      qualifications: ['保育士', '児童指導員'],
      is_qualified: true,
      is_driver: true,
      is_attendant: false,
      display_order: 1,
      is_active: true,
      retired_at: null,
      display_name: '太郎',
      created_at: nowIso,
    },
    {
      id: DEMO_STAFF_ID_2,
      tenant_id: DEMO_TENANT_ID,
      user_id: null,
      name: '山田 花子',
      email: 'hanako@example.com',
      role: 'editor',
      employment_type: 'part_time',
      default_start_time: '10:00',
      default_end_time: '18:00',
      transport_areas: ['demo-area-pickup-2', 'demo-area-dropoff-2'],
      pickup_transport_areas: ['demo-area-pickup-2', 'demo-area-pickup-3'],
      dropoff_transport_areas: ['demo-area-dropoff-2'],
      qualifications: ['児童指導員'],
      is_qualified: true,
      is_driver: false,
      is_attendant: true,
      display_order: 2,
      is_active: true,
      retired_at: null,
      display_name: '花子',
      created_at: nowIso,
    },
    {
      id: DEMO_STAFF_ID_3,
      tenant_id: DEMO_TENANT_ID,
      user_id: null,
      name: '鈴木 一郎',
      email: 'ichiro@example.com',
      role: 'viewer',
      employment_type: 'part_time',
      default_start_time: '13:00',
      default_end_time: '19:00',
      transport_areas: ['demo-area-pickup-3', 'demo-area-dropoff-1'],
      pickup_transport_areas: ['demo-area-pickup-1', 'demo-area-pickup-3'],
      dropoff_transport_areas: ['demo-area-dropoff-1'],
      qualifications: [],
      is_qualified: false,
      is_driver: true,
      is_attendant: false,
      display_order: 3,
      is_active: true,
      retired_at: null,
      display_name: '一郎',
      created_at: nowIso,
    },
  ];

  const children: ChildRow[] = [
    {
      id: 'demo-child-001',
      tenant_id: DEMO_TENANT_ID,
      name: '田中 ゆうき',
      grade_type: 'elementary_2',
      is_active: true,
      parent_contact: '090-1234-5678',
      display_order: 1,
      home_address: '東京都渋谷区xxx 1-2-3',
      pickup_area_labels: ['demo-area-pickup-1'],
      dropoff_area_labels: ['demo-area-dropoff-1'],
      custom_pickup_areas: [],
      custom_dropoff_areas: [],
      created_at: nowIso,
    },
    {
      id: 'demo-child-002',
      tenant_id: DEMO_TENANT_ID,
      name: '佐藤 みき',
      grade_type: 'elementary_4',
      is_active: true,
      parent_contact: '090-2345-6789',
      display_order: 2,
      home_address: '東京都渋谷区xxx 2-3-4',
      pickup_area_labels: ['demo-area-pickup-1', 'demo-area-pickup-2'],
      dropoff_area_labels: ['demo-area-dropoff-2'],
      custom_pickup_areas: [],
      custom_dropoff_areas: [],
      created_at: nowIso,
    },
    {
      id: 'demo-child-003',
      tenant_id: DEMO_TENANT_ID,
      name: '高橋 けんと',
      grade_type: 'elementary_1',
      is_active: true,
      parent_contact: '090-3456-7890',
      display_order: 3,
      home_address: '東京都渋谷区xxx 3-4-5',
      pickup_area_labels: ['demo-area-pickup-2'],
      dropoff_area_labels: ['demo-area-dropoff-1'],
      custom_pickup_areas: [],
      custom_dropoff_areas: [],
      created_at: nowIso,
    },
    {
      id: 'demo-child-004',
      tenant_id: DEMO_TENANT_ID,
      name: '伊藤 さくら',
      grade_type: 'elementary_3',
      is_active: true,
      parent_contact: '090-4567-8901',
      display_order: 4,
      home_address: '東京都渋谷区xxx 4-5-6',
      pickup_area_labels: ['demo-area-pickup-3'],
      dropoff_area_labels: ['demo-area-dropoff-2'],
      custom_pickup_areas: [],
      custom_dropoff_areas: [],
      created_at: nowIso,
    },
    {
      id: 'demo-child-005',
      tenant_id: DEMO_TENANT_ID,
      name: '渡辺 ひな',
      grade_type: 'elementary_5',
      is_active: true,
      parent_contact: null,
      display_order: 5,
      home_address: '東京都渋谷区xxx 5-6-7',
      pickup_area_labels: ['demo-area-pickup-1'],
      dropoff_area_labels: ['demo-area-dropoff-1'],
      custom_pickup_areas: [],
      custom_dropoff_areas: [],
      created_at: nowIso,
    },
  ];

  /* 当月＋来月の平日（月-金）に各児童を seed 利用予定として登録。 */
  const schedule_entries: ScheduleEntryRow[] = [];
  const today = new Date();
  const startMonthFirst = new Date(today.getFullYear(), today.getMonth(), 1);
  const endMonthLast = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  for (let d = new Date(startMonthFirst); d <= endMonthLast; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay(); // 0=Sun..6=Sat
    if (dow === 0 || dow === 6) continue;
    const ymd = ymdOf(d);
    children.forEach((child, idx) => {
      /* 児童ごとに利用日を絞る（全員毎日だと重い & デモとしては多すぎ） */
      if ((d.getDate() + idx) % 3 === 0) return;
      const pickupAreaId = child.pickup_area_labels[0];
      const dropoffAreaId = child.dropoff_area_labels[0];
      const pickupArea = PICKUP_AREAS.find((a) => a.id === pickupAreaId);
      const dropoffArea = DROPOFF_AREAS.find((a) => a.id === dropoffAreaId);
      schedule_entries.push({
        id: `demo-entry-${ymd}-${child.id}`,
        tenant_id: DEMO_TENANT_ID,
        child_id: child.id,
        date: ymd,
        pickup_time: pickupArea?.time ?? '14:30',
        dropoff_time: dropoffArea?.time ?? '17:00',
        pickup_method: 'pickup',
        dropoff_method: 'dropoff',
        pickup_mark: pickupArea ? `${pickupArea.emoji}${pickupArea.name}` : null,
        dropoff_mark: dropoffArea ? `${dropoffArea.emoji}${dropoffArea.name}` : null,
        is_confirmed: false,
        attendance_status: 'planned',
        attendance_updated_at: null,
        attendance_updated_by: null,
        created_at: nowIso,
      });
    });
  }

  /* 当月の月-金にシフトを seed。職員 3 名分。 */
  const shift_assignments: ShiftAssignmentRow[] = [];
  for (let d = new Date(startMonthFirst); d <= endMonthLast; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const ymd = ymdOf(d);
    staff.forEach((s) => {
      shift_assignments.push({
        id: `demo-shift-${ymd}-${s.id}`,
        tenant_id: DEMO_TENANT_ID,
        staff_id: s.id,
        date: ymd,
        start_time: s.default_start_time,
        end_time: s.default_end_time,
        assignment_type: 'normal',
        is_confirmed: false,
        created_at: nowIso,
        segment_order: 0,
      });
    });
  }

  /* 来月用の休み希望サンプル（デモ太郎が祝日扱いで申請済み） */
  const nextMonth = nextMonthFirstDay();
  const nextMonthStr = `${nextMonth.getFullYear()}-${pad2(nextMonth.getMonth() + 1)}`;
  const shift_requests: ShiftRequestRow[] = [
    {
      id: 'demo-req-001',
      tenant_id: DEMO_TENANT_ID,
      staff_id: DEMO_STAFF_ID_ME,
      month: nextMonthStr,
      request_type: 'paid_leave',
      dates: [`${nextMonthStr}-15`],
      notes: null,
      submitted_at: nowIso,
      submitted_by_staff_id: DEMO_STAFF_ID_ME,
    },
  ];

  return {
    tenants,
    staff,
    children,
    schedule_entries,
    shift_assignments,
    shift_requests,
    shift_request_comments: [],
    shift_change_requests: [],
    transport_assignments: [],
    comments: [],
    notifications: [
      {
        id: 'demo-notif-welcome',
        tenant_id: DEMO_TENANT_ID,
        recipient_staff_id: DEMO_STAFF_ID_ME,
        type: 'generic',
        target_type: null,
        target_id: null,
        body: 'デモモードへようこそ！触ってみたデータはタブを閉じると消えます。',
        is_read: false,
        created_at: nowIso,
      },
    ],
    child_area_eligible_staff: [],
    attendance_audit_logs: [],
    child_dropoff_locations: [],
    child_display_order_memory: [],
    meta: {
      seed_version: DEMO_SEED_VERSION,
      created_at: nowIso,
    },
  };
}

/* 開発用の参考エクスポート（外部から参照される可能性は低い） */
export const _DEMO_TODAY = todayYmd;
