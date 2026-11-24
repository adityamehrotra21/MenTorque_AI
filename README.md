# Mentorque AI Interview

Voice-first mock interview platform built on the **MERN stack**. A candidate speaks with **Ava**, an adaptive AI interviewer. Ava listens to each answer, asks a follow-up based on what the candidate actually said, and produces a written scorecard at the end of the session.

**Live demo:** https://mentorque-ai-interview.vercel.app/

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **M**ongoDB | MongoDB Atlas + Mongoose 8 | Stores users, interviews and embedded transcript turns |
| **E**xpress | Express 5 (Node.js) | REST API: auth, interviews, AI responses, admin |
| **R**eact | React 19 + Vite 6 + TypeScript | Single-page app: dashboard, live voice room, scorecard, admin panel |
| **N**ode.js | Node.js 20+ | Runtime for the API (local server and Vercel serverless function) |
| AI | Google Gemini API | Generates each next interviewer question from the full transcript |
| AI workflow | LangGraph (`@langchain/langgraph`) | Turns the finished transcript into a structured scorecard |
| Voice | Browser Web Speech API | Speech-to-text (candidate) and text-to-speech (Ava), with no paid voice provider |
| Routing | React Router 7 | Client-side routes (`/`, `/interview/:id`, `/interview/:id/report`, `/admin`) |
| Auth | JWT (`jsonwebtoken`) in an httpOnly cookie + `bcryptjs` | Email/password sign-up and login |
| Validation | Zod | Request body validation on the API |
| UI | lucide-react icons, plain CSS | Styling and icons |
| Deployment | Vercel (static frontend + serverless Express) | One URL serves both the React app and `/api/*` |

---

## Project Structure

```
Mentorque-ai_interview/
├── frontend/                     # React (Vite) client
│   ├── index.html
│   ├── vite.config.ts            # Dev server; proxies /api → http://localhost:5000
│   ├── public/                   # Static assets (icon, interviewer avatar)
│   └── src/
│       ├── main.tsx              # React entry + BrowserRouter
│       ├── App.tsx               # Route table
│       ├── index.css             # Global styles
│       ├── pages/                # Route-level pages (Home, Interview, Report, Admin)
│       └── components/
│           ├── HomeClient.tsx      # Auth screen + dashboard + new interview form
│           ├── InterviewRoom.tsx   # Live voice interview loop (speech recognition + TTS)
│           ├── InterviewReport.tsx # Scorecard and transcript view
│           └── AdminPanel.tsx      # Admin overview of all users and interviews
│
├── backend/                      # Express + MongoDB API
│   ├── .env.example
│   └── src/
│       ├── server.js             # Local server entry (app.listen)
│       ├── app.js                # Express app: middleware + routes
│       ├── config/               # db.js (cached Mongo connection), env.js
│       ├── models/               # Mongoose models: User, Interview (with embedded turns)
│       ├── middleware/           # auth.js (JWT cookie, requireUser, requireAdmin), error.js
│       ├── controllers/          # authController, interviewController, adminController
│       ├── routes/               # authRoutes, interviewRoutes, adminRoutes
│       ├── services/             # gemini.js, interviewPrompt.js, interviewGraph.js (LangGraph)
│       └── utils/                # validation.js (Zod), httpError.js, toJSON.js
│
├── api/index.js                  # Vercel serverless entry: exports the Express app
├── vercel.json                   # Vercel build, output and rewrite config
├── docker-compose.yml            # Local MongoDB
├── package.json                  # npm workspaces root (frontend + backend)
└── .env.example
```

---

## API Reference

All routes are prefixed with `/api`. Protected routes need the `mentorque_token` cookie set by login.

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Health check |
| POST | `/auth/signup` | — | Create an account `{ name, email, password }` |
| POST | `/auth/login` | — | Log in and set the session cookie `{ email, password }` |
| POST | `/auth/logout` | — | Clear the session cookie |
| GET | `/auth/me` | — | Current user (or `null`), including `isAdmin` |
| GET | `/interviews` | User | List the user's interviews |
| POST | `/interviews` | User | Create an interview `{ role, level, language, focus }` |
| GET | `/interviews/:id` | User | Interview with full transcript |
| POST | `/interviews/:id/respond` | User | Save the candidate's answer and return Ava's next question `{ text?, directorNote? }` |
| POST | `/interviews/:id/complete` | User | Run the LangGraph evaluator and save the scorecard |
| GET | `/admin/overview` | Admin | Stats plus every user and interview |

---

## Getting Started (Local)

**Requirements:** Node.js 20+, and MongoDB (local Docker, or a free MongoDB Atlas cluster).

