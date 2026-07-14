# Timeline Project Webapp v4 Password

Versi ini dipakai untuk pengembangan awal tanpa OAuth. Login memakai email + password dari tab `Users` di Google Sheet.

## Fitur

- Next.js + Tailwind CSS
- Google Sheet sebagai database
- Login internal email + password dari sheet `Users`
- Role access: Admin, Manager, Member, Viewer
- Calendar Month, Week, Quarter, Timeline, Gantt
- Kanban, Tasks, Projects, PIC/Team, Pengaturan
- Multi-day task, drag & drop tanggal, workload PIC, deadline alert
- Import/upload data Google Sheet via Apps Script

## Setup lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

Isi `.env.local`:

```env
GOOGLE_SHEET_WEB_APP_URL=https://script.google.com/macros/s/xxxxx/exec
```

## Setup Google Sheet

Upload file `timeline-project-google-sheet-v4-password.xlsx` ke Google Drive, lalu buka sebagai Google Sheet.

Tab utama:

- `Tasks`
- `Projects`
- `PIC`
- `Categories`
- `Statuses`
- `Users`
- `Teams`
- `Settings`

## Struktur Users

| id | email | name | password | role | active | team |
|---|---|---|---|---|---|---|
| u-1 | branding@cpssoft.com | Accurate Branding | admin123 | Admin | TRUE | Multimedia |

Role:

- `Admin`: semua akses, termasuk hapus task dan kelola user
- `Manager`: tambah/edit task, upload ke sheet, kelola master data
- `Member`: tambah/edit task
- `Viewer`: hanya lihat dan export

> Catatan: Untuk development awal, password masih disimpan sebagai plain text di Google Sheet. Jangan gunakan untuk data sensitif. Saat go-live, sebaiknya upgrade ke Google OAuth / NextAuth.

## Setup Apps Script

1. Buka Google Sheet
2. Extensions → Apps Script
3. Replace isi `Code.gs` dengan file `Code.gs` dari folder project ini
4. Run fungsi `test` sekali untuk authorization
5. Deploy → New deployment → Web app
6. Setting:
   - Execute as: Me
   - Who has access: Anyone
7. Copy URL `/exec` ke `.env.local`

## Login Demo

- `admin@example.com` / `admin123`
- `manager@example.com` / `manager123`
- `member@example.com` / `member123`
- `viewer@example.com` / `viewer123`


## Auto Save

Versi ini menyimpan perubahan otomatis ke Google Sheet setelah tambah, edit, hapus, drag/drop task, atau perubahan master data. Tombol **Simpan Manual** tetap tersedia sebagai fallback. Tombol **Refresh dari Google Sheet** digunakan untuk mengambil data terbaru dari Sheet.

Catatan role: Admin, Manager, dan Member dapat memicu auto save. Viewer hanya dapat melihat data.

## Auto Refresh Multi-user

Versi ini juga melakukan auto refresh setiap 15 detik untuk mengambil perubahan terbaru dari Google Sheet. Jadi jika User A menambahkan/edit task, User B akan menerima data terbaru tanpa perlu menekan tombol apa pun.

Catatan teknis:
- Mekanisme ini memakai polling ke endpoint `/api/data` setiap 15 detik.
- Jika user sedang punya perubahan lokal yang belum tersimpan, auto refresh akan ditunda supaya data lokal tidak tertimpa.
- Google Sheet/Apps Script tidak mendukung realtime push seperti WebSocket, jadi polling adalah opsi paling aman dan sederhana untuk fase v4.

## Update v4.1 - Auto Load Users

Pada versi ini halaman login tidak lagi membutuhkan tombol Import Users.
Saat aplikasi pertama dibuka, webapp otomatis melakukan bootstrap data dari Google Sheet:

- Users
- Tasks
- Projects
- PIC
- Categories
- Status
- Settings

Flow baru:

1. Buka webapp.
2. Muncul loading workspace sebentar.
3. Data Users otomatis dimuat dari Google Sheet.
4. User langsung bisa login dengan email + password.

Tombol **Import Users & Data dari Google Sheet** di halaman login sudah dihapus.
Tombol **Refresh dari Google Sheet** tetap tersedia setelah login untuk refresh manual jika dibutuhkan.

## Update: Keamanan Password & Penyimpanan Per-Baris (v1.2.0)

### Keamanan password
- Password kini di-**hash** (salted SHA-256 + iterasi) di Apps Script dan **tidak pernah dikirim ke browser**. Endpoint `read` hanya mengembalikan `hasPassword: true/false`.
- **Login diverifikasi di server** lewat `action=login`. Password lama yang masih plaintext di sheet akan **otomatis di-upgrade ke hash** saat login pertama yang berhasil (tidak perlu migrasi manual).
- Tambahkan **shared token** agar Web App tidak bisa dipanggil sembarang orang:
  1. Di project Apps Script: **Project Settings → Script Properties → Add** → key `API_TOKEN`, value = string acak.
  2. Di `.env.local` Next.js: `SHEET_API_TOKEN=` diisi nilai yang sama.
  - Jika `API_TOKEN` belum diset, endpoint tetap jalan (mode dev). Set untuk produksi.

### Penyimpanan per-baris (bukan overwrite total)
- Perubahan task memakai `upsertTask` / `deleteTask` (hanya baris terkait), memakai `LockService` untuk mencegah tulis bersamaan yang saling menimpa.
- User dikelola per-baris via `upsertUser` / `deleteUser`. Mengubah role/nama/aktif **tidak** menghapus hash password (password hanya berubah bila field password diisi).
- Master data (projects/PIC/kategori/status/settings) disimpan via `writeMeta` (debounce), tidak menyentuh Tasks maupun Users.
- Tombol **Sinkron Penuh** memakai `writeAll` yang kini aman: menulis ulang Tasks + master data, **tanpa menyentuh tab Users**.

