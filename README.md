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

## Update v1.9.0 — Integrasi Google Calendar (task kategori "Meeting")
Task berkategori "Meeting" otomatis dibuatkan event di kalender khusus **"Timeline Meetings"** (dibuat sekali otomatis).
- Judul = judul task, tanggal/jam = data task (bila jam kosong: default 10:00, durasi 1 jam).
- Undangan = email PIC (dari data PIC/User) + field "Invite" manual per task. Tamu menerima email undangan.
- Edit task → event ikut diperbarui; hapus task → event ikut terhapus.
- Link Google Meet: dibuat otomatis **bila** Advanced Calendar Service aktif; jika tidak, event tetap dibuat tanpa Meet.

### Setup (tanpa Google Cloud Console)
1. Paste `Code.gs` baru → jalankan `ensureSheets` sekali (menambah kolom `invite`, `meetLink`, `calendarEventId` di Tasks). Saat dijalankan pertama, Google akan meminta izin akses **Calendar** — setujui.
2. **New Version** deployment.
3. (Opsional, untuk link Meet otomatis) Di editor Apps Script: **Services (+) → Google Calendar API → Add**. Ini toggle di editor, bukan Cloud Console. Bila diblokir admin Workspace, lewati saja — event tetap jalan tanpa Meet.
4. Isi email PIC di menu PIC / Team agar bisa diundang.

Catatan: karena scope Calendar baru ditambahkan, pemilik Apps Script perlu menjalankan sekali fungsi apa pun di editor untuk memicu layar izin, lalu redeploy.

## Update v1.10.0
- Undangan Meeting: default mengundang SEMUA PIC (menu PIC/Team) yang punya email. Kolom "Invite" pada task kini khusus untuk orang di luar menu PIC.
- Jam mulai/selesai jadi dropdown kelipatan 15 menit (gaya Google Calendar).
- Perbaikan keandalan penyimpanan: auto-refresh 20 detik kini ditunda saat ada modal terbuka, saat penyimpanan master data pending, dan selama 8 detik setelah editan terakhir — mencegah data editan tertimpa sebelum sempat tersimpan.

## Update v1.11.0 — Perbaikan data master hilang (PENTING)
Penyebab: master data (status, kategori, requester, email notifikasi finance, settings) sebelumnya disimpan lewat debounce 900ms yang bisa gagal menang balapan dengan auto-refresh, sehingga penyimpanan ke Sheet tidak terjadi dan data editan tertimpa data lama.
Perbaikan: master data kini disimpan LANGSUNG saat tombol ditekan (Tambah/hapus chip, Simpan Workspace), mengirim nilai baru secara eksplisit. Tidak ada lagi debounce.
Ini perubahan frontend saja (page.tsx) — cukup push ke GitHub/Vercel, tidak perlu redeploy Apps Script.

## Update v1.12.0 — Perbaikan item terhapus "muncul lagi"
Penyebab: auto-refresh bisa membaca data server tepat sebelum penghapusan terkonfirmasi, lalu menimpa balik data lokal sehingga item yang dihapus muncul kembali.
Perbaikan:
- Auto-refresh kini ditahan selama ada permintaan tulis yang belum selesai (penghitung in-flight), bukan lagi mengandalkan jeda waktu tetap.
- "Tombstone": task/PIC/user/project yang baru dihapus disaring dari data server sampai server benar-benar mengkonfirmasi item itu hilang — mencegah kemunculan kembali akibat data server yang sempat basi.
Perubahan frontend saja (page.tsx). Cukup push ke Vercel.

## Update v1.13.0
- Google Calendar: akun pemilik Apps Script tidak lagi diundang sebagai tamu ke event Meeting, sehingga event tidak muncul dobel (satu di kalender "Timeline Meetings", satu tersalin ke kalender utama pemilik). Perlu redeploy Code.gs (New Version).
- Tombol login menampilkan animasi loading (spinner + "Memverifikasi…") dan nonaktif sementara selama proses login.

