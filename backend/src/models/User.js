import mongoose from "mongoose";
import { toJSONOptions } from "../utils/toJSON.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions },
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);
