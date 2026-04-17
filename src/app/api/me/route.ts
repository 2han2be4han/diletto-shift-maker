import { NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/auth/getCurrentStaff';
import { isOnDutyAdmin } from '@/lib/auth/isOnDutyAdmin';

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ staff: null }, { status: 200 });
  const on_duty_admin = await isOnDutyAdmin(staff);
  return NextResponse.json({ staff, on_duty_admin });
}
