import express from "express";
import { createToken, requireAdmin } from "./auth.js";
import { connectDatabase, Entry } from "./db.js";

const app = express();
app.use(express.json({ limit: "64kb" }));

function validateEntry(body) {
  const fields = ["id", "title", "category", "summary", "content"];
  if (!body || fields.some((field) => typeof body[field] !== "string" || !body[field].trim())) {
    return "ID, judul, kategori, ringkasan, dan isi wajib diisi.";
  }
  if (body.title.length > 100 || body.category.length > 60 || body.summary.length > 220 || body.content.length > 20000) {
    return "Salah satu kolom melewati batas panjang yang diizinkan.";
  }
  if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== "string" || tag.length > 40))) {
    return "Kata kunci harus berupa daftar teks dengan panjang maksimal 40 karakter.";
  }
  return null;
}

app.get("/api/health", (_request, response) => response.json({ status: "ok", service: "paririmbon-api" }));

app.post("/api/auth/login", (request, response) => {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredPassword) return response.status(503).json({ error: "ADMIN_PASSWORD belum dikonfigurasi." });
  if (typeof request.body?.password !== "string" || request.body.password !== configuredPassword) {
    return response.status(401).json({ error: "Kata sandi admin tidak sesuai." });
  }
  try {
    return response.json({ token: createToken(), expiresIn: 28800 });
  } catch (error) {
    return response.status(503).json({ error: error.message });
  }
});

app.get("/api/entries", async (_request, response, next) => {
  try {
    await connectDatabase();
    const entries = await Entry.find().sort({ createdAt: 1 }).select("-_id -__v").lean();
    return response.json({ entries });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/entries", requireAdmin, async (request, response, next) => {
  const invalid = validateEntry(request.body);
  if (invalid) return response.status(400).json({ error: invalid });
  try {
    await connectDatabase();
    const entry = await Entry.create(request.body);
    return response.status(201).json({ entry: entry.toObject({ versionKey: false }) });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: "ID halaman sudah digunakan." });
    return next(error);
  }
});

app.put("/api/entries/:id", requireAdmin, async (request, response, next) => {
  const invalid = validateEntry(request.body);
  if (invalid) return response.status(400).json({ error: invalid });
  if (request.params.id !== request.body.id) return response.status(400).json({ error: "ID halaman tidak cocok." });
  try {
    await connectDatabase();
    const entry = await Entry.findOneAndUpdate({ id: request.params.id }, request.body, { new: true, runValidators: true }).select("-_id -__v").lean();
    if (!entry) return response.status(404).json({ error: "Halaman tidak ditemukan." });
    return response.json({ entry });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/entries/:id", requireAdmin, async (request, response, next) => {
  try {
    await connectDatabase();
    const entry = await Entry.findOneAndDelete({ id: request.params.id });
    if (!entry) return response.status(404).json({ error: "Halaman tidak ditemukan." });
    return response.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/assist", async (request, response, next) => {
  const { caseType, conditions = [] } = request.body || {};
  if (typeof caseType !== "string" || caseType.length > 100 || !Array.isArray(conditions) || conditions.length > 12) {
    return response.status(400).json({ error: "Situasi atau konteks kasus tidak valid." });
  }
  try {
    await connectDatabase();
    const terms = caseType.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3);
    const candidates = await Entry.find().select("-_id -__v").lean();
    const article = candidates
      .map((entry) => ({
        entry,
        score: [...entry.tags, entry.category, entry.title].reduce((sum, value) =>
          sum + terms.filter((term) => value.toLowerCase().includes(term)).length, 0)
      }))
      .sort((left, right) => right.score - left.score)[0];
    const matchedArticle = article?.score > 0 ? article.entry : null;
    const steps = [
      "Dengarkan kebutuhan pelanggan dan rangkum kendalanya untuk memastikan situasinya dipahami dengan tepat.",
      "Verifikasi informasi sesuai prosedur. Jangan meminta kata sandi, PIN, atau kode OTP.",
      matchedArticle ? `Ikuti panduan “${matchedArticle.title}” dan periksa setiap langkah sebelum menyampaikan solusi.` : "Periksa detail produk dan kebijakan terkait sebelum menentukan solusi.",
      conditions.includes("Perlu tindak lanjut tim lain")
        ? "Buat tiket eskalasi dengan kronologi, bukti yang tersedia, dan ekspektasi tindak lanjut."
        : "Sampaikan langkah berikutnya dengan bahasa sederhana dan jelaskan kapan pelanggan perlu menghubungi kembali."
    ];
    if (conditions.includes("Pelanggan merasa khawatir")) {
      steps.unshift("Mulai dengan empati: akui kekhawatiran pelanggan dan jelaskan bahwa kamu akan membantu memeriksa kendalanya.");
    }
    return response.json({
      article: matchedArticle,
      steps,
      note: conditions.includes("Ada bukti transaksi / foto")
        ? "Bukti sudah tersedia — sertakan pada tiket internal, dan simpan hanya di kanal kerja yang disetujui."
        : "Jika bukti diperlukan, minta pelanggan membagikannya melalui kanal resmi yang aman."
    });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error("Paririmbon API error:", error.message);
  if (response.headersSent) return;
  if (error.name === "ValidationError") return response.status(400).json({ error: "Data halaman tidak valid." });
  if (error.name === "CastError") return response.status(400).json({ error: "ID halaman tidak valid." });
  return response.status(503).json({ error: "Layanan data tidak tersedia. Periksa konfigurasi database." });
});

export default app;
