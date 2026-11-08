import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, CheckCircle2, Download, Target, TriangleAlert } from "lucide-react";
import clsx from "clsx";

type InterviewTurn = {
  id?: string;
  speaker: "candidate" | "interviewer";
  text: string;
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
  turns: InterviewTurn[];
  candidateName?: string;
  candidateEmail?: string;
  viewerIsOwner?: boolean;
};

export function InterviewReport({ interviewId }: { interviewId: string }) {
  const navigate = useNavigate();
  const [interview, setInterview] = useState<Interview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadReport() {
      const response = await fetch(`/api/interviews/${interviewId}`);
      if (!response.ok) {
        setError(
          response.status === 401
            ? "Please log in to view this scorecard."
            : response.status === 404
              ? "This scorecard does not exist or you do not have access to it."
              : "Could not load this scorecard. Please refresh the page.",
        );
        return;
      }
      const data = await response.json();
      setInterview(data.interview);
    }

    void loadReport();
  }, [interviewId]);

  if (error) {
    return (
      <main className="report-shell">
        <section className="report-error">
          <TriangleAlert size={24} />
          <p>{error}</p>
          <button className="ghost-button" onClick={() => navigate("/")}>Back to dashboard</button>
        </section>
      </main>
    );
  }

  if (!interview) {
    return (
      <main className="report-shell">
        <section className="report-loading">
          <div className="pulse-orb" />
          <p>Loading scorecard</p>
        </section>
      </main>
    );
  }

  const score = interview.score ?? 0;
  const isComplete = interview.status === "COMPLETED";
  const viewingAsAdmin = interview.viewerIsOwner === false;
  const candidateLabel = viewingAsAdmin ? interview.candidateName || "Candidate" : "You";

  return (
    <main className="report-shell">
      <header className="report-topbar">
        <button className="ghost-button report-back" onClick={() => navigate(viewingAsAdmin ? "/admin" : "/")}>
          <ArrowLeft size={16} /> {viewingAsAdmin ? "Admin panel" : "Dashboard"}
        </button>
        <div>
          <p className="eyebrow">
            {isComplete ? "Interview scorecard" : "Interview in progress"}
            {viewingAsAdmin && ` · ${interview.candidateName}${interview.candidateEmail ? ` (${interview.candidateEmail})` : ""}`}
          </p>
          <h1>{interview.role}</h1>
        </div>
        <button className="ghost-button report-back" onClick={() => window.print()}>
          <Download size={16} /> Save
        </button>
      </header>

      <section className="report-hero">
        <div className="report-score-ring" style={{ "--score": `${score}%` } as CSSProperties}>
          <strong>{isComplete ? score : "—"}</strong>
          <span>/100</span>
        </div>
        <div className="report-summary">
          <div className="report-pills">
            <span>{interview.level}</span>
            <span>{interview.language}</span>
            <span>{interview.turns.length} transcript turns</span>
          </div>
          <h2>{interview.summary || (isComplete ? "Interview complete" : "This interview has not been finished yet, so there is no scorecard. The transcript so far is below.")}</h2>
          <p>{interview.focus}</p>
        </div>
      </section>

      {isComplete && (
        <>
          <ScoreBars score={score} />

          <section className="report-grid">
            <ReportList icon={<CheckCircle2 size={20} />} title="Good parts" items={interview.strengths} tone="good" />
            <ReportList icon={<TriangleAlert size={20} />} title="Bad / weak parts" items={interview.improvements} tone="weak" />
            <ReportList icon={<Target size={20} />} title="How to improve" items={interview.nextSteps} tone="next" />
          </section>
        </>
      )}

      <section className="report-transcript">
        <div className="report-section-heading">
          <div>
            <p className="eyebrow">Review evidence</p>
            <h2>Conversation transcript</h2>
          </div>
          <BarChart3 size={22} />
        </div>
        <div className="report-transcript-feed">
          {interview.turns.map((turn, index) => (
            <article className={clsx("report-turn", turn.speaker)} key={turn.id || `${turn.speaker}-${index}`}>
              <span>{turn.speaker === "interviewer" ? "Ava" : candidateLabel}</span>
              <p>{turn.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function ScoreBars({ score }: { score: number }) {
  const communication = Math.min(100, Math.max(35, score + 6));
  const depth = Math.min(100, Math.max(30, score - 4));
  const clarity = Math.min(100, Math.max(30, Math.round((communication + depth + score) / 3)));

  return (
    <section className="report-bars" aria-label="Interview performance chart">
      <ScoreBar label="Overall readiness" value={score} />
      <ScoreBar label="Communication clarity" value={communication} />
      <ScoreBar label="Answer depth" value={depth} />
      <ScoreBar label="Improvement priority" value={100 - clarity} invert />
    </section>
  );
}

function ScoreBar({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  return (
    <div className={clsx("report-bar", invert && "warning")}>
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <i style={{ "--bar": `${value}%` } as CSSProperties} />
    </div>
  );
}

function ReportList({ icon, title, items, tone }: { icon: ReactNode; title: string; items: string[]; tone: "good" | "weak" | "next" }) {
  return (
    <article className={clsx("report-list", tone)}>
      <h3>{icon}{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}
