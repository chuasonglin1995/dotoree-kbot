/**
 * Simple Korean lemmatizer (v1).
 * Strips common verb/adjective endings to recover dictionary form.
 * Good enough for ~80% of inflected forms; swap for mecab-ko or kiwi later if needed.
 */

const EXPLICIT_ENDING_PATTERNS: Array<[RegExp, string]> = [
  // Past tense — must be checked before the contracted-ㅆ heuristic below
  [/었어요$/, '다'],
  [/았어요$/, '다'],
  [/였어요$/, '다'],
  // Formal polite
  [/ㅂ니다$/, '다'],
  [/습니다$/, '다'],
  // Compound endings
  [/고 싶어요$/, '고 싶다'],
  [/고 있어요$/, '고 있다'],
];

const PRESENT_ENDING_PATTERNS: Array<[RegExp, string]> = [
  [/어요$/, '다'],
  [/아요$/, '다'],
  [/여요$/, '다'],
  // Vowel-contracted present: 가 + 아요 → 가요 (아 absorbed)
  [/요$/, '다'],
];

const PARTICLES = ['은', '는', '이', '가', '을', '를', '에', '에서', '도', '만', '의'];

/**
 * Returns true if the Korean syllable block has a ㅆ (ssang-siot) coda.
 * Used to detect contracted past-tense forms such as 갔 (< 가+았).
 */
function hasSSangSiotCoda(char: string): boolean {
  const cp = char.codePointAt(0);
  if (cp === undefined) return false;
  const base = 0xac00;
  if (cp < base || cp > 0xd7a3) return false;
  // Coda index 20 = ㅆ
  return (cp - base) % 28 === 20;
}

/**
 * Returns the syllable block with its coda stripped (onset + vowel only).
 * e.g. 갔 (가+ㅆ) → 가
 */
function removeCoda(char: string): string {
  const cp = char.codePointAt(0)!;
  const coda = (cp - 0xac00) % 28;
  return String.fromCodePoint(cp - coda);
}

/**
 * Strip common Korean verb/adjective endings from a single token and return
 * the dictionary (lemma) form.  Falls back to stripping common particles when
 * no verb ending is found.  Returns the original token unchanged if nothing
 * matches.
 */
export function stripEndings(token: string): string {
  // 1. Explicit patterns (past-tense and formal polite must come first so that
  //    the contracted-ㅆ heuristic below does not accidentally fire on 었).
  for (const [pattern, replacement] of EXPLICIT_ENDING_PATTERNS) {
    if (pattern.test(token)) return token.replace(pattern, replacement);
  }

  // 2. Contracted past-tense heuristic: a syllable whose coda is ㅆ followed
  //    by 어요 indicates a vowel-stem verb where the past tense morpheme (았/었)
  //    fused into the stem syllable, e.g. 갔어요 (< 가+았어요) → 가다.
  const contractedMatch = token.match(/^(.*)(.)어요$/);
  if (contractedMatch && hasSSangSiotCoda(contractedMatch[2])) {
    return contractedMatch[1] + removeCoda(contractedMatch[2]) + '다';
  }

  // 3. Present / informal polite endings.
  for (const [pattern, replacement] of PRESENT_ENDING_PATTERNS) {
    if (pattern.test(token)) return token.replace(pattern, replacement);
  }

  // 4. Strip common particles (noun case markers).
  for (const particle of PARTICLES) {
    if (token.endsWith(particle) && token.length > particle.length) {
      return token.slice(0, -particle.length);
    }
  }

  return token;
}

/**
 * Tokenise Korean text, strip particles/endings from each token, and return
 * an array of lemma candidates.
 */
export function extractLemmaCandidates(text: string): string[] {
  const cleaned = text.replace(/[.,!?;:"'()\[\]]/g, ' ');
  return cleaned.split(/\s+/).filter(Boolean).map(stripEndings);
}
