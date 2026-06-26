// OpenAI-compatible LLM client + interviewer/examiner prompts, with a responsive offline fallback.
// Every model call is time-boxed and falls back instantly so the conversation never stalls.
import { getConfig } from './config.js';

export const TALKING_HEAD_LINES = {
  job: {
    turns: [
      'Hi, thanks for joining today. Please introduce yourself briefly.',
      'What interested you in this role?',
      'Tell me about a difficult situation at work and how you handled it.',
      'How do you help an upset customer?',
      'What would your colleagues say are your biggest strengths?',
      'Why are you a good fit for this position?',
    ],
    expand: 'Could you tell me a little more about that?',
    refocus: "Let's stay with the question and try that again.",
  },
  ielts: {
    turns: [
      "Hello, and welcome. Let's begin. Where do you live?",
      'What do you usually do in your free time?',
      'Describe a skill you would like to learn. What is it, why do you want it, and how would you learn it?',
      'How important is it for people to keep learning new things?',
      'Do you think people\'s daily routines will change much in the future?',
      'Do you prefer spending time indoors or outdoors? Why?',
    ],
    expand: 'Could you tell me a little more about that?',
    refocus: "Let's stay with the question and try that again.",
  },
  shared: {
    closing: 'Thank you. The interview is complete. I am preparing your results.',
  },
};

export function talkingHeadScript(kind = 'ielts', totalTurns = 6) {
  const base = TALKING_HEAD_LINES[kind] || TALKING_HEAD_LINES.ielts;
  return base.turns.slice(0, Math.max(1, Math.min(totalTurns || 6, base.turns.length)));
}

export function talkingHeadLine(kind = 'ielts', key = 'expand') {
  const base = TALKING_HEAD_LINES[kind] || TALKING_HEAD_LINES.ielts;
  return base[key] || TALKING_HEAD_LINES.shared[key] || '';
}

export async function chat(messages, { json = false, timeoutMs = 20000 } = {}) {
  const c = getConfig();
  if (!c.llmUrl || !c.llmModel) return null;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(c.llmUrl, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(c.llmKey ? { Authorization: 'Bearer ' + c.llmKey } : {}) },
      body: JSON.stringify({ model: c.llmModel, temperature: json ? 0 : 0.6, stream: false, messages }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.choices?.[0]?.message?.content ?? null;
  } catch { return null; } finally { clearTimeout(to); }
}

