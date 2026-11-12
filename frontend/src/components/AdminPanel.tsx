import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, CheckCircle2, Clock3, Loader2, ShieldCheck, UsersRound } from "lucide-react";
import clsx from "clsx";

type AdminInterview = {
  id: string;
  role: string;
  level: string;
  language: string;
  status: "CREATED" | "LIVE" | "COMPLETED";
  score: number | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  _count: { turns: number };
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  interviews: AdminInterview[];
};

type AdminData = {
  stats: {
    totalUsers: number;
    totalInterviews: number;
    completed: number;
    pending: number;
    live: number;
    averageScore: number;
  };
  users: AdminUser[];
};

export function AdminPanel() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAdmin() {
      const response = await fetch("/api/admin/overview");
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "You do not have admin access.");
      } else {
        setData(payload);
      }
      setLoading(false);
    }

    void loadAdmin();
  }, []);

  if (loading) {
    return (
      <main className="admin-shell center-screen">
        <Loader2 className="spin" size={26} />
        <p>Loading admin activity</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="admin-shell">
        <section className="admin-empty">
          <ShieldCheck size={32} />
          <h1>Admin access required</h1>
          <p>{error || "Only the configured admin account can open this page."}</p>
          <button className="ghost-button" onClick={() => navigate("/")}>Back to dashboard</button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <button className="ghost-button" onClick={() => navigate("/")}>
          <ArrowLeft size={16} /> Dashboard
        </button>
        <div>
          <p className="eyebrow">Admin panel</p>
          <h1>Users and interview activity</h1>
        </div>
      </header>

      <section className="admin-stats">
        <AdminStat icon={<UsersRound size={20} />} label="Users" value={data.stats.totalUsers} />
        <AdminStat icon={<BarChart3 size={20} />} label="Interviews" value={data.stats.totalInterviews} />
        <AdminStat icon={<CheckCircle2 size={20} />} label="Completed" value={data.stats.completed} />
        <AdminStat icon={<Clock3 size={20} />} label="Pending / live" value={data.stats.pending + data.stats.live} />
        <AdminStat icon={<ShieldCheck size={20} />} label="Avg score" value={data.stats.averageScore ? `${data.stats.averageScore}` : "—"} />
      </section>

      <section className="admin-users">
        {data.users.length === 0 && <p className="empty-state">No users yet.</p>}
        {data.users.map((user) => (
          <article className="admin-user-card" key={user.id}>
            <div className="admin-user-head">
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <p>Joined {formatDate(user.createdAt)}</p>
            </div>

            <div className="admin-interviews">
              {user.interviews.length === 0 && <p>No interviews created yet.</p>}
              {user.interviews.map((interview) => (
                <div className="admin-interview-row" key={interview.id}>
                  <div>
                    <strong>{interview.role}</strong>
                    <span>{interview.level} • {interview.language} • {interview._count.turns} turns</span>
                  </div>
                  <div className="admin-row-actions">
                    <span className={clsx("status-pill", interview.status.toLowerCase())}>{statusLabel(interview)}</span>
                    <button className="ghost-button" onClick={() => navigate(`/interview/${interview.id}/report`)}>
                      {interview.status === "COMPLETED" ? "View report" : "View transcript"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function AdminStat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <article>
      <span>{icon}</span>
      <strong>{value}</strong>
      <p>{label}</p>
    </article>
  );
}

function statusLabel(interview: AdminInterview) {
  if (interview.status === "COMPLETED") return interview.score ? `Completed · ${interview.score}` : "Completed";
  if (interview.status === "LIVE") return "In progress";
  return "Pending";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
