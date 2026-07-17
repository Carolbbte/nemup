/**
 * theme/typography.ts — Sistema de tipografía centralizado NemUp
 *
 * REGLAS DE USO:
 *  Varela Round → toda la UI estructural de aprendizaje (preguntas, opciones, CTA, labels)
 *  Fredoka      → solo UI de recompensa y feedback emocional (XP, streak, celebración)
 *
 * PESOS PERMITIDOS:
 *  Varela Round: solo 400 (Google Fonts no publica otros cortes — a diferencia
 *    de Nunito, que sí tenía 400-800, `fontWeight` en los tokens de abajo ya
 *    no cambia el grosor real del glifo; se mantiene por compatibilidad y
 *    porque iOS puede aplicar negrita sintética, pero no cuentes con eso).
 *  Fredoka: 700
 *
 * ALCANCE ACTUAL: pantallas de Desafío y de Misión.
 */

import { TextStyle } from 'react-native';

// ── Estructural (Nunito) ──────────────────────────────────────────────────────

const challengeSectionLabel: TextStyle = {
  fontFamily: 'VarelaRound_400Regular',
  fontWeight: '800',
  fontSize: 14,
  letterSpacing: 2.2,
  textTransform: 'uppercase',
};

const challengeQuestion: TextStyle = {
  fontFamily: 'VarelaRound_400Regular',
  fontWeight: '800',
  fontSize: 20,
  lineHeight: 31,
  letterSpacing: -0.3,
};

const challengeOption: TextStyle = {
  fontFamily: 'VarelaRound_400Regular',
  fontWeight: '600',
  fontSize: 18,
  lineHeight: 24,
};

const challengeOptionLetter: TextStyle = {
  fontFamily: 'VarelaRound_400Regular',
  fontWeight: '800',
  fontSize: 18,
};

const challengeExplanation: TextStyle = {
  fontFamily: 'VarelaRound_400Regular',
  fontWeight: '500',
  fontSize: 14,
  lineHeight: 24,
};

const challengeCTA: TextStyle = {
  fontFamily: 'VarelaRound_400Regular',
  fontWeight: '800',
  fontSize: 18,
};

const challengeRewardStats: TextStyle = {
  fontFamily: 'VarelaRound_400Regular',
  fontWeight: '800',
  fontSize: 28,
};

const challengeConceptChip: TextStyle = {
  fontFamily: 'VarelaRound_400Regular',
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
  fontSize: 16,
};

const challengeRewardXP: TextStyle = {
  fontFamily: 'Fredoka',
  fontWeight: '700',
  fontSize: 24,
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
