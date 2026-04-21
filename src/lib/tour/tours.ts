import type { TourDefinition, TourKey } from './types';

/**
 * 11 ページ分 + 全体オンボーディングのツアー定義。
 * - description には HTML を使って見やすく整形（driver.js は HTML をそのまま描画）
 * - element 未指定のステップはモーダル風（画面中央）で表示される
 * - roles 未指定は全ロールに表示
 * - モバイルは要素特定が難しいため、ほぼモーダル風の簡易版
 *
 * 方針:
 *  - 専門用語・横文字・技術用語は使わない
 *  - 1 ステップ 3〜5 行程度、箇条書きで区切る
 *  - 強調は <strong>、改行は <br>、箇条書きは <ul><li>
 */

const globalTour: TourDefinition = {
  desktop: [
    {
      title: '👋 ShiftPuzzle へようこそ',
      description: `
        <p>放課後等デイサービスの</p>
        <p><strong>利用予定 → シフト → 送迎</strong></p>
        <p>を半自動で作るツールです。</p>
        <br>
        <p>まずは全体の流れを 30 秒で紹介します。</p>
      `,
    },
    {
      element: '[data-tour="sidebar"]',
      title: '左のメニュー',
      description: `
        <p>ここから各ページに移動できます。</p>
        <br>
        <p>上から順に作業する流れです:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>利用予定</li>
          <li>シフト表</li>
          <li>送迎表</li>
          <li>日次出力</li>
        </ul>
      `,
    },
    {
      element: '[data-tour="dashboard-cards"]',
      title: 'ダッシュボードのカード',
      description: `
        <p>来月分の作業がどこまで進んでいるか、カード右上のバッジで一目でわかります。</p>
        <br>
        <ul style="margin:0 0 0 18px;">
          <li>🟢 完成</li>
          <li>🟡 未完成</li>
          <li>⚪ 未着手</li>
        </ul>
      `,
    },
    {
      element: '[data-tour="tour-button"]',
      title: '📖 使い方を見る',
      description: `
        <p>各ページの右上にあるこのボタンから、</p>
        <p>そのページの使い方をいつでも見直せます。</p>
        <br>
        <p>迷ったらまずここ！</p>
      `,
    },
    {
      title: '✅ 準備完了',
      description: `
        <p>おすすめの作業順は:</p>
        <br>
        <ol style="margin:0 0 0 18px;">
          <li>「利用予定」で PDF を取り込む</li>
          <li>「シフト表」で自動生成</li>
          <li>「送迎表」で担当を割り当て</li>
        </ol>
        <br>
        <p>それでは始めましょう🚀</p>
      `,
    },
  ],
  mobile: [
    {
      title: '👋 ShiftPuzzle へようこそ',
      description: `
        <p>放課後等デイサービスの</p>
        <p><strong>利用予定 → シフト → 送迎</strong></p>
        <p>を半自動で作るツールです。</p>
      `,
    },
    {
      title: 'メニューの開き方',
      description: `
        <p>左上の <strong>≡</strong> ボタンで</p>
        <p>メニューが開きます。</p>
        <br>
        <p>そこから各ページへ移動してください。</p>
      `,
    },
    {
      title: '📖 使い方を見る',
      description: `
        <p>各ページの右上にあります。</p>
        <br>
        <p>迷ったらいつでもここから</p>
        <p>使い方を再表示できます。</p>
      `,
    },
  ],
};

const dashboardTour: TourDefinition = {
  desktop: [
    {
      element: '[data-tour="dashboard-welcome"]',
      title: 'ようこそ画面',
      description: `
        <p>ログイン中のアカウント名と、</p>
        <p>権限（管理者 / 編集者 / 閲覧者）が表示されます。</p>
        <br>
        <p>🔔 未読のお知らせもここに出ます。</p>
      `,
    },
    {
      element: '[data-tour="sidebar"]',
      title: '左のメニュー（サイドバー）',
      description: `
        <p>ここから各ページに移動します。</p>
        <br>
        <p>上から順に作業する流れです:</p>
        <ol style="margin:6px 0 0 18px;">
          <li>利用予定（誰がいつ来るか）</li>
          <li>シフト表（職員の勤務）</li>
          <li>送迎表（送迎担当）</li>
          <li>日次出力（掲示用）</li>
        </ol>
        <br>
        <p>管理者は下部に「設定」も表示されます。</p>
      `,
    },
    {
      element: '[data-tour="dashboard-cards"]',
      title: '作業メニュー（カード）',
      description: `
        <p>各ページへのショートカットです。</p>
        <br>
        <p>カード右上のバッジで、</p>
        <p>来月分の進み具合がわかります:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>🟢 完成</li>
          <li>🟡 未完成</li>
          <li>⚪ 未着手</li>
        </ul>
      `,
    },
    {
      element: '[data-tour="tour-button"]',
      title: '📖 使い方を見る',
      description: `
        <p>各ページの右上にこのボタンがあります。</p>
        <br>
        <p>迷ったらいつでもここから</p>
        <p>そのページの使い方を再表示できます。</p>
      `,
    },
  ],
  mobile: [
    {
      title: 'ダッシュボード',
      description: `
        <p>ログイン後の最初の画面です。</p>
        <br>
        <p>カードをタップすると</p>
        <p>各ページに移動できます。</p>
      `,
    },
    {
      title: 'メニューの開き方',
      description: `
        <p>左上の <strong>≡</strong> ボタンで</p>
        <p>サイドバーメニューが開きます。</p>
        <br>
        <p>利用予定 / シフト / 送迎 / 日次出力</p>
        <p>各ページへ移動できます。</p>
      `,
    },
    {
      title: '📖 使い方を見る',
      description: `
        <p>各ページの右上にあります。</p>
        <br>
        <p>迷ったらいつでもここから</p>
        <p>使い方を再表示できます。</p>
      `,
    },
  ],
};

