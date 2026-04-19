/* =============================================
 * ShiftPuzzle 型定義
 * ※ 既存の型定義の削除・変更は禁止（CLAUDE.md §6）
 * ※ 追加のみ可
 * ============================================= */

// ----- テナント -----
/**
 * エリアラベル。time はそのエリアの基準時刻（迎 or 送の時）、address はそのエリアの住所（Google Maps検索・住所メモ自動入力用）。
 * マーク（emoji）と時間・住所はセットで扱い、児童の送迎パターンでエリアを選ぶと time / address が自動入力される（編集可）。
 *
 * Phase 30: id（uuid 文字列）必須化。テナント設定からマークを削除しても、児童側に
 * 残った id が単に「未解決」になるだけで、emoji+name 文字列マッチに依存しなくなった。
 * 新規エリア追加時は crypto.randomUUID() で採番し、既存データは migration 0032 で補完済み。
 */
export type AreaLabel = { id: string; emoji: string; name: string; time?: string; address?: string };
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
  /** Phase 26: 送迎担当の最低退勤時間。これ以降に退勤する職員のみ送迎候補。"HH:MM" 形式。デフォルト "16:31" */
  transport_min_end_time?: string;
  /** Phase 28: 迎え再送迎の禁止時間（分）。ある職員が pickup_time X で迎を担当したら、
      X + minutes までの別 pickup は候補から除外される。送り側には適用しない。デフォルト 45。
      自動割り当てのみ対象で、手動編集は制約対象外。 */
  transport_pickup_cooldown_minutes?: number;
  /** Phase 28: 送迎表（/transport）の列表示順。"child_name" は常に先頭固定で配列には含めない。
      未指定（undefined）は DEFAULT_TRANSPORT_COLUMN_ORDER を使う。テナント単位で共有され、
      並び替えは全職員に反映される。 */
  transport_column_order?: TransportColumnKey[];
};

/** Phase 28: /transport の並び替え可能な列キー（児童名は常時先頭固定のため含めない）。 */
export type TransportColumnKey =
  | 'pickup_time'
  | 'pickup_location'
  | 'pickup_staff'
  | 'dropoff_time'
  | 'dropoff_location'
  | 'dropoff_staff';

export const DEFAULT_TRANSPORT_COLUMN_ORDER: TransportColumnKey[] = [
  'pickup_time',
  'pickup_location',
  'pickup_staff',
  'dropoff_time',
  'dropoff_location',
  'dropoff_staff',
];

/** Phase 26: transport_min_end_time のデフォルト値。送迎の最早時刻(16:30)直後。 */
export const DEFAULT_TRANSPORT_MIN_END_TIME = '16:31';

/** Phase 28: 自動割り当ての担当人数（1 名固定）。手動で 2 名追加する場合は UI から。 */
export const AUTO_ASSIGN_STAFF_COUNT = 1;

