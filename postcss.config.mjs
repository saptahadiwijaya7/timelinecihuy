# URL Web App Apps Script (deploy sebagai Web App, Execute as: Me, Who has access: Anyone)
GOOGLE_SHEET_WEB_APP_URL=https://script.google.com/macros/s/xxxxx/exec

# Token rahasia bersama antara Next.js dan Apps Script (opsional tapi SANGAT disarankan).
# Isi nilai acak yang sama di sini DAN di Script Properties Apps Script dengan key: API_TOKEN
SHEET_API_TOKEN=

# ===== Asisten AI (default: Groq — gratis, tanpa kartu kredit) =====
# Buat key di https://console.groq.com/keys (mulai dengan gsk_)
AI_PROVIDER=groq
AI_API_KEY=
# Opsional override model. Default groq: llama-3.3-70b-versatile
# Alternatif bila model dinonaktifkan: openai/gpt-oss-20b atau llama-3.1-8b-instant
AI_MODEL=
# Opsional: AI_BASE_URL untuk provider OpenAI-compatible lain.
# Provider lain: openai | openrouter | gemini (tinggal ganti AI_PROVIDER + AI_API_KEY)