const scheduleTour: TourDefinition = {
  desktop: [
    {
      title: '📅 利用予定ページ',
      description: `
        <p><strong>縦軸: 児童 / 横軸: 日付</strong> のグリッドで</p>
        <p>「誰がいつ来るか」を管理します。</p>
        <br>
        <p>すべての作業の<strong>出発点</strong>です。</p>
        <p>ここのデータを元に、シフト・送迎が組まれます。</p>
      `,
    },
    {
      element: '[data-tour="schedule-pdf"]',
      title: '① 一番楽なのは PDF インポート',
      description: `
        <p>デイロボの月次PDFをドラッグ＆ドロップすると、</p>
        <p>AI が自動で読み取って一括登録します。</p>
        <br>
        <p>読み取る内容:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>児童名</li>
          <li>日付</li>
          <li>来所・退所時間</li>
          <li>送迎マーク（🔴🔵 などのエリア）</li>
        </ul>
        <br>
        <p>登録前に必ず確認画面が出るので安心です。</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="schedule-excel"]',
      title: '② Excel 貼付でも入れられる',
      description: `
        <p>Excelの表をコピーして貼り付けるだけで登録できます。</p>
        <br>
        <p>デイロボPDFがない事業所や、</p>
        <p>独自のExcelで管理している場合におすすめ。</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="month-stepper"]',
      title: '③ 月を切り替える',
      description: `
        <p>◀ ▶ ボタンで月を移動。</p>
        <br>
        <p>来月分を先に組むのが基本の流れです。</p>
      `,
    },
    {
      element: '[data-tour="schedule-grid"]',
      title: '④ セルをクリックして個別編集',
      description: `
        <p>セルをクリックすると、こんなモーダルが開きます:</p>
        <div style="margin:10px 0; padding:12px; border:1px solid #e5e5e5; border-radius:8px; background:#fafafa; font-size:12px;">
          <div style="font-weight:700; margin-bottom:8px;">川島舞桜 — 4月23日（木）</div>
          <div style="margin-bottom:8px;">
            <div style="font-size:10px; font-weight:700; margin-bottom:3px;">来所予定時間</div>
            <div style="font-weight:700; margin-bottom:4px;">13 : 00</div>
            <div style="display:flex; gap:0;">
              <div style="padding:4px 10px; border:1px solid #ddd; border-radius:4px 0 0 4px; font-size:11px;">自分で来る</div>
              <div style="padding:4px 10px; background:#4dbfbf; color:#fff; border-radius:0 4px 4px 0; font-size:11px; font-weight:600;">お迎え</div>
            </div>
          </div>
          <div style="margin-bottom:8px;">
            <div style="font-size:10px; font-weight:700; margin-bottom:3px;">退所予定時間</div>
            <div style="font-weight:700; margin-bottom:4px;">16 : 00</div>
            <div style="display:flex; gap:0;">
              <div style="padding:4px 10px; border:1px solid #ddd; border-radius:4px 0 0 4px; font-size:11px;">自分で帰る</div>
              <div style="padding:4px 10px; background:#4dbfbf; color:#fff; border-radius:0 4px 4px 0; font-size:11px; font-weight:600;">送り</div>
            </div>
          </div>
          <div style="border-top:1px solid #eee; padding-top:8px;">
            <div style="font-size:10px; font-weight:700; margin-bottom:3px;">当日の出欠記録</div>
            <div style="display:flex; gap:3px;">
              <div style="padding:2px 8px; background:#bbb; color:#fff; border-radius:3px; font-size:10px;">予定</div>
              <div style="padding:2px 8px; border:1px solid #ddd; border-radius:3px; font-size:10px;">出席</div>
              <div style="padding:2px 8px; border:1px solid #ddd; border-radius:3px; font-size:10px;">欠席</div>
              <div style="padding:2px 8px; border:1px solid #ddd; border-radius:3px; font-size:10px;">遅刻</div>
              <div style="padding:2px 8px; border:1px solid #ddd; border-radius:3px; font-size:10px;">早退</div>
            </div>
          </div>
        </div>
        <p>ここで時間・送迎有無・出欠を編集できます。</p>
      `,
    },
    {
      element: '[data-tour="schedule-grid"]',
      title: '⑤「お休み」「欠席」で送迎表から外れる',
      description: `
        <p>出欠記録で <strong>「お休み」</strong> または <strong>「欠席」</strong> を選ぶと、</p>
        <p>その日の送迎表からその児童が外れます。</p>
        <br>
        <p>当日の欠席連絡が来たら、</p>
        <p>セルを開いて「欠席」をポチッとするだけ。</p>
      `,
    },
    {
      element: '[data-tour="sidebar-nav-settings-children"]',
      title: '💡 児童の名前登録について',
      description: `
        <p>児童の名前はあらかじめ</p>
        <p><strong>ここ（児童管理）</strong>で登録しておきます。</p>
        <br>
        <p>PDF内の名前と完全一致していると、</p>
        <p>インポート時に自動マッチングされます。</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="schedule-print"]',
      title: '印刷',
      description: `
        <p>A3 横 1 枚に収めて印刷できます。</p>
        <br>
        <p>事業所の掲示やバックアップ用途に。</p>
      `,
    },
  ],
  mobile: [
    {
      title: '📅 利用予定ページ',
      description: `
        <p>児童×日付のグリッドで</p>
        <p>利用予定を管理します。</p>
        <br>
        <p>セルをタップで:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>来所 / 退所時間</li>
          <li>送迎有無</li>
          <li>出欠記録</li>
        </ul>
      `,
    },
    {
      title: 'インポートは PC 推奨',
      description: `
        <p>PDF / Excel の一括取り込みは</p>
        <p>画面が広いPCからの操作が</p>
        <p>おすすめです。</p>
      `,
    },
    {
      title: '当日の欠席連絡対応',
      description: `
        <p>欠席連絡が来たら:</p>
        <br>
        <ol style="margin:0 0 0 18px;">
          <li>該当セルをタップ</li>
          <li>「欠席」を選択</li>
          <li>保存</li>
        </ol>
        <br>
        <p>送迎表から自動で除外されます。</p>
      `,
    },
  ],
};

const shiftTour: TourDefinition = {
  desktop: [
    {
      title: '📋 シフト表ページ',
      description: `
        <p><strong>縦軸: 職員 / 横軸: 日付</strong> のグリッドで</p>
        <p>勤務シフトを管理するページです。</p>
        <br>
        <p>各セルには勤務時間（例: 09:30〜18:00）や</p>
        <p>「公休」「有給」「休み」が表示されます。</p>
      `,
    },
    {
      element: '[data-tour="shift-generate"], [data-tour="shift-actions"]',
      title: '① まずは「シフト生成」',
      description: `
        <p>シフト未作成のときに表示されるボタンです。</p>
        <br>
        <p>押すと<strong>利用予定</strong>と<strong>休み希望</strong>から、</p>
        <p>以下のルールで自動組みされます:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>利用人数に応じた最低出勤人数を確保</li>
          <li>有資格者を毎日○名以上配置</li>
          <li>休み希望を尊重</li>
        </ul>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="shift-grid"]',
      title: '② セルをクリックして編集',
      description: `
        <p>セルをクリックすると、こんなモーダルが開きます:</p>
        <div style="margin:10px 0; padding:12px; border:1px solid #e5e5e5; border-radius:8px; background:#fafafa; font-size:12px;">
          <div style="font-weight:700; margin-bottom:6px;">本岡 恵 — 4/23（木）</div>
          <div style="color:#999; font-size:11px; margin-bottom:8px;">現在: 出勤</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:8px;">
            <div style="padding:6px; text-align:center; background:#111; color:#fff; border-radius:4px; font-weight:600;">出勤</div>
            <div style="padding:6px; text-align:center; border:1.5px solid #2e86de; color:#2e86de; border-radius:4px; font-weight:600;">公休</div>
            <div style="padding:6px; text-align:center; border:1.5px solid #2f8f57; color:#2f8f57; border-radius:4px; font-weight:600;">有給</div>
            <div style="padding:6px; text-align:center; border:1.5px solid #bbb; color:#999; border-radius:4px; font-weight:600;">休み</div>
          </div>
          <div style="padding:6px 8px; background:#f0f0f0; border-radius:4px;">
            <div style="font-size:10px; font-weight:700; margin-bottom:3px;">勤務時間</div>
            <div style="font-weight:700;">09 : 30 〜 18 : 30</div>
          </div>
        </div>
        <p>4つのタイプから選んで、出勤なら時間を調整します。</p>
      `,
    },
    {
      element: '[data-tour="sidebar-nav-settings-staff"]',
      title: '💡 勤務時間のデフォルト値について',
      description: `
        <p>モーダルの勤務時間（例: 09:30〜18:30）は、</p>
        <p><strong>ここ（職員管理）</strong>で設定した</p>
        <p>その職員の「デフォルト勤務時間」が自動で入ります。</p>
        <br>
        <p>変更手順:</p>
        <ol style="margin:6px 0 0 18px;">
          <li>この「職員管理」をクリック</li>
          <li>該当職員の行をクリック</li>
          <li>「勤務時間」を変更して保存</li>
        </ol>
        <br>
        <p>次回以降のシフト編集モーダルに反映されます。</p>
      `,
      roles: ['admin'],
    },
    {
      element: '[data-tour="shift-warnings-hint"]',
      title: '③ 警告を確認',
      description: `
        <p>上部に<strong>人数不足</strong>や</p>
        <p><strong>有資格者不足</strong>の警告バッジが出ることがあります。</p>
        <br>
        <p>表示されたらセルをクリックして</p>
        <p>手動で調整してください。</p>
      `,
    },
    {
      element: '[data-tour="shift-regenerate"], [data-tour="shift-actions"]',
      title: '④ もう一度組み直すとき',
      description: `
        <p>休み希望の追加などで</p>
        <p>シフトを組み直したいときはここ。</p>
        <br>
        <p>⚠️ 手動で編集した内容は</p>
        <p>上書きされるので注意してください。</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="shift-confirm"], [data-tour="shift-actions"]',
      title: '⑤ 最後に「シフト確定」',
      description: `
        <p>問題なければヘッダー右の</p>
        <p><strong>シフト確定</strong>ボタンを押します。</p>
        <br>
        <p>確定するとセルがロックされ、</p>
        <p>自動再生成でも上書きされなくなります。</p>
        <br>
        <p style="color:#888; font-size:11px;">※ 既に確定済みの場合、このボタンは「確定解除」に変わります。</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="shift-edit-mode"], [data-tour="shift-actions"]',
      title: '確定後の微修正は「編集モード」',
      description: `
        <p>確定後に「やっぱりここ変えたい」と</p>
        <p>なったらこのボタンでロック解除。</p>
        <br>
        <p>1セル単位で編集できます。</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="shift-print"]',
      title: '印刷',
      description: `
        <p>シフト表を A3 横 1 枚に収めて印刷できます。</p>
        <br>
        <p>事業所に掲示するときに使ってください。</p>
      `,
    },
  ],
  mobile: [
    {
      title: '📋 シフト表ページ',
      description: `
        <p>職員×日付の勤務シフトを管理します。</p>
        <br>
        <p>セルをタップで</p>
        <p>出勤 / 公休 / 有給 / 休み を切替。</p>
      `,
    },
    {
      title: '自動生成と確定',
      description: `
        <p>ヘッダー右のボタンで:</p>
        <br>
        <ul style="margin:0 0 0 18px;">
          <li><strong>シフト生成</strong> — 自動組み</li>
          <li><strong>再生成</strong> — 組み直し</li>
          <li><strong>シフト確定</strong> — ロック</li>
        </ul>
      `,
    },
  ],
};

const transportTour: TourDefinition = {
  desktop: [
    {
      title: '🚗 送迎表ページ',
      description: `
        <p>日ごとに送迎担当を割り振るページです。</p>
        <br>
        <p>利用予定とシフトの情報から、</p>
        <p>エリア・時刻・職員の対応可否を判定して</p>
        <p>自動で最適な担当を選んでくれます。</p>
      `,
    },
    {
      element: '[data-tour="transport-generate"], [data-tour="shift-actions"]',
      title: '① まずは「割り当て生成」',
      description: `
        <p>出勤している職員の中から、</p>
        <p>以下のルールで担当を自動選定します:</p>
        <br>
        <ol style="margin:0 0 0 18px;">
          <li>出勤中の職員のみ候補</li>
          <li>送迎時刻が勤務時間内に収まる</li>
          <li>送迎エリアが対応エリアと一致</li>
          <li>同エリア・30分以内は同便扱い</li>
          <li>1日の送迎回数が職員間で均等になる</li>
        </ol>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="transport-day"]',
      title: '② 日別ビュー',
      description: `
        <p>その日の送迎がこんな風に並びます:</p>
        <div style="margin:10px 0; padding:8px; border:1px solid #e5e5e5; border-radius:6px; background:#fafafa; font-size:11px;">
          <div style="display:grid; grid-template-columns:16px 70px 1fr 1fr; gap:4px; padding:4px 6px; border-bottom:1px solid #eee; font-weight:700; color:#666;">
            <div></div>
            <div>時刻</div>
            <div>児童</div>
            <div>担当</div>
          </div>
          <div style="display:grid; grid-template-columns:16px 70px 1fr 1fr; gap:4px; padding:4px 6px; align-items:center;">
            <div>🔴</div>
            <div style="font-weight:600;">13:00</div>
            <div>川島 舞桜</div>
            <div style="padding:2px 6px; background:#fff; border:1px solid #ddd; border-radius:3px;">山田 太郎</div>
          </div>
          <div style="display:grid; grid-template-columns:16px 70px 1fr 1fr; gap:4px; padding:4px 6px; align-items:center; background:rgba(0,0,0,0.02);">
            <div>🔵</div>
            <div style="font-weight:600;">13:10</div>
            <div>佐藤 健</div>
            <div style="padding:2px 6px; background:#fff; border:1px solid #ddd; border-radius:3px;">山田 太郎</div>
          </div>
          <div style="display:grid; grid-template-columns:16px 70px 1fr 1fr; gap:4px; padding:4px 6px; align-items:center;">
            <div>🔴</div>
            <div style="font-weight:600;">16:00</div>
            <div>川島 舞桜</div>
            <div style="padding:2px 6px; background:#ffd6d6; border:1px solid #d63031; color:#d63031; border-radius:3px; font-weight:600;">未割当</div>
          </div>
        </div>
        <p>時刻順に並び、左端のマーク（🔴🔵）はエリア。</p>
      `,
    },
    {
      element: '[data-tour="transport-day"]',
      title: '③ 担当セルをクリックで変更',
      description: `
        <p>自動割当の結果に不満があれば、</p>
        <p>担当セルをクリック → ドロップダウンで</p>
        <p>別の職員に切り替えられます。</p>
        <br>
        <p>1便につき最大 2 名まで登録可能。</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="transport-day"]',
      title: '⚠️ 赤いセル = 未割当',
      description: `
        <p>条件に合う職員が見つからないと、</p>
        <p><strong style="color:#d63031;">赤いハイライト</strong>で「未割当」と表示されます。</p>
        <br>
        <p>そのまま確定はできません。</p>
        <p>手動で誰かを割り当ててください。</p>
      `,
    },
    {
      element: '[data-tour="transport-add-shift"]',
      title: '④ シフト外の職員を追加したいとき',
      description: `
        <p>「割り当て候補が足りない」というとき、</p>
        <p>このボタンで<strong>その日だけ</strong></p>
        <p>出勤扱いにする職員を追加できます。</p>
        <br>
        <p>例: パート職員を臨時で送迎だけ頼む</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="transport-save-day"]',
      title: '⑤ 日ごとに「保存」',
      description: `
        <p>変更した内容を保存します。</p>
        <br>
        <p>保存済みの日は <strong>🔒 ロック</strong> されて、</p>
        <p>再生成ボタンを押しても上書きされません。</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="transport-confirm"], [data-tour="shift-actions"]',
      title: '⑥ 最後に「送迎表確定」',
      description: `
        <p>月の全日程に問題がなくなったら、</p>
        <p>月単位で<strong>送迎表確定</strong>を押します。</p>
        <br>
        <p>確定後は読み取り専用になり、</p>
        <p>誤操作で壊れる心配がなくなります。</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="sidebar-nav-settings-tenant"]',
      title: '💡 エリア（マーク）の登録場所',
      description: `
        <p>🔴🔵🟢 などの送迎エリアは</p>
        <p><strong>テナント設定</strong>で登録します。</p>
        <br>
        <p>ここで登録したマークが、</p>
        <p>PDFインポート・送迎表で使われます。</p>
      `,
      roles: ['admin'],
    },
  ],
  mobile: [
    {
      title: '🚗 送迎表ページ',
      description: `
        <p>日別の送迎担当を管理します。</p>
        <br>
        <p>自動割当 → 手動調整 → 保存 → 確定</p>
        <p>の流れで使います。</p>
      `,
    },
    {
      title: '画面が狭いので PC 推奨',
      description: `
        <p>担当セルの編集は項目が多いので</p>
        <p>PCからの操作がおすすめです。</p>
        <br>
        <p>閲覧だけならスマホでも OK。</p>
      `,
    },
    {
      title: '🔴 赤セル = 未割当',
      description: `
        <p>条件に合う職員が見つからないと</p>
        <p>赤いハイライトで表示されます。</p>
        <br>
        <p>PCから手動で割り当ててください。</p>
      `,
    },
  ],
};

