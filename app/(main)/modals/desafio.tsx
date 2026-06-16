/**
 * Desafío mode renderer.
 *
 * Architecture rules (Fabric-safe):
 *  - SafeAreaView has exactly 3 stable direct children:
 *      1. <View>        — progress header   (always View)
 *      2. <ScrollView>  — slide content     (keyed by currentIdx → remounts on advance)
 *      3. <Pressable>   — CTA footer        (always Pressable, style/text change in-place)
 *  - Option bubbles: always <Pressable>, style-only changes on selection.
 *  - Letter bubble:  always <View><Text>, content changes only.
 *  - No component type switches. No animations.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { palette } from '@/theme/colors';
import type { DesafioSession, DesafioSlide } from '@/shared/desafio';

const DESAFIO_KEY = 'nemup_desafio_session';
const LETTERS = ['A', 'B', 'C'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isInteractive(slide: DesafioSlide): boolean {
  return (
    slide.type === 'discovery_challenge' ||
    slide.type === 'reinforcement_challenge' ||
    slide.type === 'boss_loop'
  );
}

function isInformational(slide: DesafioSlide): boolean {
  return (
    slide.type === 'instant_feedback' ||
    slide.type === 'insight' ||
    slide.type === 'mastery_screen'
  );
}

// ── Progress dots ─────────────────────────────────────────────────────────────

function ProgressHeader({
  current,
  total,
  onClose,
}: {
  current: number;
  total: number;
  onClose: () => void;
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <View style={h.row}>
      <View style={h.barTrack}>
        <View style={[h.barFill, { width: `${pct}%` as any }]} />
      </View>
      <Pressable style={h.closeBtn} onPress={onClose} hitSlop={12}>
        <Text style={h.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const h = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  barTrack:  { flex: 1, height: 6, backgroundColor: palette.bordeClaro, borderRadius: 3, overflow: 'hidden' },
  barFill:   { height: '100%', backgroundColor: palette.morado, borderRadius: 3 },
  closeBtn:  { padding: 4 },
  closeText: { fontSize: 16, color: palette.grisMedio, fontWeight: '600' },
});

// ── Option row ────────────────────────────────────────────────────────────────

function OptionRow({
  letter,
  text,
  selected,
  revealed,
  correct,
  onPress,
}: {
  letter: string;
  text: string;
  selected: boolean;
  revealed: boolean;
  correct: boolean;
  onPress: () => void;
}) {
  const isCorrectAndRevealed  = revealed && correct;
  const isWrongAndSelected    = revealed && selected && !correct;

  const containerStyle = [
    o.option,
    selected && !revealed && o.optionSelected,
    isCorrectAndRevealed     && o.optionCorrect,
    isWrongAndSelected       && o.optionWrong,
  ];

  const letterBg = [
    o.letterBubble,
    selected && !revealed && o.letterSelected,
    isCorrectAndRevealed  && o.letterCorrect,
    isWrongAndSelected    && o.letterWrong,
  ];

  const letterTextStyle = [
    o.letterText,
    (selected && !revealed) || isCorrectAndRevealed || isWrongAndSelected
      ? o.letterTextLight
      : null,
  ];

  const optionTextStyle = [
    o.optionText,
    isCorrectAndRevealed && o.optionTextCorrect,
    isWrongAndSelected   && o.optionTextWrong,
  ];

  return (
    <Pressable style={containerStyle} onPress={onPress} disabled={revealed}>
      <View style={letterBg}>
        <Text style={letterTextStyle}>{letter}</Text>
      </View>
      <Text style={optionTextStyle}>{text}</Text>
    </Pressable>
  );
}

const o = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.blanco,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.bordeClaro,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  optionSelected: { borderColor: palette.morado },
  optionCorrect:  { borderColor: palette.verde,     backgroundColor: '#F0FDF7' },
  optionWrong:    { borderColor: palette.rojoError,  backgroundColor: palette.rojoErrorBg },

  letterBubble: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: palette.moradoBg,
    justifyContent: 'center', alignItems: 'center',
  },
  letterSelected: { backgroundColor: palette.morado },
  letterCorrect:  { backgroundColor: palette.verde },
  letterWrong:    { backgroundColor: palette.rojoError },

  letterText:      { fontSize: 13, fontWeight: '700', color: palette.morado },
  letterTextLight: { color: palette.blanco },

  optionText:        { flex: 1, fontSize: 15, color: palette.charcoal, lineHeight: 20 },
  optionTextCorrect: { color: palette.verde },
  optionTextWrong:   { color: palette.rojoError },
});

// ── Slide content ─────────────────────────────────────────────────────────────

function SlideContent({
  slide,
  answer,
  onAnswer,
}: {
  slide: DesafioSlide;
  answer: string | undefined;
  onAnswer: (letter: string) => void;
}) {
  const revealed = !!answer;

  // Interactive slides: discovery_challenge, reinforcement_challenge, boss_loop
  if (isInteractive(slide)) {
    const wrongHint = answer && answer !== slide.correctAnswer
      ? slide.wrongHints?.[answer]
      : undefined;

    return (
      <View style={c.root}>
        <Text style={c.typeLabel}>{typeLabel(slide.type)}</Text>
        {slide.emoji != null && (
          <Text style={c.emoji}>{slide.emoji}</Text>
        )}
        <Text style={c.question}>{slide.question}</Text>

        <View style={c.options}>
          {(slide.choices ?? []).map(choice => (
            <OptionRow
              key={choice.letter}
              letter={choice.letter}
              text={choice.text}
              selected={answer === choice.letter}
              revealed={revealed}
              correct={choice.letter === slide.correctAnswer}
              onPress={() => onAnswer(choice.letter)}
            />
          ))}
        </View>

        {revealed && wrongHint && (
          <View style={c.hintBox}>
            <Text style={c.hintText}>{wrongHint}</Text>
          </View>
        )}

        {revealed && !wrongHint && slide.explanation && (
          <View style={c.explanationBox}>
            <Text style={c.explanationText}>{slide.explanation}</Text>
          </View>
        )}
      </View>
    );
  }

  // Non-interactive: instant_feedback, insight, mastery_screen
  if (isInformational(slide)) {
    const isMastery = slide.type === 'mastery_screen';
    return (
      <View style={c.root}>
        <Text style={c.typeLabel}>{typeLabel(slide.type)}</Text>
        {slide.emoji != null && (
          <Text style={c.emoji}>{slide.emoji}</Text>
        )}
        <Text style={isMastery ? c.masteryTitle : c.insightTitle}>
          {isMastery ? slide.title : slide.title}
        </Text>
        <Text style={c.body}>{slide.body}</Text>
        {isMastery && Array.isArray(slide.conceptsCovered) && slide.conceptsCovered.length > 0 && (
          <View style={c.conceptsWrap}>
            {slide.conceptsCovered.map((name, i) => (
              <View key={i} style={c.conceptChip}>
                <Text style={c.conceptChipText}>{name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  return null;
}

function typeLabel(type: DesafioSlide['type']): string {
  switch (type) {
    case 'discovery_challenge':     return 'DESCUBRIR';
    case 'instant_feedback':        return 'CONEXIÓN';
    case 'insight':                 return 'CONCEPTO';
    case 'reinforcement_challenge': return 'REFUERZO';
    case 'boss_loop':               return 'DESAFÍO FINAL';
    case 'mastery_screen':          return 'COMPLETADO';
  }
}

const c = StyleSheet.create({
  root:    { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  typeLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    color: palette.morado, marginBottom: 16,
  },
  emoji:   { fontSize: 48, textAlign: 'center', marginBottom: 16 },
  question: {
    fontSize: 20, fontWeight: '700', color: palette.charcoal,
    lineHeight: 28, marginBottom: 24,
  },
  options: { gap: 0 },

  hintBox: {
    marginTop: 16, padding: 14, borderRadius: 12,
    backgroundColor: palette.rojoErrorBg,
    borderWidth: 1, borderColor: palette.rojoError + '33',
  },
  hintText: { fontSize: 14, color: palette.rojoErrorDark, lineHeight: 20 },

  explanationBox: {
    marginTop: 16, padding: 14, borderRadius: 12,
    backgroundColor: '#F0FDF7',
    borderWidth: 1, borderColor: palette.verde + '44',
  },
  explanationText: { fontSize: 14, color: '#166534', lineHeight: 20 },

  insightTitle: {
    fontSize: 22, fontWeight: '800', color: palette.charcoal,
    lineHeight: 30, marginBottom: 16,
  },
  masteryTitle: {
    fontSize: 26, fontWeight: '800', color: palette.charcoal,
    textAlign: 'center', lineHeight: 34, marginBottom: 16,
  },
  body: { fontSize: 16, color: palette.grisMedio, lineHeight: 24 },

  conceptsWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24,
  },
  conceptChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: palette.moradoBg, borderRadius: 20,
  },
  conceptChipText: { fontSize: 13, fontWeight: '600', color: palette.morado },
});

// ── CTA label helpers ─────────────────────────────────────────────────────────

function ctaLabel(slide: DesafioSlide, answered: boolean, isLast: boolean): string {
  if (isLast) return '¡Terminar!';
  if (isInteractive(slide) && !answered) return 'Selecciona una opción';
  return 'Continuar';
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════

export default function DesafioScreen() {
  const router = useRouter();

  const [session, setSession]     = useState<DesafioSession | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers]     = useState<Record<number, string>>({});
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(DESAFIO_KEY).then(raw => {
      if (raw) {
        try { setSession(JSON.parse(raw)); } catch {}
      }
      setLoading(false);
    });
  }, []);

  const handleAnswer = useCallback((letter: string) => {
    setAnswers(prev => {
      if (prev[currentIdx] !== undefined) return prev;
      return { ...prev, [currentIdx]: letter };
    });
  }, [currentIdx]);

  const handleCta = useCallback(() => {
    if (!session) return;
    const slide    = session.slides[currentIdx];
    const answered = answers[currentIdx] !== undefined;

    // On interactive slides, CTA is disabled until answered — but guard anyway
    if (isInteractive(slide) && !answered) return;

    const isLast = currentIdx >= session.slides.length - 1;
    if (isLast) {
      router.back();
      return;
    }
    setCurrentIdx(idx => idx + 1);
  }, [session, currentIdx, answers, router]);

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={g.screen} edges={['top', 'bottom']}>
        <View style={g.centered}>
          <Text style={g.loadingText}>Cargando desafío...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session || session.slides.length === 0) {
    return (
      <SafeAreaView style={g.screen} edges={['top', 'bottom']}>
        <View style={g.centered}>
          <Text style={g.errorText}>No hay desafío disponible.</Text>
          <Pressable style={g.backBtn} onPress={() => router.back()}>
            <Text style={g.backBtnText}>Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const slide    = session.slides[currentIdx];
  const answered = answers[currentIdx] !== undefined;
  const isLast   = currentIdx >= session.slides.length - 1;
  const ctaDisabled = isInteractive(slide) && !answered;

  return (
    <SafeAreaView style={g.screen} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.crema} />

      {/* Stable child 1 — progress header */}
      <ProgressHeader
        current={currentIdx}
        total={session.slides.length}
        onClose={() => router.back()}
      />

      {/* Stable child 2 — slide content; key forces remount on slide change */}
      <ScrollView
        key={currentIdx}
        style={g.scrollArea}
        contentContainerStyle={g.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SlideContent
          slide={slide}
          answer={answers[currentIdx]}
          onAnswer={handleAnswer}
        />
      </ScrollView>

      {/* Stable child 3 — CTA footer */}
      <Pressable
        style={[g.cta, ctaDisabled && g.ctaDisabled]}
        onPress={handleCta}
        disabled={ctaDisabled}
      >
        <Text style={[g.ctaText, ctaDisabled && g.ctaTextDisabled]}>
          {ctaLabel(slide, answered, isLast)}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

// ── Global styles ─────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: palette.crema },
  scrollArea:  { flex: 1 },
  scrollContent: { flexGrow: 1 },

  cta: {
    marginHorizontal: 20,
    marginBottom: 12,
    marginTop: 8,
    backgroundColor: palette.morado,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: { backgroundColor: palette.bordeClaro },
  ctaText:     { fontSize: 17, fontWeight: '700', color: palette.blanco },
  ctaTextDisabled: { color: palette.grisMedio },

  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { fontSize: 16, color: palette.grisMedio },
  errorText:   { fontSize: 16, color: palette.charcoal, textAlign: 'center', marginBottom: 24 },
  backBtn:     { backgroundColor: palette.morado, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { fontSize: 15, fontWeight: '700', color: palette.blanco },
});
