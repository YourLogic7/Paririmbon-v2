import express from "express";
import { timingSafeEqual } from "node:crypto";
import {
  createToken,
  hashPassword,
  requireAdmin,
  requireAuth,
  SESSION_IDLE_TIMEOUT_SECONDS,
  verifyPassword
} from "./auth.js";
import { connectDatabase, Entry, BadTicketConfig, Account } from "./db.js";
import {
  detailedCaseCustomerCase,
  allIssueTypes,
  allKipRuleOptions,
  hasConflictingAllKipRules,
  initialBadTicketConfig,
  initialEntries
} from "../../web/src/data.js";

const BAD_TICKET_HASHTAGS = [
  "#salah_kategori",
  "#salah_tujuan",
  "#mandatori_tidak_lengkap",
  "#non_eskalasi"
];

const app = express();
app.use(express.json({ limit: "256kb" }));

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

function validateBadTicketConfig(body) {
  const optionFields = ["kips", "customerCases", "issueTypes", "onuStatuses"];
  if (!body || optionFields.some((field) =>
    !Array.isArray(body[field]) || body[field].length === 0 || body[field].length > 200 ||
    body[field].some((value) => typeof value !== "string" || !value.trim() || value.length > 160)
  )) {
    return "Setiap daftar pilihan harus berisi 1–200 teks yang valid.";
  }
  if (body.kips.some((kip) => allKipRuleOptions.includes(kip))) {
    return "Pilihan All KIP hanya boleh digunakan pada aturan, bukan sebagai KIP pelaporan.";
  }
  if (!Array.isArray(body.rules) || body.rules.length > 1000) {
    return "Daftar aturan harus berisi maksimal 1.000 kombinasi.";
  }
  const uniqueOptions = Object.fromEntries(optionFields.map((field) => [
    field,
    new Set(body[field].map((value) => value.trim()))
  ]));
  const seenRules = new Set();
  for (const rule of body.rules) {
    if (!rule || typeof rule !== "object" ||
      typeof rule.kip !== "string" ||
      (!uniqueOptions.kips.has(rule.kip) && !allKipRuleOptions.includes(rule.kip)) ||
      typeof rule.customerCase !== "string" || !uniqueOptions.customerCases.has(rule.customerCase) ||
      typeof rule.issueType !== "string" ||
      (rule.issueType !== allIssueTypes && !uniqueOptions.issueTypes.has(rule.issueType)) ||
      !Array.isArray(rule.onuStatuses) || rule.onuStatuses.length === 0 ||
      rule.onuStatuses.length > 200 ||
      rule.onuStatuses.some((status) => typeof status !== "string" || !uniqueOptions.onuStatuses.has(status)) ||
      (rule.recommendation !== undefined && (typeof rule.recommendation !== "string" || rule.recommendation.length > 2000)) ||
      typeof rule.sourceLink !== "string" || rule.sourceLink.length > 500 ||
      !BAD_TICKET_HASHTAGS.includes(rule.hashtag)
    ) {
      return "Setiap aturan harus menggunakan pilihan yang tersedia, redaksi dan source link yang valid, serta hashtag yang tersedia.";
    }
    try {
      const sourceLink = new URL(rule.sourceLink);
      if (!["http:", "https:"].includes(sourceLink.protocol)) throw new Error("Invalid protocol");
    } catch {
      return "Setiap aturan harus memiliki source link HTTP/HTTPS yang valid.";
    }
    const signature = JSON.stringify([
      rule.kip,
      rule.customerCase,
      rule.issueType,
      [...new Set(rule.onuStatuses)].sort()
    ]);
    if (seenRules.has(signature)) return "Kombinasi aturan tidak boleh duplikat.";
    seenRules.add(signature);
  }
  if (hasConflictingAllKipRules(body.rules)) {
    return "Aturan All KIP Bad dan All KIP Tidak bad tidak boleh berlaku untuk kombinasi yang sama.";
  }
  return null;
}

app.get("/api/health", (_request, response) => response.json({ status: "ok", service: "paririmbon-api" }));

app.post("/api/auth/login", async (request, response, next) => {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const { accountId, password } = request.body || {};
  if (typeof password !== "string" || password.length > 128) {
    return response.status(400).json({ error: "Kata sandi harus diisi." });
  }
  try {
    if (accountId === undefined || accountId === "") {
      if (!configuredPassword) return response.status(503).json({ error: "ADMIN_PASSWORD belum dikonfigurasi." });
      const submittedPassword = Buffer.from(password);
      const expectedPassword = Buffer.from(configuredPassword);
      if (submittedPassword.length !== expectedPassword.length ||
        !timingSafeEqual(submittedPassword, expectedPassword)) {
        return response.status(401).json({ error: "Kata sandi admin tidak sesuai." });
      }
      return response.json({
        token: createToken("admin"),
        role: "admin",
        expiresIn: SESSION_IDLE_TIMEOUT_SECONDS
      });
    }
    if (typeof accountId !== "string" || accountId.length > 32) {
      return response.status(400).json({ error: "ID akun tidak valid." });
    }
    await connectDatabase();
    const account = await Account.findOne({ username: accountId.trim().toLowerCase() }).select("+passwordHash");
    if (!account || !await verifyPassword(password, account.passwordHash)) {
      return response.status(401).json({ error: "ID atau kata sandi tidak sesuai." });
    }
    account.lastSeenAt = new Date();
    await account.save();
    return response.json({
      token: createToken("user", account.id, account.sessionVersion),
      role: "user",
      expiresIn: SESSION_IDLE_TIMEOUT_SECONDS
    });
  } catch (error) {
    if (error.message.includes("JWT_SECRET")) return response.status(503).json({ error: error.message });
    return next(error);
  }
});