const requestTour: TourDefinition = {
  desktop: [
    {
      title: '✋ 休み希望ページ',
      description: `
        <p>来月のシフトを組むために、</p>
        <p>職員が事前に休み希望を提出するページです。</p>
        <br>
        <p>ログインしている人の権限で</p>
        <p>画面が切り替わります:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>閲覧者 → 自分の希望入力カレンダー</li>
          <li>編集者・管理者 → 全員の提出状況一覧</li>
        </ul>
      `,
    },
    {
      element: '[data-tour="request-calendar"], [data-tour="request-admin-list"]',
      title: '① 休み希望を登録 / 確認',
      description: `
        <p><strong>閲覧者の場合:</strong></p>
        <p>カレンダーの日付をクリックで希望登録。</p>
        <br>
        <p><strong>管理者の場合:</strong></p>
        <p>全職員の提出状況と希望日を一覧で確認できます。</p>
        <br>
        <p>提出された希望は、シフト自動生成で</p>
        <p>自動的に尊重されます。</p>
      `,
    },
    {
      element: '[data-tour="request-change-section"]',
      title: '② シフト変更申請',
      description: `
        <p>シフト確定後に急な都合で変更したいとき、</p>
        <p>ここから申請できます。</p>
        <br>
        <p>申請できる種類:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>時間変更（早出 / 遅出 / 早退）</li>
          <li>休み追加</li>
          <li>区分変更（出勤 → 公休 など）</li>
        </ul>
        <br>
        <p>申請は出勤中の管理者が承認 / 却下します。</p>
      `,
    },
    {
      element: '[data-tour="month-stepper"]',
      title: '月の切替',
      description: `
        <p>◀ ▶ ボタンで対象月を切り替えます。</p>
        <br>
        <p>デフォルトは来月（シフトを組む対象月）。</p>
      `,
    },
  ],
  mobile: [
    {
      title: '✋ 休み希望ページ',
      description: `
        <p>休み希望を提出するページです。</p>
        <br>
        <p>スマホからでも登録できます。</p>
      `,
    },
    {
      title: 'カレンダーで登録',
      description: `
        <p>日付をタップして希望を登録。</p>
        <br>
        <p>提出するとシフト生成時に</p>
        <p>自動で反映されます。</p>
      `,
    },
    {
      title: '変更申請もここから',
      description: `
        <p>確定後の変更は</p>
        <p>「シフト変更申請」から。</p>
        <br>
        <p>管理者が承認後に反映されます。</p>
      `,
    },
  ],
};

