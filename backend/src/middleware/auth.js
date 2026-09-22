import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { User } from "../models/User.js";

export const COOKIE_NAME = "mentorque_token";
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export function setAuthCookie(res, user) {
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, config.jwtSecret, {
    expiresIn: SEVEN_DAYS,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: SEVEN_DAYS * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function readSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.id || !payload.email || !payload.name) return null;
    return { id: String(payload.id), email: String(payload.email), name: String(payload.name) };
  } catch {
    return null;
  }
}

export function isAdmin(email) {
  return Boolean(email) && config.adminEmails.includes(email.toLowerCase());
}

export async function requireUser(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const user = await User.findById(session.id).select("name email").lean();
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  req.user = { id: String(user._id), email: user.email, name: user.name };
  next();
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user?.email)) return res.status(403).json({ error: "Forbidden" });
  next();
}
