/* =============================================
 * ShiftPuzzle 型定義
 * ※ 既存の型定義の削除・変更は禁止（CLAUDE.md §6）
 * ※ 追加のみ可
 * ============================================= */

// ----- テナント -----
export type TenantRow = {
  id: string;
  name: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
};

// ----- 職員 -----
export type StaffRole = 'admin' | 'editor' | 'viewer';
export type EmploymentType = 'full_time' | 'part_time';

export type StaffRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  role: StaffRole;
  employment_type: EmploymentType;
  default_start_time: string | null;
  default_end_time: string | null;
  transport_areas: string[];
  is_qualified: boolean;
  created_at: string;
};

// ----- 児童 -----
export type GradeType =
  | 'preschool'
  | 'elementary_1'
  | 'elementary_2'
  | 'elementary_3'
  | 'elementary_4'
  | 'elementary_5'
  | 'elementary_6'
  | 'junior_high';

export type ChildRow = {
  id: string;
  tenant_id: string;
  name: string;
  grade_type: GradeType;
  is_active: boolean;
  created_at: string;
};

// ----- 児童の送迎パターン -----
export type ChildTransportPatternRow = {
  id: string;
  child_id: string;
  tenant_id: string;
  pattern_name: string;
  pickup_location: string | null;
  pickup_time: string | null;
  dropoff_location: string | null;
  dropoff_time: string | null;
  area_label: string | null;
  created_at: string;
};

// ----- 利用予定 -----
export type ScheduleEntryRow = {
  id: string;
  tenant_id: string;
  child_id: string;
  date: string;
  pickup_time: string | null;
  dropoff_time: string | null;
  pattern_id: string | null;
  is_confirmed: boolean;
  created_at: string;
};

// ----- 休み希望 -----
export type ShiftRequestType = 'public_holiday' | 'paid_leave' | 'available_day';

export type ShiftRequestRow = {
  id: string;
  tenant_id: string;
  staff_id: string;
  month: string;
  request_type: ShiftRequestType;
  dates: string[];
  notes: string | null;
  submitted_at: string;
};

// ----- シフト確定 -----
export type ShiftAssignmentType = 'normal' | 'public_holiday' | 'paid_leave' | 'off';

export type ShiftAssignmentRow = {
  id: string;
  tenant_id: string;
  staff_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  assignment_type: ShiftAssignmentType;
  is_confirmed: boolean;
  created_at: string;
};

// ----- 送迎担当 -----
export type TransportAssignmentRow = {
  id: string;
  tenant_id: string;
  schedule_entry_id: string;
  pickup_staff_ids: string[];
  dropoff_staff_ids: string[];
  is_confirmed: boolean;
  is_unassigned: boolean;
  created_at: string;
};

// ----- PDF解析結果（Claude API応答） -----
export type ParsedScheduleEntry = {
  child_name: string;
  date: string;
  pickup_time: string | null;
  dropoff_time: string | null;
  area_label: string | null;
};

// ----- 定数 -----
export const MAX_STAFF_PER_TRANSPORT = 2;
export const DEFAULT_MIN_QUALIFIED_STAFF = 2;
export const TRANSPORT_GROUP_TIME_WINDOW_MINUTES = 30;