/** Phase 28: 迎えクールダウンのデフォルト（45 分）。 */
export const DEFAULT_PICKUP_COOLDOWN_MINUTES = 45;

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
  /** 旧: 迎/送 共通の対応エリア。Phase 27-D 以降は pickup_/dropoff_ を使用するが、
      互換のため空配列フォールバック先として残置。Phase 30: 中身は AreaLabel.id の配列。 */
  transport_areas: string[];
  /** Phase 27-D: 迎対応エリア（AreaLabel.id 配列）。migration 0026 適用前の古いレコードでは
   *  空配列で、その場合は transport_areas へフォールバックして扱う。Phase 30: id 配列に移行。 */
  pickup_transport_areas: string[];
  /** Phase 27-D: 送り対応エリア（AreaLabel.id 配列）。上と同様のフォールバック運用。 */
  dropoff_transport_areas: string[];
  qualifications: string[];
  is_qualified: boolean;
  /** Phase 24: 一覧・シフト表の表示順。NULL は name フォールバック */
  display_order: number | null;
  /** Phase 25: 在職フラグ。false=退職。退職者はログイン不可 */
  is_active: boolean;
  /** Phase 25: 退職日時。is_active=false 時に設定 */
  retired_at: string | null;
  /** Phase 28 F案: 送迎表の担当セル用の短縮表示名（最大3文字、app バリデーション）。
      未登録時は name の先頭2文字にフォールバック（staffDisplayName 経由）。 */
  display_name: string | null;
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
  /** お迎えマーク（複数選択）。AreaLabel.id 配列。テナント pickup_areas または
      この児童の custom_pickup_areas に存在する id を参照する。
      Phase 21: マーク選択で時間が決まるド王仕様 / Phase 30: emoji+name → id に移行。
      テナント側で削除されたマークは「幽霊 id」として残るが、解決時に lookup に失敗するため
      実害はない（一覧の件数表示と編集モーダルは現存 id のみに絞って表示する）。 */
  pickup_area_labels: string[];
  /** 送りマーク（複数選択）。AreaLabel.id 配列。テナント dropoff_areas または
      custom_dropoff_areas に存在する id を参照する。Phase 27 追加 / Phase 30 で id 化。 */
  dropoff_area_labels: string[];
  /** 児童専用の迎えエリア候補（AreaLabel[]）。tenant pickup_areas とマージしてマーク解決に使う。
      Phase 28 A案: イレギュラー児童をパターン登録せずマーク運用するためのソース。 */
  custom_pickup_areas: AreaLabel[];
  /** 児童専用の送りエリア候補（AreaLabel[]）。tenant dropoff_areas とマージしてマーク解決に使う。
      Phase 28 A案追加。 */
  custom_dropoff_areas: AreaLabel[];
  created_at: string;
};

// ----- 利用予定 -----
export type ScheduleEntryPickupMethod = 'pickup' | 'self';
export type ScheduleEntryDropoffMethod = 'dropoff' | 'self';

export type ScheduleEntryRow = {
  id: string;
  tenant_id: string;
  child_id: string;
  date: string;
  pickup_time: string | null;
  dropoff_time: string | null;
  /** Phase 24: 'pickup'=お迎え, 'self'=自分で来る */
  pickup_method: ScheduleEntryPickupMethod;
  /** Phase 24: 'dropoff'=送り, 'self'=自分で帰る */
  dropoff_method: ScheduleEntryDropoffMethod;
  /** Phase 28: お迎えマーク（emoji+name）。テナント pickup_areas から time/address を解決するキー。 */
  pickup_mark: string | null;
  /** Phase 28: お送りマーク（emoji+name）。テナント dropoff_areas から time/address を解決するキー。 */
  dropoff_mark: string | null;
  is_confirmed: boolean;
  /** Phase 25: 出欠ステータス。planned=予定／present=出席／absent=欠席／late=遅刻／early_leave=早退 */
  attendance_status: AttendanceStatus;
  /** Phase 25: 出欠最終更新日時 */
  attendance_updated_at: string | null;
  /** Phase 25: 出欠最終更新者 staff.id */
  attendance_updated_by: string | null;
  created_at: string;
};

// ----- Phase 25: 出欠 -----
export type AttendanceStatus =
  | 'planned'      /* 予定（未確認） */
  | 'present'      /* 出席 */
  | 'absent'       /* 欠席 */
  | 'late'         /* 遅刻 */
  | 'early_leave'; /* 早退 */

export type AttendanceAuditLogRow = {
  id: string;
  tenant_id: string;
  schedule_entry_id: string;
  child_id: string;
  entry_date: string;
  /** 退職・削除で null。その場合は changed_by_name を参照 */
  changed_by_staff_id: string | null;
  /** 変更時点の職員名スナップショット（退職・改名後も参照可能） */
  changed_by_name: string;
  old_status: AttendanceStatus | null;
  new_status: AttendanceStatus;
  changed_at: string;
};

