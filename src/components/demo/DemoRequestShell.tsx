'use client';

/**
 * デモモード用 /request シェル（admin ビュー固定）。
 *
 * デモ staff は admin 扱いなので AdminRequestList を表示。
 * fetch は /api/staff / /api/shift-requests から行い、既存の client コンポーネントにそのまま渡す。
 */

import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import MonthStepper from '@/components/ui/MonthStepper';
import Badge from '@/components/ui/Badge';
import AdminRequestList from '@/components/request/AdminRequestList';
import ShiftChangeRequestSection from '@/components/request/ShiftChangeRequestSection';
import RequestPrintButton from '@/components/request/PrintButton';
import { DEMO_STAFF_ID_ME } from '@/lib/demo/seedData';
import type { ShiftRequestRow, StaffRow } from '@/types';

type Props = {
  targetMonth: string;
};

export default function DemoRequestShell({ targetMonth }: Props) {
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [requests, setRequests] = useState<ShiftRequestRow[]>([]);

  const { defaultMonth, target } = useMemo(() => {
    const now = new Date();
    const dm = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [ty, tm] = targetMonth.split('-').map(Number);
    return {
      defaultMonth: `${dm.getFullYear()}-${String(dm.getMonth() + 1).padStart(2, '0')}`,
      target: new Date(ty, tm - 1, 1),
    };
  }, [targetMonth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sRes, rRes] = await Promise.all([
          fetch('/api/staff'),
          fetch(`/api/shift-requests?month=${targetMonth}`),
        ]);
        const sJson = (await sRes.json()) as { staff?: StaffRow[] };
        const rJson = (await rRes.json()) as { requests?: ShiftRequestRow[] };
        if (cancelled) return;
        setStaffList(sJson.staff ?? []);
        setRequests(rJson.requests ?? []);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetMonth]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="休み希望" actions={<RequestPrintButton />} />

      <div className="px-6 pt-3">
        <div className="max-w-7xl mx-auto w-full">
          <MonthStepper defaultMonth={defaultMonth} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
              {target.getFullYear()}年{target.getMonth() + 1}月分
            </h2>
            <Badge variant="info">管理者ビュー（デモ）</Badge>
          </div>

          <AdminRequestList staff={staffList} initialRequests={requests} targetMonth={targetMonth} />
          <ShiftChangeRequestSection myStaffId={DEMO_STAFF_ID_ME} />
        </div>
      </div>
    </div>
  );
}
