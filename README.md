# Paririmbon

Paririmbon adalah knowledge management system untuk pengetahuan produk dan panduan kerja pegawai. Monorepo ini berisi antarmuka Vite + React di `apps/web` dan REST API Express + MongoDB di `apps/api`; API juga tersedia sebagai Vercel Function melalui `api/[...route].js`.

## Jalankan lokal

```bash
npm install
npm run dev
```

Vite berjalan di `http://localhost:5173`, API di `http://localhost:3001`. Salin `.env.example` ke `.env` dan isi `MONGODB_URI`, `ADMIN_PASSWORD`, serta `JWT_SECRET` untuk mengaktifkan persistensi database dan login admin. `JWT_SECRET` harus berupa rahasia acak dengan panjang minimal 32 karakter. Tanpa konfigurasi MongoDB, buku tetap bisa dicoba dengan data contoh yang disimpan di browser. Untuk mode demo admin lokal, gunakan kata sandi `admin123` saat menjalankan Vite dalam mode development; mode ini tidak aktif pada production.

## Fitur

- Buku digital dengan sampul yang dapat dibuka/tutup, daftar isi, pencarian, navigasi halaman, dan tata letak responsif.
- Admin dapat menambah, menyunting, dan menghapus halaman. Perubahan admin tersimpan ke MongoDB melalui API; bila API tidak tersedia, UI memberi tahu bahwa perubahan hanya tersimpan pada perangkat ini.
- AI Assist memberi langkah rekomendasi dan panduan terkait berdasarkan situasi dan kondisi yang dipilih. Rekomendasi awal menggunakan aturan dan pengetahuan buku (bukan panggilan ke model AI eksternal).
- REST API: `GET /api/entries`, `POST /api/auth/login`, `POST /api/entries`, `PUT /api/entries/:id`, `DELETE /api/entries/:id`, `POST /api/assist`, `GET /api/health`.

## Deploy ke Vercel

Impor repository ke Vercel dari direktori root monorepo, lalu tambahkan environment variables `MONGODB_URI`, `ADMIN_PASSWORD`, dan `JWT_SECRET` di project settings untuk setiap environment yang digunakan. Vercel menggunakan `vercel.json` untuk membangun `apps/web/dist` dan menyajikan API dari direktori root `api/`. Pastikan MongoDB Atlas mengizinkan koneksi dari deployment Vercel. Setelah menambahkan environment variables, redeploy project.

## Pemeriksaan

```bash
npm run lint
npm run build
```
