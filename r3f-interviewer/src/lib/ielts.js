// Official IELTS Speaking band descriptors (public version, condensed) + scoring helpers.
export const IELTS = {
  fluency: {
    9: 'Fluent with only rare repetition/self-correction; fully coherent, well-extended topic development.',
    8: 'Fluent with only occasional repetition/self-correction; coherent, appropriate, relevant development.',
    7: 'Long turns without much effort; some hesitation mid-sentence but coherence maintained; flexible discourse markers.',
    6: 'Willing to produce long turns; coherence sometimes lost through hesitation/repetition; range of connectives, not always apt.',
    5: 'Usually keeps going but relies on repetition, self-correction or slow speech; complex speech causes disfluency.',
    4: 'Cannot keep going without noticeable pauses; links only simple sentences; some breakdowns in coherence.',
    3: 'Frequent long pauses; limited ability to link sentences; frequently unable to convey the basic message.',
  },
  lexical: {
    9: 'Total flexibility and precise use in all contexts; sustained accurate and idiomatic language.',
    8: 'Wide resource used flexibly for precise meaning; skilful less-common/idiomatic items; effective paraphrase.',
    7: 'Flexible across varied topics; some less-common/idiomatic vocabulary and collocation awareness, with some inappropriacy.',
    6: 'Resource sufficient to discuss topics at length; sometimes inappropriate but meaning clear; generally paraphrases well.',
    5: 'Sufficient for familiar and unfamiliar topics but limited flexibility; paraphrases with mixed success.',
    4: 'Sufficient for familiar topics only; frequent word-choice errors; rarely paraphrases.',
    3: 'Simple vocabulary for personal information; inadequate for unfamiliar topics.',
  },
  grammar: {
    9: 'Structures precise and accurate at all times, apart from native-speaker-type slips.',
    8: 'Wide range of structures, flexibly used; majority of sentences error-free; only occasional errors.',
    7: 'Range of structures flexibly used; frequent error-free sentences; simple and complex forms used effectively despite some errors.',
    6: 'Mix of short and complex forms with limited flexibility; frequent errors in complex structures but rarely impede communication.',
    5: 'Basic forms fairly well controlled; complex structures attempted but limited and usually with errors.',
    4: 'Basic forms and some error-free short utterances; subordinate clauses rare; repetitive structures, frequent errors.',
    3: 'Basic forms attempted but numerous grammatical errors except in memorised utterances.',
  },
  pron: {
    9: 'Full range of phonological features for precise meaning; effortlessly understood; accent no effect on intelligibility.',
    8: 'Wide range of features; sustained rhythm and flexible stress/intonation; easily understood, minimal accent effect.',
    7: 'All positive features of band 6 plus some of band 8 - generally clear, well-controlled pronunciation.',
    6: 'Range of features with variable control; some effective intonation/stress; occasional mispronunciation but generally understood.',
    5: 'Features of band 4 plus some of band 6 - clarity is variable.',
    4: 'Limited features; frequent rhythm lapses; words/phonemes often mispronounced, causing lack of clarity; effort to understand.',
    3: 'Some recognisable words/phonemes but little clear meaning conveyed.',
  },
};
export function descFor(crit, band) {
  const t = IELTS[crit]; if (!t) return '';
  const b = Math.round(Number(band) || 0);
  for (const k of [9, 8, 7, 6, 5, 4, 3]) if (b >= k) return t[k];
  return t[3];
}
export const bandLabel = (b) => (b >= 8 ? 'Very good user' : b >= 7 ? 'Good user' : b >= 6 ? 'Competent user' : b >= 5 ? 'Modest user' : 'Limited user');
const clamp = (v) => Math.max(3, Math.min(9, v));
export const halfRound = (x) => Math.round(x * 2) / 2;

