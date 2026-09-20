import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(100),
});

export const loginSchema = signupSchema.pick({ email: true, password: true });

export const interviewCreateSchema = z.object({
  role: z.string().trim().min(2).max(80),
  level: z.enum(["Junior", "Mid-level", "Senior"]).default("Mid-level"),
  language: z.enum(["English", "Hindi", "Hinglish"]).default("English"),
  focus: z.string().trim().min(2).max(220),
});
