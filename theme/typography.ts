/**
 * theme/typography.ts — Sistema de tipografía centralizado NemUp
 *
 * REGLAS DE USO:
 *  Nunito   → toda la UI estructural de aprendizaje (preguntas, opciones, CTA, labels)
 *  Fredoka  → solo UI de recompensa y feedback emocional (XP, streak, celebración)
 *
 * PESOS PERMITIDOS:
 *  Nunito:  400, 500, 600, 700, 800
 *  Fredoka: 700
 *
 * ALCANCE ACTUAL: solo pantallas de Desafío.
 */

import { TextStyle } from 'react-native';

// ── Estructural (Nunito) ──────────────────────────────────────────────────────

const challengeSectionLabel: TextStyle = {
  fontFamily: 'Nunito',
  fontWeight: '800',
  fontSize: 18,
  letterSpacing: 2.2,
  textTransform: 'uppercase',
};

const challengeQuestion: TextStyle = {
  fontFamily: 'Nunito',
  fontWeight: '800',
  fontSize: 20,
  lineHeight: 31,
  letterSpacing: -0.3,
};

const challengeOption: TextStyle = {
  fontFamily: 'Nunito',
  fontWeight: '600',
  fontSize: 18,
  lineHeight: 24,
};

const challengeOptionLetter: TextStyle = {
  fontFamily: 'Nunito',
  fontWeight: '800',
  fontSize: 18,
};

const challengeExplanation: TextStyle = {
  fontFamily: 'Nunito',
  fontWeight: '500',
  fontSize: 17,
  lineHeight: 24,
};

const challengeCTA: TextStyle = {
  fontFamily: 'Nunito',
  fontWeight: '800',
  fontSize: 18,
};

const challengeRewardStats: TextStyle = {
  fontFamily: 'Nunito',
  fontWeight: '800',
  fontSize: 28,
};

const challengeConceptChip: TextStyle = {
  fontFamily: 'Nunito',
  fontWeight: '700',
  fontSize: 20,
};

// ── Recompensa y feedback emocional (Fredoka) ─────────────────────────────────

const challengeXP: TextStyle = {
  fontFamily: 'Fredoka',
  fontWeight: '700',
  fontSize: 18,
};

const challengeFloatingXP: TextStyle = {
  fontFamily: 'Fredoka',
  fontWeight: '700',
  fontSize: 22,
};

const challengeStreak: TextStyle = {
  fontFamily: 'Fredoka',
  fontWeight: '700',
  fontSize: 18,
};

const challengeMicroCelebration: TextStyle = {
  fontFamily: 'Fredoka',
  fontWeight: '700',
  fontSize: 18,
};

const challengeRewardXP: TextStyle = {
  fontFamily: 'Fredoka',
  fontWeight: '700',
  fontSize: 40,
};
// ── Export ────────────────────────────────────────────────────────────────────

export const Typography = {
  challengeSectionLabel,
  challengeQuestion,
  challengeOption,
  challengeOptionLetter,
  challengeExplanation,
  challengeCTA,
  challengeXP,
  challengeFloatingXP,
  challengeStreak,
  challengeMicroCelebration,
  challengeRewardXP,
  challengeRewardStats,
  challengeConceptChip,
};
