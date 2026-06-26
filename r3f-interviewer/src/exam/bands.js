// IELTS raw-correct -> band conversion (approx, Academic) + helpers.
// Tables are for 40-item sections; we scale by percentage when an item set is smaller (demo content).
const LISTENING = [[39,9],[37,8.5],[35,8],[32,7.5],[30,7],[26,6.5],[23,6],[18,5.5],[16,5],[13,4.5],[10,4]];
const READING   = [[39,9],[37,8.5],[35,8],[33,7.5],[30,7],[27,6.5],[23,6],[19,5.5],[15,5],[13,4.5],[10,4]];

function fromTable(table, raw40) {
  for (const [min, band] of table) if (raw40 >= min) return band;
  return 3.5;
}
export function objectiveBand(correct, total, section = 'reading') {
  if (!total) return 0;
  const raw40 = Math.round((correct / total) * 40);
  return fromTable(section === 'listening' ? LISTENING : READING, raw40);
}
export const halfRound = (x) => Math.round(x * 2) / 2;
// Overall IELTS band = average of the four, rounded to nearest half (with .25->.5, .75->next).
export function overallBand(b) {
  const vals = [b.listening, b.reading, b.writing, b.speaking].map(Number);
  const avg = vals.reduce((a, c) => a + c, 0) / vals.length;
  return Math.round(avg * 2) / 2;
}
export const bandLabel = (b) => (b >= 8 ? 'Very good user' : b >= 7 ? 'Good user' : b >= 6 ? 'Competent user' : b >= 5 ? 'Modest user' : b >= 4 ? 'Limited user' : 'Basic user');

// Quick heuristic writing band (length adequacy + lexical variety + sentence development).
export function scoreWriting(text, minWords) {
  const w = (text || '').trim().split(/\s+/).filter(Boolean); const n = w.length;
  if (n < 20) return 3.5;
  const uniq = new Set(w.map((x) => x.toLowerCase())).size, diversity = uniq / n;
  const coverage = Math.min(1, n / minWords);
  const sentences = (text.match(/[.!?]+/g) || []).length || Math.max(1, Math.round(n / 18));
  const avgLen = n / sentences;
  let band = 3.5 + coverage * 2.5 + diversity * 2.5 + Math.min(1, avgLen / 18);
  if (n < minWords * 0.6) band -= 1;
  return Math.max(3, Math.min(9, Math.round(band * 2) / 2));
}
