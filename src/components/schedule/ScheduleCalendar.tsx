'use client';

import { useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventContentArg, DateClickArg } from '@fullcalendar/core';

/**
 * 利用予定カレンダー
 * - 各日付セルに利用児童名を全員表示
 * - 右下に利用人数バッジ
 * - 日付クリックで編集モーダルを開く
 */

export type ScheduleDay = {
  date: string; // YYYY-MM-DD
  children: { id: string; name: string; pickup_time: string | null; dropoff_time: string | null }[];
};

type ScheduleCalendarProps = {
  scheduleData: ScheduleDay[];
  onDateClick: (date: string) => void;
  currentMonth: string; // YYYY-MM
  onMonthChange: (month: string) => void;
};

export default function ScheduleCalendar({
  scheduleData,
  onDateClick,
  currentMonth,
  onMonthChange,
}: ScheduleCalendarProps) {
  /* ScheduleDay[] → FullCalendarのevents形式に変換 */
  const events = useMemo(() => {
    return scheduleData.map((day) => ({
      id: day.date,
      start: day.date,
      allDay: true,
      extendedProps: {
        children: day.children,
        count: day.children.length,
      },
    }));
  }, [scheduleData]);

  /* 各日付セルのカスタム表示 */
  const renderEventContent = (arg: EventContentArg) => {
    const kids = arg.event.extendedProps.children as ScheduleDay['children'];
    const count = arg.event.extendedProps.count as number;

    return (
      <div className="w-full px-1 py-0.5">
        {/* 児童名リスト */}
        <div className="flex flex-col gap-0">
          {kids.map((child) => (
            <span
              key={child.id}
              className="text-xs truncate block"
              style={{ color: 'var(--ink-2)', lineHeight: '1.4' }}
            >
              {child.name}
            </span>
          ))}
        </div>
        {/* 人数バッジ */}
        {count > 0 && (
          <div className="flex justify-end mt-0.5">
            <span
              className="text-xs font-semibold px-1.5 py-0.5"
              style={{
                background: 'var(--accent-pale)',
                color: 'var(--accent)',
                borderRadius: '4px',
                fontSize: '0.7rem',
              }}
            >
              {count}名
            </span>
          </div>
        )}
      </div>
    );
  };

  const handleDateClick = (info: DateClickArg) => {
    onDateClick(info.dateStr);
  };

  const handleDatesSet = (arg: { start: Date }) => {
    /* FullCalendarの表示月が変わった時にstateを更新 */
    const year = arg.start.getFullYear();
    const month = String(arg.start.getMonth() + 1).padStart(2, '0');
    onMonthChange(`${year}-${month}`);
  };

  return (
    <div
      className="schedule-calendar"
      style={{
        /* FullCalendarのデフォルトスタイルをdilettoトークンで上書き */
        ['--fc-border-color' as string]: 'var(--rule)',
        ['--fc-page-bg-color' as string]: 'var(--white)',
        ['--fc-today-bg-color' as string]: 'var(--accent-pale)',
        ['--fc-event-bg-color' as string]: 'transparent',
        ['--fc-event-border-color' as string]: 'transparent',
        ['--fc-event-text-color' as string]: 'var(--ink)',
      }}
    >
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        initialDate={`${currentMonth}-01`}
        locale="ja"
        headerToolbar={{
          left: 'prev',
          center: 'title',
          right: 'next',
        }}
        titleFormat={{ year: 'numeric', month: 'long' }}
        height="auto"
        events={events}
        eventContent={renderEventContent}
        dateClick={handleDateClick}
        datesSet={handleDatesSet}
        dayMaxEvents={false}
        fixedWeekCount={false}
      />
    </div>
  );
}
