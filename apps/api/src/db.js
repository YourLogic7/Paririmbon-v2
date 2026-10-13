import mongoose from "mongoose";

const entrySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  summary: { type: String, required: true, trim: true, maxlength: 220 },
  content: { type: String, required: true, trim: true, maxlength: 20000 },
  tags: { type: [String], default: [] },
  readTime: { type: String, default: "1 menit" },
  updatedAt: { type: String, default: "" }
}, { timestamps: true });

export const Entry = mongoose.models.Entry || mongoose.model("Entry", entrySchema);

const badTicketRuleSchema = new mongoose.Schema({
  kip: { type: String, required: true, trim: true, maxlength: 160 },
  customerCase: { type: String, required: true, trim: true, maxlength: 160 },
  issueType: { type: String, required: true, trim: true, maxlength: 80 },
  onuStatuses: { type: [String], required: true, validate: (statuses) => Array.isArray(statuses) && statuses.length > 0 },
  recommendation: { type: String, trim: true, maxlength: 2000, default: "" },
  sourceLink: { type: String, required: true, trim: true, maxlength: 500, default: "https://kms.telkomsel.co.id/content/" },
  hashtag: { type: String, required: true, enum: ["#salah_kategori", "#salah_tujuan", "#mandatori_tidak_lengkap", "#non_eskalasi"], default: "#salah_kategori" }
}, { _id: false });

const badTicketConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "default" },
  kips: { type: [String], required: true },
  customerCases: { type: [String], required: true },
  issueTypes: { type: [String], required: true },
  onuStatuses: { type: [String], required: true },
  rules: { type: [badTicketRuleSchema], required: true }
}, { timestamps: true });

export const BadTicketConfig = mongoose.models.BadTicketConfig ||
  mongoose.model("BadTicketConfig", badTicketConfigSchema);

let connectionPromise;

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI belum dikonfigurasi.");
  if (mongoose.connection.readyState === 1) return;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
      .catch((error) => {
        connectionPromise = undefined;
        throw error;
      });
  }
  await connectionPromise;
}
