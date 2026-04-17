import { NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/auth/getCurrentStaff';

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ staff: null }, { status: 200 });
  return NextResponse.json({ staff });
}
