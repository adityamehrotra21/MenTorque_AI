import mongoose from "mongoose";
import { isAdmin } from "../middleware/auth.js";
import { Interview } from "../models/Interview.js";
import { generateWithGemini } from "../services/gemini.js";
import { runInterviewReport } from "../services/interviewGraph.js";
import { buildInterviewInstructions } from "../services/interviewPrompt.js";
import { HttpError } from "../utils/httpError.js";
import { interviewCreateSchema } from "../utils/validation.js";

/** Summary shape used by list views: no transcript, just a turn count. */
export function toSummary(doc) {
  const { turns = [], ...rest } = doc;
  return { ...rest, id: String(doc._id), _id: undefined, __v: undefined, user: undefined, _count: { turns: turns.length } };
}

async function findOwnedInterview(id, userId) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "Interview not found.");
  const interview = await Interview.findOne({ _id: id, user: userId });
  if (!interview) throw new HttpError(404, "Interview not found.");
  return interview;
}

/** Owners can read their interview; admins can read any interview (read-only). */
async function findReadableInterview(id, user) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "Interview not found.");
  const filter = isAdmin(user.email) ? { _id: id } : { _id: id, user: user.id };
  const interview = await Interview.findOne(filter).populate("user", "name email");
  if (!interview) throw new HttpError(404, "Interview not found.");
  return interview;
}

const replySchema = {
  type: "object",
  additionalProperties: false,
  required: ["cleanedAnswer", "reply"],
  properties: {
    cleanedAnswer: {
      type: "string",
      description:
        "The candidate's latest answer with obvious speech-recognition mistakes fixed (misheard words, punctuation, casing). Keep their wording, meaning and language; do not add content.",
    },
    reply: { type: "string", description: "The interviewer's next short spoken response." },
  },
};

export async function listInterviews(req, res) {
  const interviews = await Interview.find({ user: req.user.id }).sort({ createdAt: -1 }).lean();
  res.json({ interviews: interviews.map(toSummary) });
}

export async function createInterview(req, res) {
  const parsed = interviewCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please choose a valid interview setup." });
  }
  const interview = await Interview.create({ ...parsed.data, user: req.user.id });
  res.status(201).json({ interview });
}

export async function getInterview(req, res) {
  const interview = await findReadableInterview(req.params.id, req.user);
  const owner = interview.user;
  const isOwner = String(owner?._id ?? owner) === req.user.id;
  const data = interview.toJSON();
  res.json({
    interview: {
      ...data,
      user: String(owner?._id ?? owner),
      candidateName: owner?.name || req.user.name,
      candidateEmail: isOwner ? undefined : owner?.email,
      viewerIsOwner: isOwner,
    },
  });
}

export async function respond(req, res) {
  const interview = await findOwnedInterview(req.params.id, req.user.id);
  if (interview.status === "COMPLETED") throw new HttpError(409, "This interview is already completed.");

  const rawAnswer = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 6000) : "";
  const directorNote = typeof req.body?.directorNote === "string" ? req.body.directorNote.trim() : "";

  // Nothing is written until Gemini answers, so a failed call can simply be retried by the client
  // without duplicating the candidate's answer.
  const turns = rawAnswer
    ? [...interview.turns.map((turn) => ({ speaker: turn.speaker, text: turn.text })), { speaker: "candidate", text: rawAnswer }]
    : interview.turns;
  const transcript =
    turns.length === 0
      ? "The interview has not started yet."
      : turns.map((turn) => `${turn.speaker.toUpperCase()}: ${turn.text}`).join("\n");
  const candidateAnswerCount = turns.filter((turn) => turn.speaker === "candidate").length;
  const turnDirection =
    candidateAnswerCount === 0
      ? "This is the opening turn. Ask only for the candidate's introduction, relevant experience, and practice goal. Do not ask the first interview question yet."
      : candidateAnswerCount === 1
        ? "The candidate has just given their introduction. Briefly acknowledge one specific detail from it, then ask the first interview question grounded in that exact detail."
        : "Choose the next response from the candidate's latest answer and the full context. Follow up when useful; otherwise transition naturally using something they already shared.";
  const timingDirection = directorNote ? `\nTiming/director note: ${directorNote.slice(0, 500)}` : "";
  const systemInstruction = buildInterviewInstructions({
    role: interview.role,
    level: interview.level,
    focus: interview.focus,
    language: interview.language,
    candidateName: req.user.name,
  });

  let reply;
  let cleanedAnswer = rawAnswer;

  if (rawAnswer) {
    // One call returns both the cleaned-up transcript of the answer and Ava's next line.
    const output = await generateWithGemini({
      systemInstruction,
      prompt: `Here is the complete interview so far (the last CANDIDATE line is raw speech-recognition output):\n\n${transcript}\n\nTurn direction: ${turnDirection}${timingDirection}\n\nReturn JSON with:\n- cleanedAnswer: the last candidate answer with only obvious speech-recognition mistakes corrected.\n- reply: the interviewer's next short spoken response, with no labels, markdown, scoring, or analysis.`,
      jsonSchema: replySchema,
      temperature: 0.6,
    });
    try {
      const parsed = JSON.parse(output);
      reply = String(parsed.reply || "").trim();
      const cleaned = String(parsed.cleanedAnswer || "").trim();
      // Guard against the model rewriting the answer into something else.
      if (cleaned && cleaned.length >= rawAnswer.length * 0.5 && cleaned.length <= rawAnswer.length * 1.6 + 20) {
        cleanedAnswer = cleaned.slice(0, 6000);
      }
    } catch {
      reply = output.trim();
    }
  } else {
    reply = await generateWithGemini({
      systemInstruction,
      prompt: `Here is the complete interview so far:\n\n${transcript}\n\nTurn direction: ${turnDirection}${timingDirection}\n\nGenerate only the interviewer's next short spoken response. Do not include labels, markdown, scoring, or analysis.`,
    });
  }

  if (!reply) throw new HttpError(503, "Ava could not find the next question. Tap Retry to continue.");

  if (rawAnswer) interview.turns.push({ speaker: "candidate", text: cleanedAnswer });
  interview.turns.push({ speaker: "interviewer", text: reply });
  interview.status = "LIVE";
  interview.startedAt = interview.startedAt ?? new Date();
  await interview.save();

  res.json({ reply, candidateText: rawAnswer ? cleanedAnswer : undefined });
}

export async function completeInterview(req, res) {
  const interview = await findOwnedInterview(req.params.id, req.user.id);

  const report = await runInterviewReport({
    role: interview.role,
    level: interview.level,
    focus: interview.focus,
    language: interview.language,
    turns: interview.turns.map((turn) => ({ speaker: turn.speaker, text: turn.text })),
  });

  Object.assign(interview, {
    status: "COMPLETED",
    endedAt: new Date(),
    score: report.score,
    summary: report.summary,
    strengths: report.strengths,
    improvements: report.improvements,
    nextSteps: report.nextSteps,
  });
  await interview.save();

  res.json({ interview });
}
