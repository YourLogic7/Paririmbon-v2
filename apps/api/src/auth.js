import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { connectDatabase, Account } from "./db.js";

const scrypt = promisify(scryptCallback);

function sign(value) {
  return createHmac("sha256", process.env.JWT_SECRET).update(value).digest("base64url");
}

function validateSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET harus diisi dengan minimal 32 karakter.");
  }
}

export function createToken(role, subject, sessionVersion) {
  validateSecret();
  const payload = Buffer.from(JSON.stringify({
    role,
    ...(subject ? { sub: subject } : {}),
    ...(sessionVersion !== undefined ? { version: sessionVersion } : {}),
    exp: Date.now() + 8 * 60 * 60 * 1000
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
  const [saltValue, hashValue, extra] = storedHash.split(":");
  if (!saltValue || !hashValue || extra) return false;
  const salt = Buffer.from(saltValue, "base64url");
  const expected = Buffer.from(hashValue, "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

function readToken(request) {
  const token = request.get("authorization")?.replace(/^Bearer\s+/i, "");
  const [payload, signature, extra] = token?.split(".") || [];
  if (!payload || !signature || extra || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return null;
  }
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!["admin", "user"].includes(decoded.role) || typeof decoded.exp !== "number" || decoded.exp < Date.now()) {
      return null;
    }
    if (decoded.role === "user" &&
      (typeof decoded.sub !== "string" || !Number.isInteger(decoded.version))) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function requireAdmin(request, response, next) {
  const decoded = readToken(request);
  if (decoded?.role !== "admin") {
    return response.status(401).json({ error: "Akses admin diperlukan." });
  }
  request.auth = decoded;
  next();
}

export async function requireAuth(request, response, next) {
  const decoded = readToken(request);
  if (!decoded) return response.status(401).json({ error: "Sesi tidak valid atau sudah kedaluwarsa." });
  if (decoded.role === "user") {
    try {
      await connectDatabase();
      const account = await Account.findById(decoded.sub).select("sessionVersion").lean();
      if (!account || account.sessionVersion !== decoded.version) {
        return response.status(401).json({ error: "Akun tidak lagi tersedia." });
      }
    } catch (error) {
      return next(error);
    }
  }
  request.auth = decoded;
  next();
}
