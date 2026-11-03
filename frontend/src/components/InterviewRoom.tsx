import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Captions, CircleStop, Clock, Loader2, MessageSquare, Mic, MicOff, PhoneCall, RotateCcw, Send, ShieldCheck, Sparkles, Video, Volume2 } from "lucide-react";
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
  candidateName: string;
  focus: string;
  status: "CREATED" | "LIVE" | "COMPLETED";
  score: number | null;
  summary: string | null;
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
  turns: InterviewTurn[];
};

type SpeechAlternativeLike = { transcript: string; confidence: number };

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: SpeechAlternativeLike;
    };
  };
};

type RetryAction = { kind: "turn"; candidateText?: string; directorNote?: string } | { kind: "complete" };

/** How long the candidate can pause before their answer is treated as finished. */
const END_OF_ANSWER_SILENCE_MS = 2200;

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function InterviewRoom({ interviewId }: { interviewId: string }) {
  const navigate = useNavigate();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const processingRef = useRef(false);
  const mutedRef = useRef(false);
  const finalPromptAskedRef = useRef(false);
  const endingRef = useRef(false);
  const requestNextTurnRef = useRef<(candidateText?: string, directorNote?: string) => Promise<void>>(async () => {});
  const endInterviewRef = useRef<() => Promise<void>>(async () => {});
  const selectedVoiceRef = useRef("");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const answerBufferRef = useRef("");
  const pausedForRetryRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const busyNoticeTimerRef = useRef<number | null>(null);

  const [interview, setInterview] = useState<Interview | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "connecting" | "live" | "ending" | "complete" | "error">("loading");
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Preparing the room");
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [liveCandidateText, setLiveCandidateText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [currentTime, setCurrentTime] = useState("--:--");
  const [remainingSeconds, setRemainingSeconds] = useState(600);
  const [micNotice, setMicNotice] = useState("");
  const [retryAction, setRetryActionState] = useState<RetryAction | null>(null);

  function setRetryAction(action: RetryAction | null) {
    pausedForRetryRef.current = Boolean(action);
    setRetryActionState(action);
  }

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/interviews/${interviewId}`);
      if (!response.ok) {
        setError("Could not load this interview.");
        setPhase("error");
        return;
      }
      const data = await response.json();
      setInterview(data.interview);
      setTurns(data.interview.turns || []);
      if (data.interview.status === "COMPLETED") {
        navigate(`/interview/${interviewId}/report`, { replace: true });
        return;
      }
      setPhase(data.interview.status === "COMPLETED" ? "complete" : "ready");
      setStatus("Ready when you are");
    }

    void load();
    return () => cleanup();
  }, [interviewId, navigate]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const languageVoices = window.speechSynthesis
        .getVoices()
        .filter((voice) => isVoiceForLanguage(voice, interview?.language || "English"));
      const clearInterviewVoices = languageVoices.filter(isClearInterviewVoice);
      const availableVoices = (clearInterviewVoices.length > 0 ? clearInterviewVoices : languageVoices).sort(
        (first, second) => voiceQualityScore(second, interview?.language || "English") - voiceQualityScore(first, interview?.language || "English"),
      );

      setSelectedVoice((current) => {
        if (current && availableVoices.some((voice) => voice.voiceURI === current)) return current;
        const savedVoice = window.localStorage.getItem("mentorque-voice");
        if (savedVoice && availableVoices.some((voice) => voice.voiceURI === savedVoice)) return savedVoice;
        return availableVoices[0]?.voiceURI || "";
      });
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [interview?.language]);

  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
    if (selectedVoice) window.localStorage.setItem("mentorque-voice", selectedVoice);
  }, [selectedVoice]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, liveCandidateText]);

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    updateTime();
    const timer = window.setInterval(updateTime, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function clearSilenceTimer() {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
  }

  function cleanup() {
    clearSilenceTimer();
    if (busyNoticeTimerRef.current) window.clearTimeout(busyNoticeTimerRef.current);
    answerBufferRef.current = "";
    activeRef.current = false;
    processingRef.current = false;
    speakingRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
  }

  function startListening() {
    if (!activeRef.current || mutedRef.current || speakingRef.current || processingRef.current || pausedForRetryRef.current) return;

    try {
      setStatus("Listening");
      recognitionRef.current?.start();
    } catch {
      window.setTimeout(() => {
        if (activeRef.current && !mutedRef.current) startListening();
      }, 300);
    }
  }

  function speak(text: string) {
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const languageVoices = voices.filter((voice) => isVoiceForLanguage(voice, interview?.language || "English"));
      const clearInterviewVoices = languageVoices.filter(isClearInterviewVoice);
      const preferredVoice =
        voices.find((voice) => voice.voiceURI === selectedVoiceRef.current) ||
        (clearInterviewVoices.length > 0 ? clearInterviewVoices : languageVoices).sort(
          (first, second) => voiceQualityScore(second, interview?.language || "English") - voiceQualityScore(first, interview?.language || "English"),
        )[0];

      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.lang = preferredVoice?.lang || speechLanguageFor(interview?.language || "English");
      utterance.rate = interview?.language === "Hindi" ? 0.86 : 0.9;
      utterance.pitch = 1.02;
      utterance.volume = 1;
      utterance.onstart = () => {
        speakingRef.current = true;
        setStatus("Interviewer is speaking");
      };
      utterance.onend = () => {
        speakingRef.current = false;
        resolve();
      };
      utterance.onerror = () => {
        speakingRef.current = false;
        reject(new Error("Browser speech output failed."));
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  useEffect(() => {
    if (phase !== "live" || retryAction) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase, retryAction]);

  useEffect(() => {
    if (phase !== "live" || retryAction) return;
    if (remainingSeconds <= 60 && remainingSeconds > 0 && !finalPromptAskedRef.current && !processingRef.current && !speakingRef.current) {
      finalPromptAskedRef.current = true;
      void requestNextTurnRef.current(undefined, "Only one minute remains. Briefly announce wrap-up and ask one final pinpoint question based on the strongest gap in the conversation.");
    }
    if (remainingSeconds === 0) {
      void endInterviewRef.current();
    }
  }, [phase, remainingSeconds, retryAction]);

  async function requestNextTurn(candidateText?: string, directorNote?: string, isRetry = false) {
    processingRef.current = true;
    clearSilenceTimer();
    answerBufferRef.current = "";
    setRetryAction(null);
    setError("");
    if (candidateText && !isRetry) {
      setTurns((current) => [...current, { speaker: "candidate", text: candidateText }]);
    }
    setLiveCandidateText("");
    setStatus(candidateText ? "Interviewer is thinking" : "Interviewer is joining");
    // The server retries busy AI models automatically; tell the candidate if that takes a while.
    if (busyNoticeTimerRef.current) window.clearTimeout(busyNoticeTimerRef.current);
    busyNoticeTimerRef.current = window.setTimeout(() => {
      if (processingRef.current) setStatus("AI is busy, retrying automatically…");
    }, 7000);

    try {
      const response = await fetch(`/api/interviews/${interviewId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: candidateText, directorNote }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Ava could not reply. Tap Retry to continue.");
      }
      if (busyNoticeTimerRef.current) window.clearTimeout(busyNoticeTimerRef.current);
      if (endingRef.current) {
        processingRef.current = false;
        return;
      }

      setTurns((current) => {
        const next = [...current];
        // Show the cleaned-up version of what the candidate said.
        if (candidateText && data.candidateText) {
          for (let index = next.length - 1; index >= 0; index -= 1) {
            if (next[index].speaker === "candidate") {
              next[index] = { ...next[index], text: data.candidateText };
              break;
            }
          }
        }
        return [...next, { speaker: "interviewer", text: data.reply }];
      });
      processingRef.current = false;
      if (endingRef.current) return;
      try {
        await speak(data.reply);
      } catch {
        // If the browser voice fails, the question is still visible in the transcript.
        setStatus("Read Ava's question in the transcript, then answer");
      }
      if (activeRef.current && !mutedRef.current) {
        window.setTimeout(startListening, 250);
      }
    } catch (requestError) {
      if (busyNoticeTimerRef.current) window.clearTimeout(busyNoticeTimerRef.current);
      processingRef.current = false;
      if (endingRef.current) return;
      // Keep the interview alive: pause and let the candidate retry the same turn.
      recognitionRef.current?.abort();
      setError(requestError instanceof Error ? requestError.message : "Ava could not reply. Tap Retry to continue.");
      setRetryAction({ kind: "turn", candidateText, directorNote });
      setStatus("Paused — tap Retry to continue");
    }
  }

  async function retryLastStep() {
    const action = retryAction;
    if (!action) return;
    if (action.kind === "complete") {
      endingRef.current = false;
      await endInterview();
      return;
    }
    await requestNextTurn(action.candidateText, action.directorNote, true);
  }

  async function finishByVoiceCommand(candidateText: string) {
    processingRef.current = true;
    setTurns((current) => [...current, { speaker: "candidate", text: candidateText }]);
    setLiveCandidateText("");
    setStatus("Ending interview by voice");
    await endInterview();
  }

  async function submitChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatDraft.trim();
    if (!message || processingRef.current || pausedForRetryRef.current || phase === "ending" || phase === "complete") return;

    setChatDraft("");
    if (isEndInterviewCommand(message)) {
      await finishByVoiceCommand(message);
      return;
    }
    await requestNextTurn(message);
  }

  function submitBufferedAnswer() {
    clearSilenceTimer();
    const answer = answerBufferRef.current.replace(/\s+/g, " ").trim();
    if (!answer || !activeRef.current || processingRef.current) return;
    answerBufferRef.current = "";
    recognitionRef.current?.abort();
    if (isEndInterviewCommand(answer)) {
      void finishByVoiceCommand(answer);
      return;
    }
    void requestNextTurnRef.current(answer);
  }

  function configureRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      throw new Error("Voice recognition is not supported here. Use the latest Chrome or Edge.");
    }

    const recognition = new Recognition();
    // Keep listening through short pauses; the answer is sent after a longer silence.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = speechLanguageFor(interview?.language || "English");

    recognition.onresult = (event) => {
      if (!activeRef.current || processingRef.current || speakingRef.current || pausedForRetryRef.current) return;
      let interimTranscript = "";

      for (let resultIndex = event.resultIndex; resultIndex < event.results.length; resultIndex += 1) {
        const result = event.results[resultIndex];
        if (!result) continue;
        const transcript = bestAlternative(result);
        if (result.isFinal) {
          answerBufferRef.current = `${answerBufferRef.current} ${transcript}`.trim();
        } else {
          interimTranscript += transcript;
        }
      }

      const visible = `${answerBufferRef.current} ${interimTranscript}`.replace(/\s+/g, " ").trim();
      setLiveCandidateText(visible);
      if (visible) setStatus("Listening — pause for a moment when you finish");

      // Restart the end-of-answer countdown every time new speech arrives.
      clearSilenceTimer();
      if (answerBufferRef.current || interimTranscript) {
        silenceTimerRef.current = window.setTimeout(() => {
          if (interimTranscript && !answerBufferRef.current.endsWith(interimTranscript.trim())) {
            answerBufferRef.current = `${answerBufferRef.current} ${interimTranscript}`.trim();
          }
          submitBufferedAnswer();
        }, END_OF_ANSWER_SILENCE_MS);
      }
    };

    recognition.onerror = (event) => {
      if (!activeRef.current || event.error === "aborted") return;
      if (event.error === "no-speech") {
        setStatus("I am listening");
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") {
        // Keep the interview going in chat mode instead of stopping it.
        mutedRef.current = true;
        setMuted(true);
        setLiveCandidateText("");
        setStatus("Microphone unavailable — answer in the chat box");
        setMicNotice(
          event.error === "audio-capture"
            ? "No microphone was found. Connect one and press the mic button, or type your answers in the chat box."
            : "Microphone access is blocked. Allow it from the icon in the address bar and press the mic button, or type your answers in the chat box.",
        );
        return;
      }
      if (event.error === "network") {
        setStatus("Speech service hiccup, listening again");
        return;
      }
      setStatus("Listening again");
    };

    recognition.onend = () => {
      // Chrome ends recognition sessions on its own; resume while keeping what was already heard.
      if (activeRef.current && !mutedRef.current && !speakingRef.current && !processingRef.current) {
        window.setTimeout(startListening, 250);
      }
    };

    recognitionRef.current = recognition;
  }

  async function startInterview() {
    try {
      setError("");
      setPhase("connecting");
      setStatus("Checking voice support");

      if (!("speechSynthesis" in window)) {
        throw new Error("Speech output is not supported in this browser.");
      }

      configureRecognition();
      endingRef.current = false;
      activeRef.current = true;
      mutedRef.current = false;
      finalPromptAskedRef.current = false;
      setRemainingSeconds(600);
      setMuted(false);
      setPhase("live");
      await requestNextTurn();
    } catch (startError) {
      cleanup();
      setError(startError instanceof Error ? startError.message : "Could not start the interview.");
      setPhase("error");
    }
  }

  function toggleMute() {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);

    setMicNotice("");
    if (nextMuted) {
      recognitionRef.current?.abort();
      clearSilenceTimer();
      answerBufferRef.current = "";
      setLiveCandidateText("");
      setStatus("Microphone paused");
    } else if (activeRef.current && !speakingRef.current && !processingRef.current) {
      startListening();
    }
  }

  async function endInterview() {
    if (endingRef.current) return;
    endingRef.current = true;
    setPhase("ending");
    setStatus("Creating scorecard");
    setRetryAction(null);
    setError("");
    cleanup();
    try {
      const response = await fetch(`/api/interviews/${interviewId}/complete`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not create the scorecard.");
      setInterview(data.interview);
      setPhase("complete");
      setStatus("Scorecard ready");
      navigate(`/interview/${interviewId}/report`);
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Could not create the scorecard.");
      setRetryAction({ kind: "complete" });
      setStatus("Scorecard paused — tap Retry");
    }
  }

  requestNextTurnRef.current = requestNextTurn;
  endInterviewRef.current = endInterview;

  return (
    <main className="meeting-shell">
      <header className="meeting-topbar">
        <div className="meeting-title">
          <button className="ghost-button meeting-back" onClick={() => navigate("/")}>
            <ArrowLeft size={16} /> Dashboard
          </button>
          <span />
          <strong>{interview ? `${interview.role} Mock Interview` : "Mentorque Interview"}</strong>
          <b>Mentorque</b>
        </div>
        <div className="meeting-status">
          <span className={clsx("proctor-pill", phase === "live" && "active")}>
            <ShieldCheck size={15} /> {phase === "live" ? "Interview live" : "Ready"}
          </span>
          <span className="meeting-timer"><Clock size={15} /> {formatTimer(remainingSeconds)}</span>
        </div>
      </header>

      <section className="meeting-layout">
        <section className="meeting-stage">
          <div className="stage-subtitle">
            <Sparkles size={18} />
            <span>{status}</span>
          </div>

          <div className="meeting-grid">
            <article className={clsx("participant-tile ai-tile", speakingRef.current && "speaking")}>
              <div className="participant-avatar-wrap">
                <span className="speaking-ring" />
                <img className="photo-avatar" src="/ai-interviewer-avatar.svg" alt="AI interviewer Ava" width={126} height={126} fetchPriority="high" />
              </div>
              <div className="participant-caption">
                <strong>Ava · AI Interviewer</strong>
                <span>{speakingRef.current ? "Speaking" : processingRef.current ? "Thinking" : "Ready"}</span>
              </div>
            </article>

            <article className={clsx("participant-tile candidate-tile", liveCandidateText && "speaking")}>
              <div className="candidate-orb">
                <span>{candidateInitial(interview?.candidateName)}</span>
                <Mic size={28} />
              </div>
              <div className="participant-caption">
                <strong>{interview?.candidateName || "You"}</strong>
                <span>{liveCandidateText ? "Speaking" : muted ? "Muted" : "Listening"}</span>
              </div>
            </article>
          </div>

          <div className="invigilator-card">
            <img src="/ai-interviewer-avatar.svg" alt="" width={48} height={48} />
            <div>
              <strong>AI Invigilator</strong>
              <span>Transcript, voice, and progress are monitored for your scorecard.</span>
            </div>
          </div>

          {interview && (
            <div className="meeting-details">
              <span>{interview.level}</span>
              <span>{interview.language}</span>
              <span>{interview.focus}</span>
            </div>
          )}
        </section>

        <aside className="meeting-side-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Interview transcript</p>
              <h2><Captions size={19} /> Live transcript</h2>
            </div>
            <span>{turns.length}</span>
          </div>

          <div className="transcript-alert">
            <MessageSquare size={17} />
            <span>Captions may contain minor speech-recognition mistakes. AI responses still use full context.</span>
          </div>

          <div className="meeting-transcript-feed" aria-live="polite">
            {turns.length === 0 && !liveCandidateText && (
              <div className="empty-transcript">
                <Volume2 size={22} />
                <p>Start the interview and Ava will ask for your intro first.</p>
              </div>
            )}
            {turns.map((turn, index) => (
              <article className={clsx("meeting-transcript-turn", turn.speaker)} key={turn.id || `${turn.speaker}-${index}`}>
                <span>{turn.speaker === "interviewer" ? "Ava" : "You"}</span>
                <p>{turn.text}</p>
              </article>
            ))}
            {liveCandidateText && (
              <article className="meeting-transcript-turn candidate live-caption">
                <span>You · speaking</span>
                <p>{liveCandidateText}</p>
              </article>
            )}
            <div ref={transcriptEndRef} />
          </div>

          <form className="chat-fallback" onSubmit={submitChatMessage}>
            <label htmlFor="chat-fallback-input">Chat fallback</label>
            <div>
              <input
                id="chat-fallback-input"
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder="Type only if mic fails..."
                disabled={processingRef.current || phase === "ending" || phase === "complete"}
              />
              <button type="submit" disabled={!chatDraft.trim() || processingRef.current || phase === "ending" || phase === "complete"}>
                <Send size={17} />
              </button>
            </div>
          </form>
        </aside>
      </section>

      <section className="meeting-controlbar">
        <div className="meeting-footer-title">
          <strong>Mentorque AI Interview</strong>
          <span>{currentTime}</span>
        </div>

        <div className="meeting-controls">
          {(phase === "connecting" || phase === "ending" || phase === "loading") && (
            <button className="round-button meeting-round" disabled>
              <Loader2 className="spin" size={22} />
            </button>
          )}
          {phase === "ready" && (
            <button className="call-button meeting-start" onClick={startInterview}>
              <PhoneCall size={22} /> Start interview
            </button>
          )}
          {phase === "live" && (
            <>
              <button className="round-button meeting-round" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"}>
                {muted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              <button className="round-button meeting-round" disabled aria-label="Camera placeholder" title="Voice-first interview">
                <Video size={22} />
              </button>
              <button className="end-button meeting-end" onClick={endInterview}>
                <CircleStop size={21} /> End Interview
              </button>
            </>
          )}
        </div>

        <div className="meeting-audio">
          <span><Volume2 size={16} /> Voice auto-selected</span>
        </div>
      </section>

      {micNotice && !retryAction && (
        <div className="error-panel meeting-error retry-panel" role="status">
          <strong>Microphone needs attention</strong>
          <p>{micNotice}</p>
        </div>
      )}

      {retryAction && (
        <div className="error-panel meeting-error retry-panel" role="alert">
          <strong>{retryAction.kind === "complete" ? "Scorecard is waiting" : "Ava is reconnecting"}</strong>
          <p>{error}</p>
          <button className="primary-button" onClick={() => void retryLastStep()}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="error-panel meeting-error">
          <strong>Something needs attention</strong>
          <p>{error}</p>
        </div>
      )}

    </main>
  );
}

function voiceQualityScore(voice: SpeechSynthesisVoice, language: Interview["language"]) {
  const voiceName = voice.name.toLowerCase();
  const voiceLang = voice.lang.toLowerCase();
  let score = voiceLang === "en-us" ? 20 : 10;

  if (language === "English" && voiceLang === "en-in") score -= 45;
  if (language === "English" && (voiceLang === "en-us" || voiceLang === "en-gb")) score += 35;
  if (language === "Hinglish" && voiceLang === "en-in") score += 80;
  if (language === "Hindi" && voiceLang.startsWith("hi")) score += 120;
  if (/natural|premium|enhanced/.test(voiceName)) score += 100;
  if (/google us english/.test(voiceName)) score += 95;
  if (language !== "English" && /google हिन्दी|lekha|kalpana|heera|rishi/.test(voiceName)) score += 95;
  if (language === "English" && /samantha|daniel|allison|ava/.test(voiceName)) score += 120;
  if (/microsoft (aria|jenny|ava|guy|davis)/.test(voiceName)) score += 90;
  if (/samantha|ava|allison|daniel/.test(voiceName)) score += 80;
  if (/karen|moira|rishi|reed|shelley|sandy|flo/.test(voiceName)) score += 55;
  if (/google|microsoft/.test(voiceName)) score += 40;
  if (voice.localService) score += 8;

  return score;
}

function isVoiceForLanguage(voice: SpeechSynthesisVoice, language: Interview["language"]) {
  const voiceLang = voice.lang.toLowerCase();
  if (language === "Hindi") return voiceLang.startsWith("hi") || voiceLang === "en-in";
  if (language === "Hinglish") return voiceLang === "en-in" || voiceLang.startsWith("hi") || voiceLang.startsWith("en");
  return voiceLang.startsWith("en");
}

function isClearInterviewVoice(voice: SpeechSynthesisVoice) {
  const voiceName = voice.name.toLowerCase();
  const noveltyVoice = /bad news|good news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|fred|ralph|albert|grandma|grandpa|rocko/.test(
    voiceName,
  );

  return !noveltyVoice;
}

function speechLanguageFor(language: Interview["language"]) {
  if (language === "Hindi") return "hi-IN";
  if (language === "Hinglish") return "en-IN";
  // Indian-English recognition is far more accurate for Indian accents. Use the browser's own
  // English locale only when it is clearly a different English variant (e.g. en-GB, en-AU).
  const browserEnglish = (navigator.languages || [navigator.language]).find((lang) => /^en-(in|gb|au|ca|nz|ie|za|sg)$/i.test(lang));
  return browserEnglish || "en-IN";
}

function bestAlternative(result: { length: number; [index: number]: SpeechAlternativeLike }) {
  let best = result[0];
  for (let index = 1; index < result.length; index += 1) {
    if ((result[index]?.confidence || 0) > (best?.confidence || 0)) best = result[index];
  }
  return best?.transcript || "";
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function candidateInitial(name?: string) {
  return name?.trim().charAt(0).toUpperCase() || "Y";
}

function isEndInterviewCommand(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    "end my interview",
    "end interview",
    "finish my interview",
    "stop interview",
    "complete my interview",
    "interview khatam",
    "mera interview khatam",
    "interview band",
    "बस इंटरव्यू खत्म",
    "मेरा इंटरव्यू खत्म",
    "इंटरव्यू खत्म",
    "इंटरव्यू बंद",
  ].some((command) => normalized.includes(command));
}