const STOP = new Set('the a an and or but to of in on for with that this is are was were be it as at by from we you they i me my your our have has had not so if then very just really quite about like also too much many more most some any can could would should will do does did what why how when where which who'.split(' '));
const words = (s) => (s || '').toLowerCase().replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter(Boolean);
const content = (s) => words(s).filter((w) => w.length > 3 && !STOP.has(w));
const FILLERS = ['um', 'uh', 'er', 'erm', 'hmm', 'like', 'you know', 'actually', 'basically'];

// Heuristic scorer + genuinely useful, descriptor-based feedback (used when no LLM is configured).
export function heuristicScore(transcript) {
  const answers = transcript.map((t) => t.a || '');
  const all = answers.join(' ');
  const W = words(all), n = W.length;
  if (n < 5) {
    return { fluency: 3, lexical: 3, grammar: 3, pron: 3, band: 3,
      feedback: ['Try to give fuller spoken answers - aim for several sentences per question so your English can be assessed.'] };
  }
  const uniq = new Set(W).size, diversity = uniq / n;
  const answered = answers.filter((a) => words(a).length).length || 1;
  const avgWords = n / answered;
  const sentences = (all.match(/[.!?]+/g) || []).length || Math.max(1, Math.round(n / 14));
  const avgSentLen = n / sentences;
  let fillerCount = 0;
  FILLERS.forEach((f) => { const re = new RegExp('\\b' + f.replace(' ', '\\s+') + '\\b', 'g'); fillerCount += (all.toLowerCase().match(re) || []).length; });
  const fillerRate = fillerCount / n;
  // relevance: content-word overlap of each answer with its question
  let rel = 0;
  transcript.forEach((t) => { const a = new Set(content(t.a)); const q = content(t.q); rel += q.length ? q.filter((w) => a.has(w)).length / q.length : 0.5; });
  const relevance = rel / (transcript.length || 1);

  const cont = content(all).length / n;
  const fluency = clamp(3 + Math.min(3.2, avgWords / 30) + relevance * 1.5 - fillerRate * 6);
  const lexical = clamp(3 + diversity * 6 * Math.min(1, n / 40) + Math.min(1.5, uniq / 50));  // damp diversity on short samples
  const grammar = clamp(3.5 + Math.min(3, avgSentLen / 7) + (avgSentLen > 26 ? -1 : 0));
  const pron = clamp(5 + Math.min(2, n / 200) - fillerRate * 4);
  const crit = { fluency: halfRound(fluency), lexical: halfRound(lexical), grammar: halfRound(grammar), pron: halfRound(pron) };
  const band = clamp(halfRound((fluency + lexical + grammar + pron) / 4));

  // build targeted tips
  const fb = [];
  const lowest = Object.entries(crit).sort((a, b) => a[1] - b[1])[0][0];
  const tipFor = {
    fluency: 'Fluency & coherence: speak in longer, connected stretches and use linking words (because, however, for example) to join ideas.',
    lexical: 'Vocabulary: bring in more varied and precise words, and try some topic-specific or less common terms instead of repeating the same ones.',
    grammar: 'Grammar: mix simple and complex sentences (with because/although/which) and watch tense consistency.',
    pron: 'Pronunciation & delivery: speak clearly at a steady pace and cut filler sounds (um, uh) to sound more confident.',
  };
  fb.push(tipFor[lowest]);
  if (avgWords < 25) fb.push(`Develop each answer further - you averaged about ${Math.round(avgWords)} words per answer. Add a reason and a short example to every response.`);
  if (relevance < 0.35) fb.push('Answer the question more directly - make sure the first sentence clearly addresses what was asked before adding detail.');
  if (diversity < 0.45) fb.push('Widen your vocabulary range - you reused many of the same words; try synonyms and more descriptive language.');
  // one strength
  if (band >= 6) fb.push(`Strength: you kept the conversation going well (around ${n} words across ${answered} answers) - keep that up.`);
  else if (avgWords >= 20) fb.push('Strength: you produced reasonably full answers - now focus on accuracy and variety.');

  return { ...crit, band, feedback: fb.slice(0, 5) };
}
