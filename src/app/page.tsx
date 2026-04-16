export default function Home() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-6"
      style={{ background: 'var(--bg)' }}
    >
      <h1
        className="text-3xl font-bold"
        style={{ color: 'var(--ink)' }}
      >
        ShiftPuzzle
      </h1>
      <p
        className="text-base"
        style={{ color: 'var(--ink-2)' }}
      >
        放課後等デイサービス向け 送迎・シフト半自動生成SaaS
      </p>
      <div className="flex gap-3 mt-4">
        <button
          className="px-6 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
          style={{
            background: 'var(--accent)',
            borderRadius: '4px',
          }}
        >
          ログイン
        </button>
        <button
          className="px-6 py-2 text-sm font-semibold transition-all hover:-translate-y-0.5"
          style={{
            background: 'transparent',
            color: 'var(--ink-2)',
            border: '1px solid var(--rule-strong)',
            borderRadius: '4px',
          }}
        >
          詳しく見る
        </button>
      </div>
    </main>
  );
}