app.get("/api/auth/me", requireAuth, (request, response) => {
  return response.json({ role: request.auth.role });
});

app.post("/api/auth/presence", requireAuth, async (request, response, next) => {
  try {
    if (request.auth.role === "user") {
      await Account.findByIdAndUpdate(request.auth.sub, { lastSeenAt: new Date() });
    }
    return response.json({
      token: createToken(
        request.auth.role,
        request.auth.sub,
        request.auth.version
      ),
      expiresIn: SESSION_IDLE_TIMEOUT_SECONDS
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/logout", requireAuth, async (request, response, next) => {
  try {
    if (request.auth.role === "user") {
      await Account.findByIdAndUpdate(request.auth.sub, { lastSeenAt: null });
    }
    return response.sendStatus(204);
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/accounts", requireAdmin, async (_request, response, next) => {
  try {
    await connectDatabase();
    const accounts = await Account.find().select("username displayName lastSeenAt").sort({ username: 1 }).lean();
    const onlineSince = new Date(Date.now() - 45_000);
    return response.json({
      accounts: accounts.map((account) => ({
        id: account.username,
        name: account.displayName || account.username,
        online: account.lastSeenAt !== null && account.lastSeenAt >= onlineSince,
        lastSeenAt: account.lastSeenAt
      }))
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/accounts", requireAdmin, async (request, response, next) => {
  const { name, id, password } = request.body || {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100 ||
    typeof id !== "string" || !/^[a-zA-Z0-9._-]{3,32}$/.test(id) ||
    typeof password !== "string" || password.length < 8 || password.length > 128) {
    return response.status(400).json({ error: "Nama wajib diisi (maksimal 100 karakter), ID harus 3–32 karakter (huruf, angka, titik, garis bawah, atau strip), dan kata sandi 8–128 karakter." });
  }
  try {
    await connectDatabase();
    const account = await Account.create({
      displayName: name.trim(),
      username: id.toLowerCase(),
      passwordHash: await hashPassword(password)
    });
    return response.status(201).json({ account: { id: account.username, name: account.displayName, online: false, lastSeenAt: null } });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: "ID akun sudah digunakan." });
    return next(error);
  }
});

app.post("/api/admin/accounts/import", requireAdmin, async (request, response, next) => {
  const { accounts } = request.body || {};
  if (!Array.isArray(accounts) || accounts.length === 0 || accounts.length > 200) {
    return response.status(400).json({ error: "Impor harus berisi 1–200 akun." });
  }
  const seenIds = new Set();
  for (const [index, account] of accounts.entries()) {
    if (!account || typeof account.name !== "string" || !account.name.trim() || account.name.trim().length > 100 ||
      typeof account.id !== "string" || !/^[a-zA-Z0-9._-]{3,32}$/.test(account.id) ||
      typeof account.password !== "string" || account.password.length < 8 || account.password.length > 128) {
      return response.status(400).json({ error: `Data akun pada baris ${index + 2} tidak valid. Pastikan nama, ID 3–32 karakter, dan kata sandi 8–128 karakter terisi.` });
    }
    const normalizedId = account.id.toLowerCase();
    if (seenIds.has(normalizedId)) {
      return response.status(400).json({ error: `ID akun "${account.id}" muncul lebih dari sekali di file.` });
    }
    seenIds.add(normalizedId);
  }
  try {
    await connectDatabase();
    const requestedIds = [...seenIds];
    const existing = await Account.find({ username: { $in: requestedIds } }).select("username").lean();
    const existingIds = new Set(existing.map((account) => account.username));
    const candidates = accounts.filter((account) => !existingIds.has(account.id.toLowerCase()));
    const skipped = accounts
      .filter((account) => existingIds.has(account.id.toLowerCase()))
      .map((account) => ({ id: account.id, name: account.name }));
    let imported = [];
    if (candidates.length) {
      const documents = [];
      for (let index = 0; index < candidates.length; index += 8) {
        const batch = await Promise.all(candidates.slice(index, index + 8).map(async (account) => ({
          displayName: account.name.trim(),
          username: account.id.toLowerCase(),
          passwordHash: await hashPassword(account.password)
        })));
        documents.push(...batch);
      }
      try {
        const inserted = await Account.insertMany(documents, { ordered: false });
        imported = inserted.map((account) => ({ id: account.username, name: account.displayName }));
      } catch (error) {
        if (!error.writeErrors?.every((writeError) => writeError.code === 11000)) throw error;
        const insertedIds = error.insertedDocs.map((account) => account.username);
        imported = error.insertedDocs.map((account) => ({ id: account.username, name: account.displayName }));
        const insertedIdSet = new Set(insertedIds);
        skipped.push(...candidates
          .filter((account) => !insertedIdSet.has(account.id.toLowerCase()))
          .map((account) => ({ id: account.id, name: account.name })));
      }
    }
    return response.status(201).json({ imported, skipped });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/admin/accounts/:id/password", requireAdmin, async (request, response, next) => {
  const { password } = request.body || {};
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return response.status(400).json({ error: "Kata sandi harus terdiri dari 8–128 karakter." });
  }
  try {
    await connectDatabase();
    const account = await Account.findOne({ username: request.params.id.toLowerCase() });
    if (!account) return response.status(404).json({ error: "Akun tidak ditemukan." });
    account.passwordHash = await hashPassword(password);
    account.sessionVersion += 1;
    account.lastSeenAt = null;
    await account.save();
    return response.json({ updated: true });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/admin/accounts/:id", requireAdmin, async (request, response, next) => {
  try {
    await connectDatabase();
    const account = await Account.findOneAndDelete({ username: request.params.id.toLowerCase() });
    if (!account) return response.status(404).json({ error: "Akun tidak ditemukan." });
    return response.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/entries", requireAuth, async (_request, response, next) => {
  try {
    await connectDatabase();
    if (await Entry.estimatedDocumentCount() === 0) {
      try {
        await Entry.insertMany(initialEntries);
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }
    const entries = await Entry.find().sort({ createdAt: 1 }).select("-_id -__v").lean();
    return response.json({ entries });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/bad-ticket-config", requireAuth, async (_request, response, next) => {
  try {
    await connectDatabase();
    let config = await BadTicketConfig.findOne({ key: "default" }).select("-_id -__v -key").lean();
    if (!config) {
      try {
        const created = await BadTicketConfig.create({ key: "default", ...initialBadTicketConfig });
        config = created.toObject();
      } catch (error) {
        if (error.code !== 11000) throw error;
        config = await BadTicketConfig.findOne({ key: "default" }).select("-_id -__v -key").lean();
      }
    }
    const storedRules = config.rules?.length ? config.rules : initialBadTicketConfig.rules;
    const { sourceLink: legacyLink, ...storedConfig } = config;
    return response.json({
      config: {
        ...initialBadTicketConfig,
        ...storedConfig,
        customerCases: [...new Set([...(storedConfig.customerCases || []), detailedCaseCustomerCase])],
        rules: storedRules.map((rule) => ({
          ...rule,
          onuStatuses: Array.isArray(rule.onuStatuses)
            ? rule.onuStatuses
            : typeof rule.onuStatus === "string" ? [rule.onuStatus] : [],
          recommendation: rule.recommendation || "",
          sourceLink: rule.sourceLink || legacyLink || initialBadTicketConfig.rules[0]?.sourceLink,
          hashtag: BAD_TICKET_HASHTAGS.includes(rule.hashtag) ? rule.hashtag : "#salah_kategori"
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.put("/api/bad-ticket-config", requireAdmin, async (request, response, next) => {
  const normalizedBody = request.body && Array.isArray(request.body.rules)
    ? {
      ...request.body,
      rules: request.body.rules.map((rule) => ({
        ...rule,
        onuStatuses: Array.isArray(rule.onuStatuses)
          ? rule.onuStatuses
          : typeof rule.onuStatus === "string" ? [rule.onuStatus] : []
      }))
    }
    : request.body;
  const invalid = validateBadTicketConfig(normalizedBody);
  if (invalid) return response.status(400).json({ error: invalid });
  try {
    await connectDatabase();
    const config = await BadTicketConfig.findOneAndUpdate(
      { key: "default" },
      {
        ...normalizedBody,
        customerCases: [...new Set([...normalizedBody.customerCases, detailedCaseCustomerCase])],
        key: "default"
      },
      { new: true, runValidators: true, upsert: true, setDefaultsOnInsert: true }
    ).select("-_id -__v -key").lean();
    await BadTicketConfig.collection.updateOne({ key: "default" }, { $unset: { sourceLink: "" } });
    return response.json({ config });
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
    const entry = await Entry.findOneAndUpdate(
      { id: request.params.id },
      request.body,
      { new: true, runValidators: true, upsert: true, setDefaultsOnInsert: true }
    ).select("-_id -__v").lean();
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

app.post("/api/assist", requireAuth, async (request, response, next) => {
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
