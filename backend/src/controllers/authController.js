import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { clearAuthCookie, isAdmin, readSession, setAuthCookie } from "../middleware/auth.js";
import { loginSchema, signupSchema } from "../utils/validation.js";

export async function signup(req, res) {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please enter a valid name, email, and password." });
  }

  const { name, email, password } = parsed.data;
  try {
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
    });
    return res.json({
      user: { id: user.id, email: user.email, name: user.name },
      message: "Account created. Please log in to continue.",
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    throw error;
  }
}

export async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please enter a valid email and password." });
  }

  const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  const sessionUser = { id: user.id, email: user.email, name: user.name };
  setAuthCookie(res, sessionUser);
  return res.json({ user: { ...sessionUser, isAdmin: isAdmin(user.email) } });
}

export function logout(_req, res) {
  clearAuthCookie(res);
  res.json({ ok: true });
}

export function me(req, res) {
  const user = readSession(req);
  res.json({ user: user ? { ...user, isAdmin: isAdmin(user.email) } : null });
}
