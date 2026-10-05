import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { GeminiUnavailableError, generateWithGemini } from "./gemini.js";

const ReportState = Annotation.Root({
  role: Annotation(),
  level: Annotation(),
  focus: Annotation(),
  language: Annotation(),
  turns: Annotation({
    reducer: (_, value) => value,
    default: () => [],
  }),
  report: Annotation({
    reducer: (_, value) => value,
    default: () => null,
  }),
});

const noAnswersReport = {
  score: 0,
  summary: "The interview ended before the candidate answered any questions, so there is nothing to evaluate yet.",
  strengths: ["Started a mock interview session", "Set up the role and focus area"],
  improvements: ["Answer at least a few questions before ending", "Check that the microphone is allowed and working"],
  nextSteps: ["Start a new interview and introduce yourself", "Use the chat fallback if the microphone is not available"],
};

async function generateReport(state) {
  if (!state.turns.some((turn) => turn.speaker === "candidate")) {
    return { report: noAnswersReport };
  }

  const transcript = state.turns
    .map((turn) => `${turn.speaker.toUpperCase()}: ${turn.text}`)
    .join("\n");

  try {
    const response = await generateWithGemini({
      systemInstruction:
        "You are an interview evaluator. Return strict JSON only with score, summary, strengths, improvements, and nextSteps.",
      prompt: `Evaluate this ${state.level} ${state.role} mock interview focused on ${state.focus}. The interview language mode was ${state.language}. Write the JSON values in clear English for the recruiter-facing scorecard.\n\n${transcript}`,
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["score", "summary", "strengths", "improvements", "nextSteps"],
        properties: {
          score: { type: "integer", minimum: 0, maximum: 100 },
          summary: { type: "string" },
          strengths: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
          improvements: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
          nextSteps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
        },
      },
    });

    const report = JSON.parse(response);
    report.score = Math.max(0, Math.min(100, Math.round(Number(report.score) || 0)));
    return { report };
  } catch (error) {
    // Never save a made-up score: let the client retry the evaluation instead.
    throw new GeminiUnavailableError(
      "The scorecard could not be generated because the AI service is busy. Your transcript is saved — tap Retry in a few seconds.",
      error,
    );
  }
}

const reportGraph = new StateGraph(ReportState)
  .addNode("generateReport", generateReport)
  .addEdge(START, "generateReport")
  .addEdge("generateReport", END)
  .compile();

export async function runInterviewReport(input) {
  const result = await reportGraph.invoke(input);
  return result.report ?? noAnswersReport;
}