## Update v1.14.0 — Mobile & hamburger
- Sidebar kini berfungsi sebagai drawer geser di mobile: tap hamburger untuk membuka, tap area gelap (backdrop) atau tombol ✕ untuk menutup, dan menu otomatis tertutup saat memilih halaman.
- Isi sidebar (nav + filter) bisa di-scroll pada layar pendek; tombol Refresh/Sinkron tetap di bawah.
- Header lebih ringkas di mobile (subjudul & tombol Export disembunyikan di layar kecil), KPI jadi 2 kolom di mobile.
- Desktop tidak berubah (sidebar tetap menetap, hamburger hanya muncul di mobile). Perubahan frontend saja.

## Update v1.15.0 — Mobile lanjutan
- Menu Pengaturan: daftar Users tidak lagi geser horizontal di mobile — tabel diganti kartu bertumpuk yang responsif; form tambah user menumpuk rapi di layar kecil.
- Asisten AI kini tersedia di mobile sebagai bottom sheet: tombol mengambang (pojok kanan bawah) untuk membuka, geser/tap area gelap atau tombol ✕ untuk menutup. Di desktop tetap menetap di kolom kanan.

## Update v1.16.0 — Search & toolbar Kalender mobile
- Search: di mobile kini berupa ikon 🔍 di header yang membuka kolom cari (dropdown di bawah header) dengan tombol tutup; di desktop tetap kolom cari biasa.
- Toolbar Kalender responsif: kontrol menumpuk rapi di layar kecil, deretan tombol view bisa di-scroll horizontal bila sempit, tombol "Tambah Task" tetap mudah dijangkau.

## Update v1.17.0 — PWA (installable ke homescreen)
Aplikasi kini bisa dipasang ke homescreen HP (Android/iOS) sebagai PWA.
- Ditambahkan: `src/app/manifest.ts` (menghasilkan /manifest.webmanifest), ikon `public/icon-192.png`, `icon-512.png`, `icon-maskable.png`, `apple-touch-icon.png`, service worker `public/sw.js`, dan registrasi `src/app/pwa-register.tsx` di layout.
- Service worker memakai strategi network-first untuk navigasi & data (anti-basi) dan cache-first hanya untuk aset ber-hash — jadi update tetap masuk normal, tapi app tetap tahan saat koneksi putus.

### Cara install
- Android (Chrome): buka situs → menu ⋮ → "Add to Home screen" / akan muncul prompt "Install".
- iOS (Safari): tombol Share → "Add to Home Screen".
Syarat sudah terpenuhi otomatis: HTTPS (Vercel) + manifest + service worker.

Catatan: PWA aktif setelah kunjungan pertama pasca-deploy (service worker terdaftar saat load). Lakukan hard reload sekali setelah deploy.

## Update v1.18.0 — Multi-PIC & kolom email_pic
- Task kini bisa punya lebih dari satu PIC. Field PIC tetap tampil seperti dropdown, tapi saat dibuka menampilkan daftar nama PIC dengan checkbox untuk memilih beberapa sekaligus (disimpan sebagai daftar dipisah koma). Filter, dashboard workload, PIC/Team, dan rename PIC sudah menyesuaikan (cocok bila salah satu PIC pada task sama).
- Kolom baru `email_pic` di sheet Tasks: otomatis terisi email semua PIC terpilih saat task disimpan (di-resolve dari email PIC/User), untuk sinkronisasi ke aplikasi lain (mis. beranda cihuy).
- SCHEMA berubah → paste Code.gs baru, jalankan `ensureSheets` sekali (menambah kolom email_pic), lalu New Version. Isi email tiap PIC di menu PIC / Team agar email_pic terisi.

## Update v1.19.0 — Fix drawer Detail Task saat scroll
Drawer Detail Task di desktop kini menempel (sticky) ke viewport seperti panel asisten, jadi tidak lagi "tertinggal" di atas saat daftar (mis. Timeline panjang) di-scroll ke bawah. Isi drawer diberi ruang bawah agar tidak tertutup tombol Edit/Hapus. Frontend saja.

## Update v1.20.0 — Popover "lihat semua" event kalender
Di tampilan Bulan, hari dengan event lebih banyak dari yang muat kini menampilkan "+N lagi" yang bisa diklik → muncul popover berisi SEMUA event hari itu (bisa di-scroll, tiap event diklik untuk buka detail). Popover dirender via portal + posisi pintar (buka ke atas bila sel di bagian bawah layar) sehingga tidak terpotong. Frontend saja.
