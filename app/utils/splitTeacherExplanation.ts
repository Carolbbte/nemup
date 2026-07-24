export type TeacherExplanationSplit = { hook: string; reveal: string };

// First sentence-closing punctuation, tried only when the text has no '?' —
// the literal three-dot ellipsis is matched as a unit so a cut never lands
// mid-ellipsis.
const SENTENCE_CLOSE_RE = /\.\.\.|[.!…]/;

/**
 * Splits a `teacherExplanation` string into a curiosity hook (shown first,
 * on tap-to-reveal cards) and its reveal (shown after the student taps).
 *
 * Cut point: the first '?' if there is one; otherwise the first sentence-
 * closing '.', '!' or '…'. When no usable cut point exists — or the text
 * after it is empty — `reveal` comes back as '' and the caller must treat
 * that as "show `hook` (the full original text) with no tap mechanic",
 * never a card with a question and no answer.
 */
export function splitTeacherExplanation(text: string | null | undefined): TeacherExplanationSplit {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { hook: '', reveal: '' };

  const qIdx = trimmed.indexOf('?');
  let cutEnd = -1;
  if (qIdx !== -1) {
    cutEnd = qIdx + 1;
  } else {
    const match = trimmed.match(SENTENCE_CLOSE_RE);
    if (match && match.index !== undefined) cutEnd = match.index + match[0].length;
  }

  if (cutEnd === -1 || cutEnd >= trimmed.length) {
    return { hook: trimmed, reveal: '' };
  }

  const hook = trimmed.slice(0, cutEnd).trim();
  const reveal = trimmed.slice(cutEnd).trim();
  if (!reveal) return { hook: trimmed, reveal: '' };

  return { hook, reveal };
}
