export const initialEntries = [
  {
    id: "welcome",
    title: "Selamat datang di Paririmbon",
    category: "Mulai di sini",
    readTime: "3 menit",
    updatedAt: "7 Okt 2026",
    summary: "Peta kecil untuk menemukan jawaban besar. Kenali cara menggunakan buku pengetahuan tim.",
    content: "Paririmbon adalah rumah bagi pengetahuan produk dan pengalaman tim. Setiap halaman merangkum hal-hal yang biasanya perlu ditanyakan berulang kali, supaya kamu bisa fokus membantu pelanggan dengan percaya diri.\n\nMulailah dari daftar isi di halaman sebelah. Pilih topik yang kamu perlukan, atau gunakan pencarian di bagian atas. Kalau menghadapi situasi khusus, buka AI Assist untuk mendapatkan langkah awal yang relevan.\n\nPengetahuan tumbuh bersama. Menemukan sesuatu yang perlu diperbarui? Masuk sebagai admin untuk menyunting halaman dan menjaga buku ini tetap hidup.",
    tags: ["panduan", "mulai"]
  },
  {
    id: "pembayaran-gagal",
    title: "Transaksi pembayaran gagal",
    category: "Pembayaran",
    readTime: "5 menit",
    updatedAt: "3 Okt 2026",
    summary: "Langkah menelusuri pembayaran yang tertolak atau belum tercatat.",
    content: "Tenangkan pelanggan dan pastikan nominal transaksi tidak terpotong lebih dari satu kali. Minta waktu transaksi, nominal, metode pembayaran, serta bukti transaksi — jangan pernah meminta PIN atau kode OTP.\n\n1. Periksa status transaksi di dashboard menggunakan ID pesanan.\n2. Jika status tertunda, informasikan bahwa pembaruan dapat memerlukan waktu hingga 1×24 jam kerja.\n3. Jika saldo terpotong tetapi pesanan gagal, catat laporan dan teruskan ke tim pembayaran dengan bukti transaksi.\n4. Berikan nomor tiket agar pelanggan dapat memantau tindak lanjut.\n\nJika pembayaran ganda terkonfirmasi, eskalasikan ke tim keuangan. Hindari menjanjikan waktu pengembalian dana yang belum terverifikasi.",
    tags: ["transaksi", "gagal", "refund", "saldo", "escalation"]
  },
  {
    id: "reset-akun",
    title: "Bantu pelanggan akses akun",
    category: "Akun & akses",
    readTime: "4 menit",
    updatedAt: "29 Sep 2026",
    summary: "Panduan aman untuk kendala masuk, reset kata sandi, dan verifikasi.",
    content: "Sebelum memulai, verifikasi identitas pelanggan melalui prosedur yang berlaku. Jangan meminta atau mencatat kata sandi, OTP, maupun tautan pemulihan milik pelanggan.\n\nUntuk kata sandi terlupa, arahkan pelanggan ke menu “Lupa kata sandi” dan pastikan mereka memeriksa folder spam. Jika email verifikasi belum masuk, periksa ejaan alamat email dan tunggu beberapa menit sebelum mencoba ulang.\n\nJika pelanggan tidak lagi memiliki akses ke email terdaftar, buat tiket verifikasi kepemilikan akun. Jangan mengubah email akun sebelum proses verifikasi selesai.",
    tags: ["login", "akun", "akses", "verifikasi", "keamanan"]
  },
  {
    id: "status-pesanan",
    title: "Cek status pesanan pelanggan",
    category: "Pesanan",
    readTime: "3 menit",
    updatedAt: "24 Sep 2026",
    summary: "Cara membaca status pesanan dan menyampaikan estimasi dengan jelas.",
    content: "Minta nomor pesanan atau email akun untuk menemukan transaksi. Cocokkan produk dan tanggal pembelian sebelum membagikan informasi.\n\nJelaskan status yang tampil secara sederhana: diproses berarti tim sedang menyiapkan pesanan, dikirim berarti paket sudah diserahkan ke kurir, dan selesai berarti pesanan telah diterima sistem.\n\nJika estimasi pengiriman terlewati, periksa nomor resi dan buat tiket ke tim operasional. Berikan pelanggan pembaruan yang realistis, bukan tanggal pasti yang belum dikonfirmasi.",
    tags: ["pesanan", "pengiriman", "status", "terlambat"]
  },
  {
    id: "retur-produk",
    title: "Permintaan retur atau pengembalian",
    category: "Retur & refund",
    readTime: "6 menit",
    updatedAt: "20 Sep 2026",
    summary: "Panduan memahami kelayakan retur dan memulai proses dengan empati.",
    content: "Dengarkan alasan pelanggan dan konfirmasi nomor pesanan, tanggal diterima, kondisi produk, serta foto jika diperlukan. Sampaikan kebijakan retur yang berlaku untuk produk tersebut.\n\nBila memenuhi syarat, bantu pelanggan mengisi formulir retur dan jelaskan cara pengemasan serta alamat pengiriman. Setelah paket diterima dan diperiksa, proses pengembalian mengikuti metode pembayaran awal.\n\nJika produk rusak atau tidak sesuai, tandai sebagai prioritas dan teruskan bukti ke tim kualitas. Jangan meminta pelanggan mengirimkan produk sebelum instruksi retur diberikan.",
    tags: ["retur", "refund", "produk", "rusak"]
  }
];

