'use client';

type Status = 'empty' | 'incomplete' | 'complete';

type Props = {
  status: Status;
  /** 対象月ラベル（tooltip 用） */
  month?: string;
  compact?: boolean;
};

const CONFIG: Record<Status, { label: string; bg: string; color: string; border: string; icon: string }> = {
  empty: {
    label: '未着手',
    bg: 'var(--bg)',
    color: 'var(--ink-3)',
    border: 'var(--rule)',
    icon: '◌',
  },
  incomplete: {
    label: '未完成',
    bg: 'rgba(212,160,23,0.1)',
    color: 'var(--gold, #b8860b)',
    border: 'var(--gold, #d4a017)',
    icon: '◔',
  },
  complete: {
    label: '完成',
    bg: 'rgba(47,143,87,0.08)',
    color: 'var(--green, #2f8f57)',
    border: 'var(--green, #2f8f57)',
    icon: '●',
  },
};

export default function MonthStatusBadge({ status, month, compact }: Props) {
  const c = CONFIG[status];
  const title = month ? `${month}: ${c.label}` : c.label;
  return (
    <span
      className="inline-flex items-center gap-1 rounded font-semibold whitespace-nowrap"
      style={{
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        fontSize: compact ? '0.7rem' : '0.75rem',
        padding: compact ? '2px 6px' : '3px 8px',
      }}
      title={title}
    >
      <span aria-hidden>{c.icon}</span>
      {c.label}
    </span>
  );
}