const outputDailyTour: TourDefinition = {
  desktop: [
    {
      title: '📄 日次出力ページ',
      description: `
        <p>その日の<strong>送迎・出勤</strong>を</p>
        <p>ホワイトボード風に一画面で表示します。</p>
        <br>
        <p>印刷して事業所内に掲示するのが主な用途。</p>
        <p>当日の動きが一目でわかります。</p>
      `,
    },
    {
      element: '[data-tour="daily-date-stepper"]',
      title: '① 日付の切替',
      description: `
        <p>◀ ▶ ボタンで表示日を切り替えます。</p>
        <br>
        <p>土日祝は色付きで、</p>
        <p>祝日名も一緒に表示されます。</p>
      `,
    },
    {
      element: '[data-tour="daily-board"]',
      title: '② ホワイトボードの構成',
      description: `
        <p>表示される情報:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>📅 児童の来所・退所予定</li>
          <li>🚗 送迎担当（時刻・エリア付き）</li>
          <li>👥 当日の出勤職員</li>
          <li>🎨 エリアマーク（🔴🔵 など）</li>
        </ul>
        <br>
        <p>児童カードは学年で色分けされます。</p>
      `,
    },
    {
      element: '[data-tour="daily-board"]',
      title: '③ 児童バッジは並び替え可能',
      description: `
        <p>各時間帯の児童バッジは</p>
        <p><strong>左右にドラッグ</strong>して順番を変えられます。</p>
        <div style="margin:10px 0; padding:10px; border:1px solid #e5e5e5; border-radius:6px; background:#fafafa; font-size:11px;">
          <div style="font-weight:700; color:#666; margin-bottom:6px;">並び替え前</div>
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:10px;">
            <div style="width:46px; height:46px; border-radius:50%; background:#fde0e0; border:2px solid #d63031; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#a00;">川島<br>舞桜</div>
            <div style="width:46px; height:46px; border-radius:50%; background:#e0efff; border:2px solid #2e86de; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#05527a;">滝川<br>希</div>
            <div style="width:46px; height:46px; border-radius:50%; background:#e0f5e0; border:2px solid #2f8f57; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#185a32;">滝川<br>葵</div>
          </div>
          <div style="text-align:center; color:#888; margin-bottom:8px; font-size:13px;">↓ 葵を左にドラッグ</div>
          <div style="font-weight:700; color:#666; margin-bottom:6px;">並び替え後</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <div style="width:46px; height:46px; border-radius:50%; background:#e0f5e0; border:2px solid #2f8f57; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#185a32;">滝川<br>葵</div>
            <div style="width:46px; height:46px; border-radius:50%; background:#fde0e0; border:2px solid #d63031; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#a00;">川島<br>舞桜</div>
            <div style="width:46px; height:46px; border-radius:50%; background:#e0efff; border:2px solid #2e86de; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#05527a;">滝川<br>希</div>
          </div>
        </div>
        <p>並び順は<strong>自動で記憶</strong>されます。</p>
        <p>同じ児童の組み合わせが次回来たときも、</p>
        <p>この順番が再現されます。</p>
        <br>
        <p style="color:#666; font-size:11px;">💡 仲良しの子を隣に、先生の受け持ち順に、など</p>
      `,
    },
    {
      element: '[data-tour="daily-print"]',
      title: '④ 印刷 / PDF保存',
      description: `
        <p>A4 縦 1 枚に収まるよう最適化されています。</p>
        <br>
        <p>ブラウザの印刷ダイアログから、</p>
        <p>プリンター印刷または PDF 保存が選べます。</p>
      `,
    },
    {
      title: '💡 毎日の使い方',
      description: `
        <p>出力時の流れ:</p>
        <br>
        <ol style="margin:6px 0 0 18px;">
          <li>このページを開く</li>
          <li>日付を対象日に合わせる</li>
          <li>必要なら並び順を調整</li>
          <li>印刷して掲示 / PDF で保存</li>
        </ol>
        <br>
        <p>これで全職員がその日の動きを把握できます。</p>
      `,
    },
  ],
  mobile: [
    {
      title: '📄 日次出力ページ',
      description: `
        <p>その日の送迎・出勤を</p>
        <p>一画面で表示します。</p>
        <br>
        <p>印刷前提の画面なので</p>
        <p>PC / タブレット推奨。</p>
      `,
    },
    {
      title: '日付の切替',
      description: `
        <p>上部のステッパーで</p>
        <p>日付を切り替えられます。</p>
      `,
    },
  ],
};

