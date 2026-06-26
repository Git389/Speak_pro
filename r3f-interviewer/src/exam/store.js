// localStorage-backed store for authored tests, candidates and exam results (the admin data layer).
import { EXAM } from './examData.js';
const K = 'esp_store';
function load() { try { return JSON.parse(localStorage.getItem(K)); } catch { return null; } }
function persist() { localStorage.setItem(K, JSON.stringify(db)); }

let db = load();
if (!db) {
  db = {
    tests: [{ id: 't1', ...EXAM }],
    candidates: [{ id: 'c1', name: 'Demo Student', testId: 't1', slot: '' }],
    results: [],
  };
  persist();
}

export function getTests() { return db.tests; }
export function getTest(id) { return db.tests.find((t) => t.id === id) || db.tests[0]; }
export function activeTest() { return db.tests[0] || { id: 't1', ...EXAM }; }
export function saveTest(t) {
  const i = db.tests.findIndex((x) => x.id === t.id);
  if (i >= 0) db.tests[i] = t; else db.tests.push(t);
  persist();
}
export function deleteTest(id) { db.tests = db.tests.filter((t) => t.id !== id); persist(); }
export function newTestTemplate() { return { id: 't' + Date.now(), ...JSON.parse(JSON.stringify(EXAM)), title: 'New IELTS Test' }; }

export function getCandidates() { return db.candidates; }
export function saveCandidate(c) { db.candidates.push({ id: 'c' + Date.now(), ...c }); persist(); }
export function deleteCandidate(id) { db.candidates = db.candidates.filter((c) => c.id !== id); persist(); }

export function getResults() { return db.results.slice().reverse(); }
export function addResult(r) { db.results.push({ id: 'r' + Date.now(), date: Date.now(), ...r }); persist(); }
