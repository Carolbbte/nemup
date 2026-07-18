/**
 * Feature flags — change here to toggle visibility globally.
 * SHOW_GEMS = true                → restores all Gems UI instantly.
 * SHOW_CONCEPTOS_STAT = true      → re-enables Conceptos as a stat tile when added.
 * UNIFIED_PROGRESS_BAR = true     → unified session bar instead of per-mode indicators.
 * FIXED_QUIZ_FEEDBACK = true      → 3-state quiz feedback (A=correct, B=retry, C=final wrong).
 * MODE_COMPLETION_REDESIGN = true → shared ModeCompletionScreen for all 3 mode endings.
 * DAILY_SESSION_LOGIC = true      → streak advances only when all 3 modes complete in a day.
 */
export const SHOW_GEMS                  = false;
export const SHOW_CONCEPTOS_STAT        = false;
export const UNIFIED_PROGRESS_BAR       = true;
export const FIXED_QUIZ_FEEDBACK           = true;
export const MAX_ATTEMPTS_PER_QUESTION     = 2;
export const NEUTRAL_MISSION_COMPLETION    = true;
export const UNIFIED_QUIZ_COMPLETION       = true;
export const MODE_COMPLETION_REDESIGN      = true;
export const DAILY_SESSION_LOGIC           = true;
export const DASHBOARD_REDESIGN            = true;
export const DESAFIO_MODE                  = true;
// Gates the Desafío card in session.tsx's mode-select dashboard specifically
// (separate from DESAFIO_MODE, which is unused/orphaned). Flip to true to
// bring it back — the Desafío code itself is untouched.
export const SHOW_DESAFIO_MODE             = false;
// ADAPTIVE_REQUEUE = true → a wrong answer in the Misión gets cloned and
// reinserted later in the session for a second try (reduced XP), growing
// the mission's total slide count. false → a wrong answer just stays wrong,
// no retry-later clone, mission length stays fixed. Toggled off by request;
// insertCorrectiveSlide (session.tsx) is the single control point.
export const ADAPTIVE_REQUEUE              = false;
// CLASSIFY_BUCKETS_UI = true → classify renders as "tap item, tap bucket"
// (pool of unassigned chips + one bucket card per category), one-shot
// Comprobar with per-item ✓/✗ reveal, no retry loop. false (default) → the
// current picker-based ClassifyContent (shared with Desafío), unchanged.
// Same Record<itemId, category> answer shape either way — scoring/streak/
// requeue don't change, only the render + its own feedback panel.
export const CLASSIFY_BUCKETS_UI           = false;
