import { NextResponse } from 'next/server';

const url = process.env.GOOGLE_SHEET_WEB_APP_URL;
const token = process.env.SHEET_API_TOKEN || '';

async function readTextSafely(res: Response) {
  const text = await res.text();
  try { return { json: JSON.parse(text), text }; } catch { return { json: null, text }; }
}

export async function GET() {
  if (!url) return NextResponse.json({ message: 'GOOGLE_SHEET_WEB_APP_URL belum diisi di .env.local' }, { status: 500 });
  try {
    const res = await fetch(`${url}?action=read&token=${encodeURIComponent(token)}`, { cache: 'no-store', redirect: 'follow' });
    const { json, text } = await readTextSafely(res);
    if (!json) return NextResponse.json({ message: 'Apps Script tidak mengembalikan JSON. Cek URL /exec, deployment Anyone, dan Code.gs.', preview: text.slice(0, 300) }, { status: 502 });
    return NextResponse.json(json, { status: res.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Gagal membaca Google Sheet' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!url) return NextResponse.json({ message: 'GOOGLE_SHEET_WEB_APP_URL belum diisi di .env.local' }, { status: 500 });
  try {
    const body = await req.json();
    // Token disuntik di server; browser tidak pernah melihatnya. Action diteruskan apa adanya.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, token }),
      redirect: 'follow'
    });
    const { json, text } = await readTextSafely(res);
    if (!json) return NextResponse.json({ message: 'Apps Script tidak mengembalikan JSON saat menyimpan.', preview: text.slice(0, 300) }, { status: 502 });
    return NextResponse.json(json, { status: res.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Gagal menyimpan ke Google Sheet' }, { status: 500 });
  }
}
