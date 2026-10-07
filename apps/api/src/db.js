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
