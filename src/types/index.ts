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
