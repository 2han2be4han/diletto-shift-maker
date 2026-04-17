/* =============================================
 * ShiftPuzzle 型定義
 * ※ 既存の型定義の削除・変更は禁止（CLAUDE.md §6）
 * ※ 追加のみ可
 * ============================================= */

// ----- テナント -----
/**
 * エリアラベル。time はそのエリアの基準時刻（迎 or 送の時）、address はそのエリアの住所（Google Maps検索・住所メモ自動入力用）。
 * マーク（emoji）と時間・住所はセットで扱い、児童の送迎パターンでエリアを選ぶと time / address が自動入力される（編集可）。
 */
export type AreaLabel = { emoji: string; name: string; time?: string; address?: string };
export type QualificationType = { name: string; countable: boolean };

export type TenantSettings = {
  /** 旧: 迎/送 共通エリア。互換のため残置。新規テナントでは使用せず pickup_areas / dropoff_areas を使用 */
  transport_areas?: AreaLabel[];
  /** 迎用エリア（time はそのエリアに迎に行く標準時刻） */
  pickup_areas?: AreaLabel[];
  /** 送用エリア（time はそのエリアに送る標準時刻） */
  dropoff_areas?: AreaLabel[];
  qualification_types?: QualificationType[];
  min_qualified_staff?: number;
  request_deadline_day?: number;
};

export type TenantRow = {
  id: string;
  name: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: 'active' | 'inactive' | 'suspended';
  settings: TenantSettings;
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
  qualifications: string[];
  is_qualified: boolean;
  created_at: string;
};

// ----- 児童 -----
export type GradeType =
  | 'preschool'
  | 'nursery_3'      /* 年少（3歳児クラス） */
  | 'nursery_4'      /* 年中（4歳児クラス） */
  | 'nursery_5'      /* 年長（5歳児クラス） */
  | 'elementary_1'
  | 'elementary_2'
  | 'elementary_3'
  | 'elementary_4'
  | 'elementary_5'
  | 'elementary_6'
  | 'junior_high'    /* 旧データ用「中学」（学年未指定） */
  | 'junior_high_1'
  | 'junior_high_2'
  | 'junior_high_3'
  | 'high_1'
  | 'high_2'
  | 'high_3';

export type ChildRow = {
  id: string;
  tenant_id: string;
  name: string;
  grade_type: GradeType;
  is_active: boolean;
  parent_contact: string | null;
  /** 児童一覧の表示順。NULL の場合は created_at フォールバック */
  display_order: number | null;
  /** 自宅住所。送迎パターンの dropoff_location 未入力時の default 値 */
  home_address: string | null;
  created_at: string;
};

// ----- 児童の送迎パターン -----
export type PickupMethod = 'pickup' | 'self' | 'parent';
export type DropoffMethod = 'dropoff' | 'self' | 'parent';

export type ChildTransportPatternRow = {
  id: string;
  child_id: string;
  tenant_id: string;
  pattern_name: string;
  pickup_location: string | null;
  pickup_time: string | null;
  pickup_method: PickupMethod;
  dropoff_location: string | null;
  dropoff_time: string | null;
  dropoff_method: DropoffMethod;
  /** 旧: パターン全体に1つのエリア。後方互換のため残す */
  area_label: string | null;
  /** 迎のエリア（emoji + name 形式） */
  pickup_area_label: string | null;
  /** 送のエリア（emoji + name 形式） */
  dropoff_area_label: string | null;
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

// ----- コメント（4機能にポリモーフィック） -----
export type CommentTargetType =
  | 'shift_request'
  | 'shift_assignment'
  | 'transport_assignment'
  | 'child_dropoff_location';

export type CommentStatus = 'pending' | 'approved' | 'rejected';

export type CommentRow = {
  id: string;
  tenant_id: string;
  author_staff_id: string;
  target_type: CommentTargetType;
  target_id: string;
  body: string;
  status: CommentStatus;
  approved_by_staff_id: string | null;
  approved_at: string | null;
  created_at: string;
};

export type CommentImageRow = {
  id: string;
  comment_id: string;
  storage_path: string;
  created_at: string;
};

// ----- 通知 -----
export type NotificationType =
  | 'comment_pending'
  | 'comment_approved'
  | 'comment_rejected'
  | 'generic';

export type NotificationRow = {
  id: string;
  tenant_id: string;
  recipient_staff_id: string;
  type: NotificationType;
  target_type: string | null;
  target_id: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
};

// ----- 児童の送り場所 -----
export type ChildDropoffLocationRow = {
  id: string;
  tenant_id: string;
  child_id: string;
  label: string;
  address: string | null;
  map_url: string | null;
  notes: string | null;
  image_storage_path: string | null;
  created_at: string;
};

// ----- 認証セッションから得た staff 情報（サーバー共通） -----
export type AuthenticatedStaff = Pick<
  StaffRow,
  'id' | 'tenant_id' | 'name' | 'email' | 'role'
>;

// ----- 定数 -----
export const MAX_STAFF_PER_TRANSPORT = 2;
export const DEFAULT_MIN_QUALIFIED_STAFF = 2;
export const TRANSPORT_GROUP_TIME_WINDOW_MINUTES = 30;

export const COMMENT_IMAGES_BUCKET = 'comment-images';
export const CHILD_LOCATION_IMAGES_BUCKET = 'child-location-images';
