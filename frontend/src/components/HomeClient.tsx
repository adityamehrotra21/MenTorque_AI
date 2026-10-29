import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, CheckCircle2, Clock3, LogOut, Mic, Plus, Settings, Sparkles, TimerReset, UserRound } from "lucide-react";
import clsx from "clsx";

type User = {
  id: string;
  name: string;
  email: string;
  isAdmin?: boolean;
};

type Interview = {
  id: string;
  role: string;
  level: string;
  language: "English" | "Hindi" | "Hinglish";
  focus: string;
  status: "CREATED" | "LIVE" | "COMPLETED";
  score: number | null;
  summary: string | null;
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
  createdAt: string;
  _count?: { turns: number };
};

const levels = ["Junior", "Mid-level", "Senior"] as const;
const languages = ["English", "Hindi", "Hinglish"] as const;
const interviewPackages = [
  {
    label: "Frontend Engineer",
    role: "Frontend Engineer",
    focus: "React architecture, UI debugging, state management, browser performance, collaboration, and product judgement",
  },
  {
    label: "Backend Engineer",
    role: "Backend Engineer",
    focus: "API design, database modeling, system reliability, authentication, background jobs, and production debugging",
  },
  {
    label: "Intro Practice",
    role: "General Interview",
    focus: "Self introduction, background summary, project storytelling, strengths, goals, and confident communication",
  },
  {
    label: "Project Based Interview",
    role: "Project Discussion",
    focus: "Project architecture, ownership, trade-offs, implementation decisions, failures, impact, and technical depth",
  },
  {
    label: "Database Engineer",
    role: "Database Engineer",
    focus: "Schema design, indexing, query optimization, transactions, backups, scaling, and data reliability",
  },
] as const;