const outputWeeklyTransportTour: TourDefinition = {
  desktop: [
    {
      title: '📄 週次送迎表ページ',
      description: `
        <p>月単位で<strong>1週間ごとのブロック</strong>に分けた</p>
        <p>送迎表を印刷できるページです。</p>
        <br>
        <p>日次出力は「その日1日分」、</p>
        <p>このページは「1週間ずつまとめ」です。</p>
      `,
    },
    {
      element: '[data-tour="weekly-month-stepper"]',
      title: '① 月の切替',
      description: `
        <p>表示する月を切り替えます。</p>
        <br>
        <p>月内の全週（月曜始まり）が</p>
        <p>自動で分割されて表示されます。</p>
      `,
    },
    {
      title: '② 週ごとの表',
      description: `
        <p>各週ブロックには以下が並びます:</p>
        <br>
        <ul style="margin:0 0 0 18px;">
          <li>日付（月〜日）</li>
          <li>児童名</li>
          <li>送迎場所</li>
          <li>時間</li>
          <li>迎担当 / 送担当</li>
        </ul>
        <br>
        <p>欠席の児童は自動で除外されます。</p>
      `,
    },
    {
      element: '[data-tour="weekly-print"]',
      title: '③ 印刷',
      description: `
        <p>1週間 = <strong>A3 縦 1 ページ</strong>に</p>
        <p>収まるよう最適化されています。</p>
        <br>
        <p>月全体を印刷すると、</p>
        <p>週ごとに改ページされます。</p>
      `,
    },
    {
      title: '💡 運用のコツ',
      description: `
        <p>月末に来月分を印刷して、</p>
        <p>職員の引き継ぎ資料として配布 / 掲示します。</p>
        <br>
        <p>※ 送迎表が<strong>確定済み</strong>の状態で</p>
        <p>印刷するのがおすすめです。</p>
      `,
    },
  ],
  mobile: [
    {
      title: '📄 週次送迎表ページ',
      description: `
        <p>1週間分の送迎表を</p>
        <p>まとめて表示・印刷できます。</p>
        <br>
        <p>印刷用の画面なので</p>
        <p>PC / タブレット推奨。</p>
      `,
    },
    {
      title: '月単位で印刷',
      description: `
        <p>月を選ぶと、</p>
        <p>その月の全週が並びます。</p>
        <br>
        <p>印刷すると週ごとに改ページされます。</p>
      `,
    },
  ],
};