export const caseTypes = [
  "Pembayaran gagal atau tertunda",
  "Tidak bisa masuk ke akun",
  "Pesanan belum diterima",
  "Mengajukan retur atau refund",
  "Produk tidak sesuai",
  "Pertanyaan umum produk"
];

export const conditionGroups = [
  {
    label: "Situasi pelanggan",
    options: ["Baru pertama kali menghubungi", "Sudah menghubungi sebelumnya", "Pelanggan merasa khawatir", "Pelanggan membutuhkan solusi cepat"]
  },
  {
    label: "Kondisi kasus",
    options: ["Ada bukti transaksi / foto", "Belum ada bukti pendukung", "Kendala berdampak pada aktivitas", "Perlu tindak lanjut tim lain"]
  }
];

export function getRecommendations(caseType, conditions, entries = initialEntries) {
  const normalized = caseType.toLowerCase();
  const keywordMap = [
    { includes: ["pembayaran"], words: ["pembayaran", "transaksi", "gagal", "refund", "saldo"] },
    { includes: ["masuk"], words: ["akun", "akses", "login", "keamanan"] },
    { includes: ["pesanan"], words: ["pesanan", "pengiriman", "status"] },
    { includes: ["retur", "refund"], words: ["retur", "refund", "produk"] },
    { includes: ["produk"], words: ["produk", "pesanan"] }
  ];
  const rule = keywordMap.find((item) => item.includes.some((word) => normalized.includes(word)));
  const article = entries.find((entry) =>
    rule && [...entry.tags, entry.category, entry.title].some((word) =>
      rule.words.some((keyword) => word.toLowerCase().includes(keyword))
    )
  );
  const steps = [
    "Dengarkan kebutuhan pelanggan dan rangkum kendalanya untuk memastikan kamu memahami situasi dengan tepat.",
    "Verifikasi informasi yang diperlukan sesuai prosedur. Jangan pernah meminta kata sandi, PIN, atau kode OTP.",
    article ? `Ikuti panduan “${article.title}” dan periksa setiap langkah sebelum menyampaikan solusi.` : "Periksa detail produk dan kebijakan terkait sebelum menentukan solusi.",
    conditions.includes("Perlu tindak lanjut tim lain")
      ? "Buat tiket eskalasi dengan kronologi, bukti yang tersedia, dan ekspektasi tindak lanjut."
      : "Sampaikan langkah berikutnya dengan bahasa sederhana dan pastikan pelanggan tahu kapan perlu menghubungi kembali."
  ];
  if (conditions.includes("Pelanggan merasa khawatir")) {
    steps.unshift("Mulai dengan empati: akui kekhawatiran pelanggan dan jelaskan bahwa kamu akan membantu memeriksa kendalanya.");
  }
  return {
    article,
    steps,
    note: conditions.includes("Ada bukti transaksi / foto")
      ? "Bukti sudah tersedia — sertakan pada tiket internal, dan simpan hanya di kanal kerja yang disetujui."
      : "Jika bukti diperlukan, minta pelanggan membagikannya melalui kanal resmi yang aman."
  };
}