// Resolve to null if the model is slow, so the avatar can fall back and keep talking.
function raced(promise, ms) {
  return Promise.race([promise.catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
}

// Fire a tiny request on Start so Ollama loads the model in the background (no cold-start stall later).
export function prewarm() {
  const c = getConfig();
  if (c.llmUrl && c.llmModel) chat([{ role: 'user', content: 'ok' }], { timeoutMs: 30000 }).catch(() => {});
}

const _STOP = new Set('the a an and or but to of in on for with that this is are was were be it as at by from we you they i me my your our have has had not so if then very just really quite about like also too much many more most some any can could would should will do does did what why how when where which who been being into out up down over very'.split(' '));
function _kw(s) { return (s || '').toLowerCase().replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !_STOP.has(w)); }
export function overlapScore(question, answer) {
  const A = new Set(_kw(answer)); const Q = _kw(question);
  if (!Q.length) return 1;
  return Q.filter((w) => A.has(w)).length / Q.length;
}

const INTERVIEWER_SYSTEM = `You are a warm, professional IELTS Speaking examiner conducting a live spoken interview.
Rules:
- Ask ONE question at a time. Keep each turn to 1-2 short sentences a person would actually say aloud.
- Be responsive: explicitly refer to something specific the candidate just said, then ask a natural follow-up.
- Follow IELTS structure: Part 1 (familiar topics), then a Part 2 cue-card mid-way, then Part 3 (deeper discussion).
- Do NOT give scores or corrections during the interview. Just converse.
- Output ONLY the words you speak next. No labels, no stage directions.`;

const JOB_SYSTEM = (role) => `You are a warm, professional hiring interviewer screening a candidate for the role of ${role || 'this position'}.
Conduct a natural spoken interview:
- Ask ONE question at a time, 1-2 sentences, the way a real interviewer speaks aloud.
- Refer to something specific the candidate just said, then ask a natural follow-up.
- Across the interview, cover: a brief intro, motivation for the role, a behavioural question ("Tell me about a time..."), a role-specific scenario, and strengths.
- Do NOT give feedback, scores, or the decision during the interview. Just converse warmly and professionally.
- Output ONLY the words you speak next. No labels, no stage directions.`;
const JOB_SEED = {
  greeting: (c) => `Hi${c ? ' ' + c : ''}, thanks for joining today. To start, could you tell me a little about yourself and your background?`,
  followups: [
    (k) => `Thanks. What drew you to this role, particularly around ${k}?`,
    (k) => `Could you tell me about a time you dealt with ${k} at work?`,
    (k) => `How do you usually approach ${k} when things get difficult?`,
    (k) => `Can you give a specific example involving ${k}?`,
    (k) => `What would you do in your first few weeks to make an impact on ${k}?`,
  ],
  generic: [
    'What are you looking for in your next role?',
    'Tell me about a challenge you faced recently and how you handled it.',
    'What would your colleagues say are your biggest strengths?',
    'Why do you think you would be a good fit for this position?',
    'Do you have any questions for me about the role?',
  ],
};
const SEED = {
  greeting: "Hello, and welcome. Let's begin - could you tell me a little about where you live?",
  cue: 'Now I would like you to describe a skill you would like to learn. You should say what it is, why you want to learn it, and how you would learn it.',
  generic: [
    'What do you usually do in your free time?',
    'Do you prefer spending time indoors or outdoors? Why?',
    'How important is it for people to keep learning new things?',
    'Do you think your daily routine will change much in the future?',
  ],
};
const FOLLOWUPS = [
  (k) => `You mentioned ${k}. Could you tell me more about that?`,
  (k) => `Why is ${k} important to you?`,
  (k) => `How did you first become interested in ${k}?`,
  (k) => `Can you give me a specific example involving ${k}?`,
  (k) => `And how do you think ${k} might change in the future?`,
];
function pickKeyword(text) {
  const kws = _kw(text);
  if (!kws.length) return null;
  const WEAK = new Set(['enjoy','think','thing','things','really','maybe','people','time','good','great','nice','because','would','could','should','want','like','love','feel','know','quite','lot','stuff','kind','sort','about','everything','something']);
  const strong = kws.filter((w) => !w.endsWith('ing') && !WEAK.has(w));
  const pool = strong.length ? strong : kws.filter((w) => !WEAK.has(w));
  if (!pool.length) return kws[0];
  const counts = {};
  pool.forEach((w) => { counts[w] = (counts[w] || 0) + 1; });
  const max = Math.max(...Object.values(counts));
  return max > 1 ? pool.find((w) => counts[w] === max) : pool[0];
}
function localNextTurn(history, turnIndex) {
  if (turnIndex === 0) return SEED.greeting;
  if (turnIndex === 2) return SEED.cue;
  const last = history[history.length - 1];
  const k = last && pickKeyword(last.a);
  if (k) return FOLLOWUPS[turnIndex % FOLLOWUPS.length](k);
  return SEED.generic[turnIndex % SEED.generic.length];
}

function localJobTurn(history, turnIndex, candidate, role) {
  if (turnIndex === 0) return JOB_SEED.greeting(candidate);
  const last = history[history.length - 1];
  const k = (last && pickKeyword(last.a)) || role || 'this role';
  if (turnIndex <= JOB_SEED.followups.length) return JOB_SEED.followups[(turnIndex - 1) % JOB_SEED.followups.length](k);
  return JOB_SEED.generic[turnIndex % JOB_SEED.generic.length];
}
export async function nextInterviewerTurn(history, { turnIndex, totalTurns, candidate, kind = 'ielts', role = '' }) {
  const cfg = getConfig();
  const job = kind === 'job';
  if (cfg.talkMode === 'prerendered') {
    const script = talkingHeadScript(kind, totalTurns);
    return script[Math.min(turnIndex, script.length - 1)];
  }
  if (turnIndex === 0) return job ? JOB_SEED.greeting(candidate) : SEED.greeting;
  const system = job ? JOB_SYSTEM(role) : INTERVIEWER_SYSTEM;
  const msgs = [{ role: 'system', content: system }];
  msgs.push({ role: 'user', content: `Candidate: ${candidate}. ${job ? 'Role: ' + role + '. ' : ''}Question ${turnIndex + 1} of about ${totalTurns}. Refer to what they just said, then ask the next question.` });
  for (const t of history) { if (t.q) msgs.push({ role: 'assistant', content: t.q }); if (t.a) msgs.push({ role: 'user', content: t.a }); }
  const out = await raced(chat(msgs, { timeoutMs: 15000 }), 10000);
  if (out) return out.trim().replace(/^"|"$/g, '');
  return job ? localJobTurn(history, turnIndex, candidate, role) : localNextTurn(history, turnIndex);
}

const SCORER_SYSTEM = `You are a certified IELTS Speaking examiner. Score strictly using the official IELTS Speaking band
descriptors (public version), bands 1-9 with half-bands, on four criteria: fluency_coherence, lexical_resource,
grammatical_range_accuracy, pronunciation. Judge only the candidate's own language. Return ONLY valid minified JSON.`;
const SHAPE = '{"overall":{"fluency_coherence":0,"lexical_resource":0,"grammatical_range_accuracy":0,"pronunciation":0,"band":0},"feedback":["",""]}';

export async function scoreInterview(transcript) {
  const convo = transcript.map((t, i) => `Q${i + 1} (examiner): ${t.q}\nA${i + 1} (candidate): ${t.a || '(no answer)'}`).join('\n\n');
  const raw = await raced(chat([{ role: 'system', content: SCORER_SYSTEM }, { role: 'user', content: `Return JSON exactly in this shape (IELTS bands 1-9):\n${SHAPE}\n\nInterview transcript:\n${convo}` }], { json: true, timeoutMs: 30000 }), 28000);
  if (!raw) return null;
  try { const m = raw.match(/\{[\s\S]*\}/); const j = m ? JSON.parse(m[0]) : null; return j && j.overall ? j : null; } catch { return null; }
}

const ASSESS_SYSTEM = `You are an IELTS speaking examiner judging the candidate's latest answer.
Classify as "offtopic" (does not address the question), "expand" (on topic but too short), or "ok".
Return ONLY JSON: {"verdict":"offtopic|expand|ok","reaction":"<one short, warm sentence you say next>"}.`;
function heuristicAssess(question, answer) {
  const wc = (answer || '').trim().split(/\s+/).filter(Boolean).length;
  if (wc < 8) return { verdict: 'expand', reaction: 'Could you tell me a little more about that?' };
  if (overlapScore(question, answer) < 0.08 && wc < 70) return { verdict: 'offtopic', reaction: `Let's stay focused on the question. ${question}` };
  return { verdict: 'ok', reaction: '' };
}
export async function assessAnswer(question, answer) {
  const wc = (answer || '').trim().split(/\s+/).filter(Boolean).length;
  if (wc < 4) return { verdict: 'expand', reaction: "I'd love to hear a bit more - could you expand on that?" };
  const raw = await raced(chat([{ role: 'system', content: ASSESS_SYSTEM }, { role: 'user', content: `Question: ${question}\nCandidate answer: ${answer}\nReturn the JSON.` }], { json: true, timeoutMs: 10000 }), 7000);
  if (raw) { try { const m = raw.match(/\{[\s\S]*\}/); const j = m && JSON.parse(m[0]); if (j && j.verdict) return j; } catch {} }
  return heuristicAssess(question, answer);
}