const commentsTour: TourDefinition = {
  desktop: [
    {
      title: '💬 コメント承認ページ',
      description: `
        <p>職員から投稿された</p>
        <p>休み希望やシフトへのコメントを</p>
        <p>管理者が承認・却下するページです。</p>
      `,
      roles: ['admin'],
    },
    {
      element: '[data-tour="comments-list"]',
      title: '承認待ちコメント一覧',
      description: `
        <p>各コメントで選択できるアクション:</p>
        <br>
        <ul style="margin:0 0 0 18px;">
          <li>✅ <strong>承認</strong> — 全員に公開</li>
          <li>❌ <strong>却下</strong> — 非公開のまま</li>
        </ul>
        <br>
        <p>承認されたコメントは</p>
        <p>対象のシフト表 / 休み希望ページに表示されます。</p>
      `,
      roles: ['admin'],
    },
    {
      title: '💡 投稿はどこから？',
      description: `
        <p>職員は各画面のセルから</p>
        <p>コメントを投稿します。</p>
        <br>
        <p>例: 休み希望の日付にコメント追加、</p>
        <p>シフト変更申請に理由を記入、など。</p>
        <br>
        <p>このページでは投稿を<strong>承認する側</strong>の作業を行います。</p>
      `,
      roles: ['admin'],
    },
  ],
  mobile: [
    {
      title: '💬 コメント承認ページ',
      description: `
        <p>職員投稿コメントの</p>
        <p>承認・却下を行う画面です。</p>
        <br>
        <p>管理者専用。</p>
      `,
    },
  ],
};

