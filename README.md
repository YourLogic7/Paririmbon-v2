# Paririmbon

Paririmbon adalah knowledge management system untuk pengetahuan produk dan panduan kerja pegawai. Monorepo ini berisi antarmuka Vite + React di `apps/web` dan REST API Express + MongoDB di `apps/api`; API juga tersedia sebagai Vercel Function melalui `api/[...route].js`.

## Jalankan lokal

```bash
npm install
npm run dev
```

Vite berjalan di `http://localhost:5173`, API di `http://localhost:3001`. Salin `.env.example` ke `.env` dan isi `MONGODB_URI`, `ADMIN_PASSWORD`, serta `JWT_SECRET`. `JWT_SECRET` harus berupa rahasia acak dengan panjang minimal 32 karakter. Pegawai masuk menggunakan ID dan kata sandi yang dibuat admin; admin masuk hanya menggunakan `ADMIN_PASSWORD`. Setelah masuk, admin dapat membuat akun satu per satu atau mengimpor file Excel `.xlsx` berisi kolom **Nama Pegawai**, **User ID**, dan **Password** (maksimal 200 akun per impor; kata sandi minimal 8 karakter). Template Excel tersedia di menu **Kelola akun**. ID yang sudah terdaftar dilewati dan dilaporkan. Admin juga dapat menghapus dan mengatur ulang kata sandi akun serta memantau status online. Status online diperbarui setiap 5 detik, langsung offline saat keluar, dan dianggap offline setelah 45 detik tanpa aktivitas. Login dan akses konten memerlukan API serta MongoDB yang terkonfigurasi.

## Fitur

- Buku digital dengan sampul yang dapat dibuka/tutup, daftar isi, pencarian, navigasi halaman, dan tata letak responsif.
- Login wajib untuk membuka aplikasi. Pegawai hanya dapat membaca pengetahuan dan menggunakan pemeriksa bad tiket; admin dapat mengelola akun tim, memantau status online, serta menyunting isi buku dan konfigurasi.
- Pemeriksa bad tiket memvalidasi KIP, case pelanggan, jenis kendala, dan status ONU terhadap kombinasi yang disetujui. Pada editor aturan, **“all jenis kendala”** mencocokkan Fisik maupun Logik; opsi pemeriksa pegawai tetap hanya Fisik dan Logik. Status ONU **“Tidak ada keterangan ONU ketika pelaporan”** otomatis menghasilkan rekomendasi bad tiket mandatory, sedangkan status dengan hashtag **#NOACS** tidak dianggap bad tiket. Admin dapat menyunting daftar dropdown serta mengatur redaksi rekomendasi, source link KMS, dan hashtag (`#salah_kategori`, `#salah_tujuan`, `#mandatori_tidak_lengkap`, `#non_eskalasi`) di setiap aturan dari menu **Edit bad tiket**. Seluruh konfigurasi disimpan di MongoDB dan API mengirim konfigurasi yang sama ke halaman pemeriksa pegawai.
- REST API: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/presence`, `POST /api/auth/logout`, `GET /api/entries`, `GET /api/bad-ticket-config`, `POST /api/assist` (semuanya perlu login); `GET/POST /api/admin/accounts`, `POST /api/admin/accounts/import`, `PUT /api/admin/accounts/:id/password`, `DELETE /api/admin/accounts/:id`, `POST /api/entries`, `PUT/DELETE /api/entries/:id`, dan `PUT /api/bad-ticket-config` (khusus admin); `GET /api/health`.

## Deploy ke Vercel

Impor repository ke Vercel dari direktori root monorepo, lalu tambahkan environment variables `MONGODB_URI`, `ADMIN_PASSWORD`, dan `JWT_SECRET` di project settings untuk setiap environment yang digunakan. Vercel menggunakan `vercel.json` untuk membangun `apps/web/dist` dan menyajikan API dari direktori root `api/`. Saat pertama kali API membaca database kosong, halaman contoh akan disalin ke MongoDB. Pastikan MongoDB Atlas mengizinkan koneksi dari deployment Vercel. Setelah menambahkan environment variables, redeploy project.

## Pemeriksaan

```bash
npm run lint
npm run build
```
