import { NextResponse } from 'next/server';

/**
 * Asisten AI — route generik OpenAI-compatible (chat/completions).
 * Bisa dipindah provider lewat environment variable, tanpa ubah kode:
 *   AI_PROVIDER = groq | openai | openrouter | gemini   (default: groq)
 *   AI_API_KEY  = kunci API provider terpilih
 *   AI_MODEL    = (opsional) override nama model
 *   AI_BASE_URL = (opsional) override base URL bila pakai provider lain yang OpenAI-compatible
 * Fallback kunci: GROQ_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY / GEMINI_API_KEY.
 */

type ProviderCfg = { base: string; model: string; keys: string[] };
const PROVIDERS: Record<string, ProviderCfg> = {
  groq: { base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keys: ['AI_API_KEY', 'GROQ_API_KEY'] },
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keys: ['AI_API_KEY', 'OPENAI_API_KEY'] },
  openrouter: { base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct', keys: ['AI_API_KEY', 'OPENROUTER_API_KEY'] },
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', keys: ['AI_API_KEY', 'GEMINI_API_KEY'] }
};

const BEHAVIOR = `Kamu adalah asisten untuk aplikasi manajemen project internal bernama "Timeline Project" milik tim multimedia.
Fokus utamamu menjawab pertanyaan seputar DATA aplikasi: project, task, status, deadline, PIC/tim, requester, budget & realisasi, output konten, distribusi, lokasi, dan progress.
Aturan:
- Untuk pertanyaan soal project/task/budget/PIC/requester, jawab berdasarkan DATA APLIKASI di bawah. Jangan pernah mengarang angka atau nama yang tidak ada di data; jika memang tidak ada, katakan terus terang.
- Untuk pertanyaan umum atau seputar produk Accurate (mis. cara pakai fitur akuntansi), kamu BOLEH menjawab dari pengetahuan umummu. Namun bila kamu tidak yakin atau faktanya bisa berubah, katakan terus terang dan sarankan pengguna mengecek dokumentasi resmi di help.accurate.id — jangan mengada-ada detail spesifik.
- Bedakan dengan jelas mana jawaban yang berasal dari DATA APLIKASI dan mana yang dari pengetahuan umum.
- Jawab dalam Bahasa Indonesia, cukup lengkap tapi tidak bertele-tele. Boleh pakai poin.
- Format nominal sebagai Rupiah bila menyebut budget.`;

export async function POST(req: Request) {
  const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  const cfg = PROVIDERS[provider] || PROVIDERS.groq;
  const key = cfg.keys.map((k) => process.env[k]).find(Boolean) || '';
  const base = process.env.AI_BASE_URL || cfg.base;
  const model = process.env.AI_MODEL || cfg.model;
  if (!key) return NextResponse.json({ message: `API key untuk provider "${provider}" belum diset di environment Vercel (AI_API_KEY). Tambahkan lalu redeploy.` }, { status: 400 });
  try {
    const { messages, context } = await req.json();
    const history = (messages || [])
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m: any) => ({ role: m.role, content: String(m.content) }));
    if (!history.length) return NextResponse.json({ message: 'Tidak ada pesan.' }, { status: 400 });
    const payload = {
      model,
      messages: [{ role: 'system', content: `${BEHAVIOR}\n\n===== DATA APLIKASI =====\n${context || '(tidak ada data)'}` }, ...history],
      temperature: 0.3,
      max_tokens: 2048
    };
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ message: data?.error?.message || `Error dari ${provider} (${res.status})` }, { status: 502 });
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return NextResponse.json({ message: 'Jawaban kosong atau diblokir. Coba pertanyaan lain.' }, { status: 502 });
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Gagal memproses' }, { status: 500 });
  }
}