```bash
# 1. Install all dependencies (frontend + backend via npm workspaces)
npm install

# 2. Start MongoDB locally (skip if you use Atlas)
docker compose up -d

# 3. Configure the backend
cp backend/.env.example backend/.env
#    then fill in GEMINI_API_KEY, JWT_SECRET, ADMIN_EMAILS, MONGODB_URI

# 4. Run the API (port 5000) and the React app (port 5173) together
npm run dev
```

Open http://localhost:5173 in the latest Chrome or Edge, create an account, choose English, Hindi or Hinglish, allow microphone access and speak naturally. Say "end my interview" or "interview khatam" to finish by voice.

| Script | What it does |
|---|---|
| `npm run dev` | Backend + frontend together |
| `npm run dev:backend` | Express API only (`node --watch`) |
| `npm run dev:frontend` | Vite dev server only |
| `npm run build` | Production build of the React app → `frontend/dist` |
| `npm start` | Start the Express API in production mode |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB connection string, e.g. `mongodb+srv://USER:PASS@cluster.mongodb.net/mentorque` |
| `JWT_SECRET` | ✅ | Long random string used to sign session cookies |
| `GEMINI_API_KEY` | ✅ | Free API key from Google AI Studio |
| `GEMINI_MODEL` | — | Primary model, defaults to `gemini-3.1-flash-lite` |
| `GEMINI_FALLBACK_MODELS` | — | Comma-separated backup models used when the primary is overloaded (default `gemini-2.5-flash-lite,gemini-2.5-flash`) |
| `ADMIN_EMAILS` | — | Comma-separated emails that can open `/admin`, e.g. `owner@example.com,contributor@example.com` (`ADMIN_EMAIL` also works) |
| `CLIENT_URL` | — | Allowed CORS origin when frontend and API run on different origins (default `http://localhost:5173`) |
| `PORT` | — | Local API port (default `5000`) |

---

## Deployment (Vercel)

The repo deploys to Vercel as a single project:

- **Frontend:** `npm run build` builds the React app into `frontend/dist`, which Vercel serves as static files.
- **Backend:** `api/index.js` exports the Express app as a Vercel serverless function. `vercel.json` rewrites every `/api/*` request to it, and every other path to `index.html` so React Router can handle it.
- **Database:** MongoDB Atlas (the free M0 cluster works). Under *Network Access*, allow `0.0.0.0/0` so Vercel's serverless functions can connect.

Steps:

1. Create a free MongoDB Atlas cluster and copy its connection string.
2. Import the GitHub repo into Vercel. `vercel.json` sets the build, so leave Framework Preset as **Other** and keep the Root Directory as the repo root.
3. Under **Settings → Environment Variables**, add `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL` and `ADMIN_EMAILS`.
4. Deploy. Every push to `main` redeploys automatically.

---

## How the Interview Works

1. `InterviewRoom.tsx` uses the browser's SpeechRecognition to capture the candidate's answer.
2. The answer is sent to `POST /api/interviews/:id/respond`. The API saves it as a turn in MongoDB and sends the **full transcript** to Gemini, with interviewer instructions from `services/interviewPrompt.js`. There is no static question bank.
3. Ava's reply is saved and returned. The browser reads it aloud with SpeechSynthesis.
4. When the interview ends, `POST /api/interviews/:id/complete` runs a LangGraph workflow (`services/interviewGraph.js`) that scores the transcript and returns a summary, strengths, improvements and next steps.

## Reliability

- **AI busy / high demand:** every Gemini call retries temporary errors (429/5xx/timeouts) with backoff, then falls back to `GEMINI_FALLBACK_MODELS`, all within the Vercel time limit. If Gemini is still unavailable, the interview **pauses with a Retry button** instead of stopping, the timer pauses, and the candidate's answer is not lost (it is saved only after Ava replies, so retries never create duplicates).
- **Scorecards are never faked:** if evaluation fails, the transcript is kept and the candidate can retry the scorecard.
- **Speech recognition:** the mic listens continuously and sends the answer only after a ~2 second pause (no more cut-off sentences), uses Indian-English recognition for English/Hinglish (`en-IN`) and `hi-IN` for Hindi, and picks the most confident alternative. Gemini then quietly fixes obvious misheard words in the saved transcript.
- **No microphone?** The interview continues in the chat box instead of stopping.
- **Admins** can open any candidate's scorecard or in-progress transcript (read-only) from `/admin`.

## Notes

- No OAuth: candidates self-register with email and password.
- Voice is the main interview surface. The live room has no chat box.
- Speech quality and recognition depend on the user's browser and operating system.