export function HomeClient() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState("");
  const [role, setRole] = useState("");
  const [level, setLevel] = useState<(typeof levels)[number]>("Mid-level");
  const [language, setLanguage] = useState<(typeof languages)[number]>("English");
  const [focus, setFocus] = useState("");

  const completed = useMemo(() => interviews.filter((item) => item.status === "COMPLETED"), [interviews]);
  const pending = useMemo(() => interviews.filter((item) => item.status === "CREATED"), [interviews]);
  const live = useMemo(() => interviews.filter((item) => item.status === "LIVE"), [interviews]);
  const averageScore = useMemo(() => {
    const scored = completed.filter((item) => typeof item.score === "number");
    if (scored.length === 0) return 0;
    return Math.round(scored.reduce((total, item) => total + (item.score || 0), 0) / scored.length);
  }, [completed]);

  useEffect(() => {
    async function boot() {
      const me = await fetch("/api/auth/me").then((res) => res.json());
      setUser(me.user);
      if (me.user) {
        await loadInterviews();
      }
      setLoading(false);
    }

    void boot();
  }, []);

  async function loadInterviews() {
    const data = await fetch("/api/interviews").then((res) => res.json());
    setInterviews(data.interviews || []);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    };

    const response = await fetch(`/api/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authMode === "login" ? { email: payload.email, password: payload.password } : payload),
    });

    const data = await response.json();
    if (!response.ok) {
      setAuthError(data.error || "Authentication failed.");
      return;
    }

    if (authMode === "signup") {
      setAuthMode("login");
      setAuthError("Account created. Please log in to open your dashboard.");
      event.currentTarget.reset();
      return;
    }

    setUser(data.user);
    await loadInterviews();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setInterviews([]);
  }

  async function createInterview(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    const response = await fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, level, language, focus }),
    });
    const data = await response.json();
    setCreating(false);
    if (response.ok) {
      navigate(`/interview/${data.interview.id}`);
    }
  }

  function choosePackage(packageLabel: string) {
    setSelectedPackage(packageLabel);
    const preset = interviewPackages.find((item) => item.label === packageLabel);
    if (!preset) return;
    setRole(preset.role);
    setFocus(preset.focus);
  }

  if (loading) {
    return (
      <main className="center-screen">
        <div className="pulse-orb" />
        <p>Loading Mentorque</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-copy">
          <div className="brand-mark">
            <Mic size={22} />
            <span>Mentorque</span>
          </div>
          <h1>Turn interview practice into a real conversation.</h1>
          <p>
            Speak with Ava, an adaptive AI interviewer that listens to your answers, asks pinpoint follow-ups, and gives a clear scorecard after every session.
          </p>
          <div className="trust-row">
            <span><Sparkles size={16} /> Adaptive follow-ups</span>
            <span><TimerReset size={16} /> 10 minute focused rounds</span>
            <span><BarChart3 size={16} /> Actionable analysis</span>
          </div>
        </section>

        <section className="auth-panel" aria-label="Authentication">
          <div className="segmented">
            <button className={clsx(authMode === "signup" && "active")} onClick={() => setAuthMode("signup")}>
              Sign up
            </button>
            <button className={clsx(authMode === "login" && "active")} onClick={() => setAuthMode("login")}>
              Log in
            </button>
          </div>
          <form onSubmit={submitAuth} className="stack">
            {authMode === "signup" && (
              <label>
                Name
                <input name="name" autoComplete="name" placeholder="Sahil Kumar" required />
              </label>
            )}
            <label>
              Email
              <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={8} required />
            </label>
            {authError && <p className={clsx("form-error", authError.startsWith("Account created") && "success")}>{authError}</p>}
            <button className="primary-button" type="submit">
              <UserRound size={18} />
              {authMode === "signup" ? "Create account" : "Enter dashboard"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark compact">
          <Mic size={20} />
          <span>Mentorque</span>
        </div>
        <div className="user-menu">
          {user.isAdmin && (
            <button className="ghost-button" onClick={() => navigate("/admin")}>
              <Settings size={16} /> Admin
            </button>
          )}
          <span>{user.name}</span>
          <button className="icon-button" onClick={logout} aria-label="Log out" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Your interview cockpit</p>
          <h1>Welcome back, {user.name.split(" ")[0] || user.name}</h1>
          <p>Start a focused mock interview, continue pending sessions, and track score trends from completed rounds.</p>
        </div>
        <div className="dashboard-stats">
          <StatCard icon={<CheckCircle2 size={19} />} label="Completed" value={completed.length} />
          <StatCard icon={<Clock3 size={19} />} label="Pending" value={pending.length + live.length} />
          <StatCard icon={<BarChart3 size={19} />} label="Avg score" value={averageScore ? `${averageScore}` : "—"} />
        </div>
      </section>

      <section className="dashboard-grid">
        <form className="setup-panel" onSubmit={createInterview}>
          <div>
            <p className="eyebrow">New mock interview</p>
            <h1>Start a focused voice session</h1>
          </div>
          <label>
            Interview package
            <select value={selectedPackage} onChange={(event) => choosePackage(event.target.value)}>
              <option value="">Select a package</option>
              {interviewPackages.map((item) => (
                <option value={item.label} key={item.label}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Role
            <input value={role} onChange={(event) => setRole(event.target.value)} required />
          </label>
          <label>
            Seniority
            <select value={level} onChange={(event) => setLevel(event.target.value as (typeof levels)[number])}>
              {levels.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Interview language
            <select value={language} onChange={(event) => setLanguage(event.target.value as (typeof languages)[number])}>
              {languages.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Focus area
            <textarea value={focus} onChange={(event) => setFocus(event.target.value)} rows={4} required />
          </label>
          <button className="primary-button" type="submit" disabled={creating}>
            <Plus size={18} />
            {creating ? "Creating..." : "Enter voice room"}
          </button>
        </form>

        <section className="history-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">History and analysis</p>
              <h2>Past interviews</h2>
            </div>
            <span>{completed.length} completed • {pending.length + live.length} pending</span>
          </div>

          <div className="interview-list">
            {interviews.length === 0 && <p className="empty-state">Your pending and completed interviews will appear here.</p>}
            {interviews.map((item) => (
              <article className="interview-card" key={item.id}>
                <div>
                  <strong>{item.role}</strong>
                  <p>{item.level} • {item.language} • {item.focus}</p>
                </div>
                <div className="card-actions">
                  <span className={clsx("status-pill", item.status.toLowerCase())}>
                    {statusLabel(item)}
                  </span>
                  <button className="ghost-button" onClick={() => navigate(item.status === "COMPLETED" ? `/interview/${item.id}/report` : `/interview/${item.id}`)}>
                    {item.status === "COMPLETED" ? "View report" : "Resume"} <ArrowRight size={16} />
                  </button>
                </div>
                {item.summary && <p className="summary">{item.summary}</p>}
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <article>
      <span>{icon}</span>
      <strong>{value}</strong>
      <p>{label}</p>
    </article>
  );
}

function statusLabel(item: Interview) {
  if (item.status === "COMPLETED") return item.score ? `Completed · ${item.score}` : "Completed";
  if (item.status === "LIVE") return "In progress";
  return "Pending";
}
