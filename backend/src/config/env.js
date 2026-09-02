// ADMIN_EMAILS (or ADMIN_EMAIL) accepts one or more comma-separated emails.
const adminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const config = {
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  adminEmails,
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  isProduction: process.env.NODE_ENV === "production",
};