const settingsTenantTour: TourDefinition = {
  desktop: [
    {
      title: '⚙️ テナント設定ページ',
      description: `
        <p>事業所全体に関わる設定を行います。</p>
        <br>
        <p>主に以下を管理:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>事業所名</li>
          <li>送迎エリア（絵文字マーク）</li>
          <li>最低出勤人数・有資格者ルール</li>
          <li>送迎時間帯のルール</li>
        </ul>
      `,
      roles: ['admin'],
    },
    {
      element: '[data-tour="tenant-areas"]',
      title: '① 送迎エリア（最重要）',
      description: `
        <p>絵文字マークとエリア名を登録します。</p>
        <div style="margin:10px 0; padding:8px; border:1px solid #e5e5e5; border-radius:6px; background:#fafafa; font-size:12px;">
          <div style="padding:4px 6px; border-bottom:1px solid #eee; font-weight:700;">迎のエリア</div>
          <div style="padding:6px;">🔴 南町 / 🔵 北町 / 🟢 中央</div>
          <div style="padding:4px 6px; border-top:1px solid #eee; border-bottom:1px solid #eee; font-weight:700;">送のエリア</div>
          <div style="padding:6px;">🟡 西町 / 🟣 東町</div>
        </div>
        <p>ここで登録したマークが:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>PDFインポートの自動推論</li>
          <li>送迎表の表示</li>
          <li>児童の送迎パターン選択</li>
        </ul>
        <p>全てで使われます。</p>
      `,
      roles: ['admin'],
    },
    {
      title: '② エリアごとの時間設定',
      description: `
        <p>各エリアには以下を紐付けられます:</p>
        <br>
        <ul style="margin:0 0 0 18px;">
          <li><strong>標準時刻</strong> — 児童の送迎時間入力時に自動補完</li>
          <li><strong>住所</strong> — 参考情報として表示</li>
        </ul>
        <br>
        <p>例: 🔴 南町 → 13:20 / 町丁目まで</p>
      `,
      roles: ['admin'],
    },
    {
      element: '[data-tour="tour-reset"]',
      title: '💡 ツアーをもう一度見たいとき',
      description: `
        <p>このボタンで使い方ツアーの</p>
        <p>完了状態を全リセットできます。</p>
        <br>
        <p>次回各ページを開いたときに</p>
        <p>自動でツアーが再表示されます。</p>
        <br>
        <p>新人さんへの説明にも使えます。</p>
      `,
    },
  ],
  mobile: [
    {
      title: '⚙️ テナント設定ページ',
      description: `
        <p>事業所の基本設定を行います。</p>
        <br>
        <p>項目が多いので</p>
        <p>PCからの操作をおすすめします。</p>
      `,
    },
    {
      title: '送迎エリア',
      description: `
        <p>🔴🔵🟢 などの絵文字マークと</p>
        <p>エリア名を登録します。</p>
        <br>
        <p>PDFインポート・送迎表で使われます。</p>
      `,
    },
  ],
};

