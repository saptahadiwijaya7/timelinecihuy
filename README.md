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
