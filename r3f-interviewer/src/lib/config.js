// Simple localStorage-backed config for the conversational interviewer.
const KEY = 'esp_r3f_cfg';
const ENV = import.meta.env || {};
const DEFAULTS = {
  llmUrl: ENV.VITE_LLM_URL || 'http://127.0.0.1:8000/v1/chat/completions',
  llmModel: ENV.VITE_LLM_MODEL || 'llama3.1',
  llmKey: '',
  ttsUrl: ENV.VITE_TTS_URL || 'http://127.0.0.1:8000/tts',
  avatarUrl: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/facecap.glb', // realistic scanned human face w/ ARKit morphs (CDN, no signup). Blank = built-in head.
  candidate: ENV.VITE_CANDIDATE_NAME || 'Candidate',
  turns: 6,
  interviewKind: ENV.VITE_INTERVIEW_KIND || 'job',       // 'job' (hiring screen) or 'ielts' (speaking exam)
  jobRole: ENV.VITE_JOB_ROLE || 'Customer Support Representative',
  webcam: true,               // show candidate webcam picture-in-picture (like TestGorilla)
  talkUrl: ENV.VITE_TALK_URL || 'http://127.0.0.1:8100/talk', // local talking-head backend; the app probes readiness and falls back automatically
  talkMode: 'prerendered',    // 'prerendered' plays saved MP4 clips; 'dynamic' renders each line on demand
};
export function getConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
export function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
export function llmConfigured() {
  const c = getConfig();
  return !!(c.llmUrl && c.llmModel);
}