// ----- 休み希望 -----
/** Phase 36: 旧 'available_day' を 'full_day_available' に改名 + 'am_off' / 'pm_off' / 'comment' を追加。
 *  'comment' は他選択肢と排他、shift_request_comments テーブルとペアで運用する。 */
export type ShiftRequestType =
  | 'public_holiday'
  | 'paid_leave'
  | 'full_day_available'
  | 'am_off'
  | 'pm_off'
  | 'comment';

export type ShiftRequestRow = {
  id: string;
  tenant_id: string;
  staff_id: string;
  month: string;
  request_type: ShiftRequestType;
  dates: string[];
  notes: string | null;
  submitted_at: string;
  /** Phase 25: 入力者 id。NULL or = staff_id なら本人、異なれば代理入力 */
  submitted_by_staff_id: string | null;
};

/** Phase 36: 休み希望の自由入力コメント（日付ごと、他選択肢と排他） */
export type ShiftRequestCommentRow = {
  id: string;
  tenant_id: string;
  staff_id: string;
  month: string;
  date: string;
  comment_text: string;
  updated_at: string;
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

// ----- Phase 25: シフト変更申請 -----
export type ShiftChangeRequestType =
  | 'time'         /* 出勤時刻の変更 */
  | 'leave'        /* 休暇申請（assignment_type を paid_leave / public_holiday 等に） */
  | 'type_change'; /* 勤務種別変更 */

export type ShiftChangeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

/** change_type='time' の requested_payload */
export type ShiftChangeTimePayload = {
  start_time: string; /* "HH:MM" */
  end_time: string;
};

/** change_type='leave' / 'type_change' の requested_payload */
export type ShiftChangeTypePayload = {
  assignment_type: ShiftAssignmentType;
  /** 時刻変更も同時に行う場合 */
  start_time?: string | null;
  end_time?: string | null;
};

export type ShiftChangeRequestPayload =
  | ShiftChangeTimePayload
  | ShiftChangeTypePayload;

export type ShiftChangeRequestRow = {
  id: string;
  tenant_id: string;
  staff_id: string;
  target_date: string;
  change_type: ShiftChangeRequestType;
  requested_payload: ShiftChangeRequestPayload;
  /** 申請時点の shift_assignments スナップショット（差分表示用） */
  snapshot_before: Partial<ShiftAssignmentRow> | null;
  reason: string | null;
  status: ShiftChangeRequestStatus;
  reviewed_by_staff_id: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
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
  /** Phase 45: 手動編集ロック。true の日は再生成でスキップされる */
  is_locked: boolean;
  created_at: string;
};

// ----- PDF解析結果（Claude API応答） -----
export type ParsedScheduleEntry = {
  child_name: string;
  date: string;
  pickup_time: string | null;
  dropoff_time: string | null;
  area_label: string | null;
  /** Phase 24: Excel貼付で「迎/送」ラベル無しは self 扱い（任意、未設定は pickup/dropoff 扱い） */
  pickup_method?: ScheduleEntryPickupMethod;
  dropoff_method?: ScheduleEntryDropoffMethod;
  /** Phase 28: 児童のマーク × 解析時刻から自動推論されるお迎えマーク（emoji+name）。
   *  確認画面で手動変更可能。null = 該当なし、undefined = 未推論。 */
  pickup_mark?: string | null;
  /** Phase 28: 児童のマーク × 解析時刻から自動推論されるお送りマーク。上と同様。 */
  dropoff_mark?: string | null;
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

// ----- Phase 35: 日次出力カードの児童 DnD 並び順学習記憶 -----
export type ChildDisplayOrderMemoryRow = {
  id: string;
  tenant_id: string;
  /** "HH:MM|pickup|areaId1,areaId2" 形式（areaId はソート済み） */
  slot_signature: string;
  child_id: string;
  display_order: number;
  updated_at: string;
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