const settingsStaffTour: TourDefinition = {
  desktop: [
    {
      title: '👥 職員管理ページ',
      description: `
        <p>職員アカウントを管理するページです。</p>
        <br>
        <p>できること:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>新規職員の招待</li>
          <li>権限（admin/editor/viewer）の設定</li>
          <li>デフォルト勤務時間の登録</li>
          <li>対応可能な送迎エリアの紐付け</li>
          <li>退職処理</li>
        </ul>
      `,
      roles: ['admin'],
    },
    {
      element: '[data-tour="staff-invite"]',
      title: '① 職員を招待',
      description: `
        <p>ボタンを押すとモーダルが開き、</p>
        <p>以下を入力して招待メール送信:</p>
        <br>
        <ul style="margin:0 0 0 18px;">
          <li>氏名</li>
          <li>メールアドレス</li>
          <li>権限</li>
          <li>雇用形態・資格の有無</li>
        </ul>
        <br>
        <p>招待された方にメールが届き、</p>
        <p>リンクから初回ログインできます。</p>
      `,
      roles: ['admin'],
    },
    {
      element: '[data-tour="staff-list"]',
      title: '② 職員一覧',
      description: `
        <p>登録済みの職員が表示されます。</p>
        <br>
        <p>行をクリックすると編集モーダルが開き、</p>
        <p>以下を変更できます:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>権限</li>
          <li><strong>デフォルト勤務時間</strong>（シフト編集時の初期値）</li>
          <li>対応可能な送迎エリア</li>
          <li>有資格者フラグ</li>
          <li>表示順</li>
        </ul>
      `,
      roles: ['admin'],
    },
    {
      title: '③ 退職処理',
      description: `
        <p>退職者は<strong>ソフト削除</strong>のみ。</p>
        <p>物理削除はできません。</p>
        <br>
        <p>理由:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>過去のシフト履歴を保全</li>
          <li>出欠記録の「誰が付けたか」を残す</li>
          <li>送迎担当の履歴を保持</li>
        </ul>
        <br>
        <p>退職後はログイン不可・新規配置不可になります。</p>
      `,
      roles: ['admin'],
    },
    {
      title: '💡 勤務時間デフォルト値の連鎖',
      description: `
        <p>ここで設定した勤務時間は</p>
        <p>以下の画面で自動的に使われます:</p>
        <br>
        <ul style="margin:0 0 0 18px;">
          <li>シフト自動生成</li>
          <li>シフト表のセル編集モーダル</li>
          <li>送迎表の「+ シフト追加」モーダル</li>
        </ul>
        <br>
        <p>変更すると<strong>次回以降</strong>に反映されます。</p>
      `,
      roles: ['admin'],
    },
  ],
  mobile: [
    {
      title: '👥 職員管理ページ',
      description: `
        <p>職員の登録・権限設定のページです。</p>
        <br>
        <p>入力項目が多いので</p>
        <p>PCからの操作を推奨します。</p>
      `,
    },
    {
      title: '招待・編集・退職',
      description: `
        <p>できること:</p>
        <ul style="margin:6px 0 0 18px;">
          <li>メールで招待</li>
          <li>権限・勤務時間を編集</li>
          <li>退職処理（ソフト削除）</li>
        </ul>
      `,
    },
  ],
};

const settingsChildrenTour: TourDefinition = {
  desktop: [
    {
      title: '🧒 児童管理',
      description: `
        <p>児童の情報と送迎パターンを</p>
        <p>管理するページです。</p>
      `,
      roles: ['admin', 'editor'],
    },
    {
      element: '[data-tour="children-list"]',
      title: '児童一覧',
      description: `
        <p>編集できる項目:</p>
        <br>
        <ul style="margin:0 0 0 18px;">
          <li>名前 / 学年</li>
          <li>送迎パターン</li>
        </ul>
        <br>
        <p>ここの名前とPDFの名前が一致していると、</p>
        <p>インポートがスムーズになります。</p>
      `,
      roles: ['admin', 'editor'],
    },
  ],
  mobile: [
    {
      title: '🧒 児童管理',
      description: `
        <p>児童の情報管理ページです。</p>
        <br>
        <p>入力項目が多いので PC 推奨。</p>
      `,
    },
  ],
};

export const tours: Record<TourKey, TourDefinition> = {
  global: globalTour,
  dashboard: dashboardTour,
  schedule: scheduleTour,
  shift: shiftTour,
  transport: transportTour,
  request: requestTour,
  'output-daily': outputDailyTour,
  'output-weekly-transport': outputWeeklyTransportTour,
  comments: commentsTour,
  'settings-tenant': settingsTenantTour,
  'settings-staff': settingsStaffTour,
  'settings-children': settingsChildrenTour,
};

/** pathname から TourKey を解決 */
export function resolveTourKey(pathname: string): TourKey | null {
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/schedule')) return 'schedule';
  if (pathname.startsWith('/shift')) return 'shift';
  if (pathname.startsWith('/transport')) return 'transport';
  if (pathname.startsWith('/request')) return 'request';
  if (pathname.startsWith('/output/daily')) return 'output-daily';
  if (pathname.startsWith('/output/weekly-transport')) return 'output-weekly-transport';
  if (pathname.startsWith('/comments')) return 'comments';
  if (pathname.startsWith('/settings/tenant')) return 'settings-tenant';
  if (pathname.startsWith('/settings/staff')) return 'settings-staff';
  if (pathname.startsWith('/settings/children')) return 'settings-children';
  return null;
}
