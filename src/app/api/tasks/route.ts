import { NextResponse } from 'next/server';
const url = process.env.GOOGLE_SHEET_WEB_APP_URL;
export async function GET() {
  if (!url) return NextResponse.json({ message: 'GOOGLE_SHEET_WEB_APP_URL belum diisi di .env.local' }, { status: 500 });
  const res = await fetch(`${url}?action=read`, { cache: 'no-store', redirect: 'follow' });
  const text = await res.text();
  try { return NextResponse.json(JSON.parse(text)); } catch { return NextResponse.json({ message: 'Apps Script tidak mengembalikan JSON.', preview: text.slice(0,300) }, { status: 502 }); }
}
