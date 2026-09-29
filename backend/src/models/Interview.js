import mongoose from "mongoose";
import { toJSONOptions } from "../utils/toJSON.js";

export const INTERVIEW_STATUS = ["CREATED", "LIVE", "COMPLETED"];

const turnSchema = new mongoose.Schema(
  {
    speaker: { type: String, enum: ["candidate", "interviewer"], required: true },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions },
);

const interviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, required: true },
    level: { type: String, required: true },
    focus: { type: String, required: true },
    language: { type: String, default: "English" },
    status: { type: String, enum: INTERVIEW_STATUS, default: "CREATED" },
    score: { type: Number, default: null },
    summary: { type: String, default: null },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    nextSteps: { type: [String], default: [] },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    // Transcript turns are embedded: they are always read together with their interview.
    turns: { type: [turnSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions },
);

interviewSchema.index({ user: 1, createdAt: -1 });

export const Interview = mongoose.models.Interview || mongoose.model("Interview", interviewSchema);
