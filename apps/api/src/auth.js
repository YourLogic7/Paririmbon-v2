import { createHmac, timingSafeEqual } from "node:crypto";

function sign(value) {
  return createHmac("sha256", process.env.JWT_SECRET).update(value).digest("base64url");
}

export function createToken() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET harus diisi dengan minimal 32 karakter.");
  }
  const payload = Buffer.from(JSON.stringify({ role: "admin", exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function requireAdmin(request, response, next) {
  const token = request.get("authorization")?.replace(/^Bearer\s+/i, "");
  const [payload, signature, extra] = token?.split(".") || [];
  if (!payload || !signature || extra || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return response.status(401).json({ error: "Akses admin diperlukan." });
  }
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return response.status(401).json({ error: "Sesi admin tidak valid." });
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (decoded.role !== "admin" || decoded.exp < Date.now()) throw new Error("Token kedaluwarsa.");
  } catch {
    return response.status(401).json({ error: "Sesi admin tidak valid atau sudah kedaluwarsa." });
  }
  next();
}
