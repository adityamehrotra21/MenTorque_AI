import { Interview } from "../models/Interview.js";
import { User } from "../models/User.js";
import { toSummary } from "./interviewController.js";

export async function overview(_req, res) {
  const [users, interviews] = await Promise.all([
    User.find().sort({ createdAt: -1 }).lean(),
    Interview.find().sort({ createdAt: -1 }).lean(),
  ]);

  const byUser = new Map();
  for (const interview of interviews) {
    const key = String(interview.user);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(toSummary(interview));
  }

  const scored = interviews.filter((item) => typeof item.score === "number");
  const averageScore = scored.length
    ? Math.round(scored.reduce((total, item) => total + item.score, 0) / scored.length)
    : 0;

  res.json({
    stats: {
      totalUsers: users.length,
      totalInterviews: interviews.length,
      completed: interviews.filter((item) => item.status === "COMPLETED").length,
      pending: interviews.filter((item) => item.status === "CREATED").length,
      live: interviews.filter((item) => item.status === "LIVE").length,
      averageScore,
    },
    users: users.map((user) => ({
      id: String(user._id),
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      interviews: byUser.get(String(user._id)) || [],
    })),
  });
}