### Langkah deploy Apps Script
1. Paste `Code.gs` baru.
2. Jalankan sekali `ensureSheets` (atau `test`) untuk memastikan header terbaru (kolom `statusMode` di Tasks).
3. Set Script Property `API_TOKEN` (disarankan).
4. **Deploy → Manage deployments → Edit → New version**.

## Update: Rename PIC, Chip Timeline, Reminder Finance (v1.3.0)

- **Rename PIC** dari menu PIC / Team otomatis memperbarui seluruh task milik PIC tersebut (bulk update satu kolom di sheet, aksi `renamePic`).
- **Chip di card Timeline**: chip "Attachment" (klik membuka link) muncul jika task punya link; chip "Finance" muncul untuk task berkategori Finance.
- **Reminder email task Finance (H-3, H-2, H-1, Hari-H)**:
  1. Tambahkan kategori `Finance` di Pengaturan (jika belum ada).
  2. Isi **Email Notifikasi Finance** di Pengaturan (boleh lebih dari satu, pisahkan koma).
  3. Di Apps Script: **Triggers (ikon jam) → Add Trigger** → function `sendFinanceReminders` → Time-driven → Day timer → pilih jam (mis. 7–8 pagi).
  - Setiap hari, task Finance yang deadline-nya 0–3 hari lagi (belum Done/Canceled) dikirim sebagai satu email rekap, dikelompokkan H-3 / H-2 / H-1 / Hari-H. Pengirim adalah akun Google pemilik Apps Script (kuota MailApp harian berlaku).

## Update v1.4.0
- Perbaikan skala 80%: pindah dari `zoom` ke root font-size (rem) — sidebar tidak lagi terpotong.
- Card PIC didesain ulang: 5 kolom, foto penuh dengan gradient, nama lebih besar, chip role berwarna.
- Drawer Detail Task menutup otomatis saat pindah ke Projects/PIC/Pengaturan, klik di luar drawer, atau tekan Escape.
- Lonceng notifikasi di header: task Finance (H-3 s/d Hari-H) + semua task yang berjalan hari ini. Badge merah untuk yang belum dibaca; bunyi "ting-nong" berulang tiap 30 menit selama belum dibuka. Suara bisa dimatikan di Pengaturan (checkbox di kartu Workspace).
- Kartu Workspace di Pengaturan kini terkunci; ubah lewat tombol Edit → Simpan/Batal.

## Update v1.6.0 — Dashboard lanjutan
- Kolom baru Projects: `actualCost` (Realisasi Biaya). Deploy Code.gs → jalankan `ensureSheets` sekali → New Version.
- Dashboard tambah: On-Time Delivery rate, Budget vs Realisasi, Rata-rata Durasi Task per Kategori, dan tombol Export PDF (via window.print, hanya area dashboard).
- Scrollbar horizontal Quarter & Kanban dipindah ke atas.
- On-time delivery memakai `updatedAt` sebagai proxy tanggal selesai (task Done dianggap tepat waktu bila terakhir diubah <= deadline).

## Update v1.7.0 — Asisten AI (Gemini) di panel kanan
- Kolom kanan yang tadinya kosong kini berisi **Asisten Timeline**: chat AI yang menjawab seputar data aplikasi (project, task, budget, realisasi, PIC, output, progress). Membuka Detail Task akan meng-overlay panel ini.
- Riwayat percakapan disimpan lokal per user (localStorage); tombol hapus untuk mengosongkan.
- Data dikirim ke Google Gemini API lewat route server `/api/chat` (API key tidak pernah sampai ke browser).

### Aktivasi
1. Ambil API key gratis di https://aistudio.google.com/apikey
2. Di Vercel → Environment Variables → tambah `GEMINI_API_KEY` = key tsb (Production & Preview). Opsional `GEMINI_MODEL` (default `gemini-2.0-flash`).
3. Redeploy.

Catatan privasi: ringkasan data project/task/budget dikirim ke Gemini saat user bertanya. Pastikan sesuai kebijakan data perusahaan. Jika `GEMINI_API_KEY` belum diset, panel tetap tampil tapi memberi pesan bahwa fitur belum aktif.


## Update v1.8.0 — Asisten AI fleksibel (default Groq, tanpa kartu)
Route `/api/chat` kini generik (format OpenAI-compatible), bisa pindah provider lewat env tanpa ubah kode.

Default: **Groq** — gratis, tanpa kartu kredit (~1.000 request/hari).
1. Buat API key di https://console.groq.com/keys (mulai `gsk_`).
2. Di Vercel → Environment Variables:
   - `AI_PROVIDER` = `groq`
   - `AI_API_KEY` = key Groq
   - (opsional) `AI_MODEL` = kosongkan untuk default `llama-3.3-70b-versatile`. Jika model dinonaktifkan Groq, coba `openai/gpt-oss-20b` atau `llama-3.1-8b-instant`.
3. Redeploy.

Pindah provider kapan saja tanpa ubah kode: set `AI_PROVIDER` ke `openai` / `openrouter` / `gemini` dan isi `AI_API_KEY` yang sesuai (base URL & model default otomatis mengikuti; bisa dioverride via `AI_BASE_URL` / `AI_MODEL`). Variabel `GEMINI_API_KEY` lama tetap dikenali sebagai fallback bila `AI_PROVIDER=gemini`.
