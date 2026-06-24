/**
 * Desafío mode renderer — Phase 2 (adaptive, multi-interaction-type).
 *
 * Fabric-safe architecture:
 *  SafeAreaView → exactly 3 stable direct children:
 *    1. <View>       — progress header (always View)
 *    2. <ScrollView> — slide content  (keyed by currentIdx → full remount on advance)
 *    3. <Pressable>  — CTA footer     (always Pressable, text/style change in-place)
 *
 * Interaction types rendered inside ScrollView (safe grandchild depth):
 *   multiple_choice, fill_blank, match_pairs, classify, order_steps
 *
 * Adaptive injection: on wrong answer, inserts pre-generated retry slide
 * immediately after current position (max 2 retries per concept).
 *
 * No type switches at SafeAreaView direct-child level. No animations.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { palette, semantic } from '@/theme/colors';
import { Typography } from '@/theme/typography';
import UnifiedProgressBar from '@/components/UnifiedProgressBar';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type {
  DesafioSession,
  DesafioSlide,
  DesafioInteractionType,
  DesafioPair,
} from '@/shared/desafio';

const DESAFIO_KEY  = 'nemup_desafio_session';
const PAIR_COLORS  = ['#5B3DF5', '#1D9E75', '#0891b2'] as const;
const CAT_COLORS   = ['#5B3DF5', '#1D9E75', '#FF7A2B', '#0891b2'] as const;

// ── Type helpers ──────────────────────────────────────────────────────────────

function isInteractiveByType(slide: DesafioSlide): boolean {
  return (
    slide.type === 'discovery_challenge' ||
    slide.type === 'reinforcement_challenge' ||
    slide.type === 'boss_loop' ||
    slide.type === 'spaced_repetition'
  );
}

function effectiveInteractionType(slide: DesafioSlide): DesafioInteractionType {
  return slide.interactionType ?? 'multiple_choice';
}

function slideTypeLabel(type: DesafioSlide['type'], isRetry?: boolean, isSpaced?: boolean): string {
  if (isRetry)  return 'REPASO EXTRA';
  if (isSpaced) return 'REPASO';
  switch (type) {
    case 'discovery_challenge':     return 'DESCUBRIR';
    case 'instant_feedback':        return 'CONEXIÓN';
    case 'insight':                 return 'CONCEPTO';
    case 'reinforcement_challenge': return 'REFUERZO';
    case 'spaced_repetition':       return 'REPASO';
    case 'boss_loop':               return '⚔️ DESAFÍO FINAL';
    case 'mastery_screen':          return 'COMPLETADO';
  }
}

// Shuffles multiple-choice options so the correct answer isn't always first.
// Reassigns A/B/C letters to match the new order and updates correctAnswer.
function shuffleSlideChoices(slide: DesafioSlide): DesafioSlide {
  if (!Array.isArray(slide.choices) || slide.choices.length < 2 || !slide.correctAnswer) {
    return slide;
  }
  const correctText = slide.choices.find(c => c.letter === slide.correctAnswer)?.text;
  if (correctText === undefined) return slide;

  const texts = slide.choices.map(c => c.text);
  for (let i = texts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [texts[i], texts[j]] = [texts[j], texts[i]];
  }

  const LETTERS: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];
  const newChoices = texts.map((text, i) => ({ letter: LETTERS[i], text }));
  const newCorrect = newChoices.find(c => c.text === correctText)?.letter ?? slide.correctAnswer;

  return { ...slide, choices: newChoices, correctAnswer: newCorrect };
}

// ── Answer state ──────────────────────────────────────────────────────────────

interface SlideAnswer {
  value: string | number[] | Record<string, string>;
  correct: boolean;
}

// ── Animated option row — Duolingo-style microinteractions ────────────────────

function AnimOptionRow({
  letter, text, selected, revealed, correct, onPress, blocked,
}: {
  letter: string; text: string; selected: boolean;
  revealed: boolean; correct: boolean; onPress: () => void;
  blocked: boolean; // true while tap is being processed (before reveal)
}) {
  const scale  = useSharedValue(1);
  const shakeX = useSharedValue(0);

  const isCorrectRevealed = revealed && correct;
  const isWrongSelected   = revealed && selected && !correct;

  // Pulse on correct selection
  useEffect(() => {
    if (isCorrectRevealed && selected) {
      scale.value = withSequence(
        withTiming(0.97, { duration: 60 }),
        withTiming(1.08, { duration: 130, easing: Easing.out(Easing.back(1.5)) }),
        withTiming(1.0,  { duration: 100 }),
      );
    }
  }, [isCorrectRevealed, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shake on wrong selection
  useEffect(() => {
    if (isWrongSelected) {
      shakeX.value = withSequence(
        withTiming(-7, { duration: 50 }),
        withTiming( 7, { duration: 50 }),
        withTiming(-5, { duration: 50 }),
        withTiming( 5, { duration: 50 }),
        withTiming( 0, { duration: 50 }),
      );
    }
  }, [isWrongSelected]); // eslint-disable-line react-hooks/exhaustive-deps

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: shakeX.value }],
  }));

  const handlePress = useCallback(() => {
    // Brief press-down before handing off to parent
    scale.value = withSequence(
      withTiming(0.97, { duration: 80 }),
      withTiming(1.0,  { duration: 80 }),
    );
    onPress();
  }, [onPress, scale]);

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={[
          o.option,
          selected && !revealed && o.optionSelected,
          isCorrectRevealed && o.optionCorrect,
          isWrongSelected   && o.optionWrong,
        ]}
        onPress={handlePress}
        disabled={revealed || blocked}
      >
        <View style={[
          o.letterBubble,
          selected && !revealed && o.letterSelected,
          isCorrectRevealed && o.letterCorrect,
          isWrongSelected   && o.letterWrong,
        ]}>
          <Text style={[
            o.letterText,
            (selected && !revealed) || isCorrectRevealed || isWrongSelected ? o.letterTextLight : null,
          ]}>
            {letter}
          </Text>
        </View>
        <Text style={[
          o.optionText,
          isCorrectRevealed && o.optionTextCorrect,
          isWrongSelected   && o.optionTextWrong,
        ]}>
          {text}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const o = StyleSheet.create({
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: palette.blanco, borderRadius: 14,
    borderWidth: 1.5, borderColor: palette.bordeClaro,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10,
  },
  optionSelected: { borderColor: palette.morado },
  optionCorrect:  { borderColor: palette.verde, backgroundColor: '#F0FDF7' },
  optionWrong:    { borderColor: palette.rojoError, backgroundColor: palette.rojoErrorBg },
  letterBubble: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: palette.moradoBg, justifyContent: 'center', alignItems: 'center',
  },
  letterSelected: { backgroundColor: palette.morado },
  letterCorrect:  { backgroundColor: palette.verde },
  letterWrong:    { backgroundColor: palette.rojoError },
  letterText:      { ...Typography.challengeOptionLetter, color: palette.morado },
  letterTextLight: { color: palette.blanco },
  optionText:        { flex: 1, ...Typography.challengeOption, color: palette.charcoal },
  optionTextCorrect: { color: palette.verde },
  optionTextWrong:   { color: palette.rojoError },
});

// ── Multiple choice content ───────────────────────────────────────────────────

function MultipleChoiceContent({
  slide, selection, onSelect, answer, blocked,
}: {
  slide: DesafioSlide; selection: string | null;
  onSelect: (letter: string) => void; answer: SlideAnswer | undefined;
  blocked: boolean;
}) {
  const revealed = !!answer;

  return (
    <View style={c.root}>
      <Text style={c.typeLabel}>{slideTypeLabel(slide.type, slide.isRetry, slide.isSpacedRepetition)}</Text>
      <Text style={c.emoji}>{slideEmoji(slide)}</Text>
      <Text style={c.question}>{slide.question}</Text>
      <View>
        {(slide.choices ?? []).map(ch => (
          <AnimOptionRow
            key={ch.letter} letter={ch.letter} text={ch.text}
            selected={revealed ? answer.value === ch.letter : selection === ch.letter}
            revealed={revealed} correct={ch.letter === slide.correctAnswer}
            onPress={() => onSelect(ch.letter)}
            blocked={blocked}
          />
        ))}
      </View>
    </View>
  );
}

// ── Fill blank content ────────────────────────────────────────────────────────

function FillBlankContent({
  slide, selection, onSelect, answer, blocked,
}: {
  slide: DesafioSlide; selection: string | null;
  onSelect: (letter: string) => void; answer: SlideAnswer | undefined;
  blocked: boolean;
}) {
  const revealed = !!answer;

  return (
    <View style={c.root}>
      <Text style={c.typeLabel}>{slideTypeLabel(slide.type, slide.isRetry, slide.isSpacedRepetition)}</Text>
      <Text style={c.emoji}>{slideEmoji(slide)}</Text>
      <View style={fb.sentenceBox}>
        <Text style={fb.sentenceText}>{slide.blankSentence}</Text>
      </View>
      <Text style={c.subLabel}>Elige la respuesta correcta:</Text>
      <View>
        {(slide.blankChoices ?? []).map(ch => (
          <AnimOptionRow
            key={ch.letter} letter={ch.letter} text={ch.text}
            selected={revealed ? answer.value === ch.letter : selection === ch.letter}
            revealed={revealed} correct={ch.letter === slide.blankAnswer}
            onPress={() => onSelect(ch.letter)}
            blocked={blocked}
          />
        ))}
      </View>
    </View>
  );
}

const fb = StyleSheet.create({
  sentenceBox: {
    backgroundColor: palette.moradoBg, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20,
    borderWidth: 1, borderColor: palette.morado + '33',
  },
  sentenceText: { fontSize: 18, fontWeight: '700', color: palette.charcoal, lineHeight: 26 },
});

// ── Match pairs content ───────────────────────────────────────────────────────

function MatchPairsContent({
  slide, selectedLeft, onSelectLeft, matched, onMatch, answer,
}: {
  slide: DesafioSlide;
  selectedLeft: string | null;
  onSelectLeft: (id: string | null) => void;
  matched: Record<string, string>;
  onMatch: (updated: Record<string, string>) => void;
  answer: SlideAnswer | undefined;
}) {
  const revealed = !!answer;
  const pairs    = slide.pairs ?? [];

  const shuffledRight: DesafioPair[] = useMemo(() => {
    if (pairs.length <= 1) return pairs;
    const shift = ((slide.conceptIndex + 1) % pairs.length + pairs.length) % pairs.length;
    return [...pairs.slice(shift), ...pairs.slice(0, shift)];
  }, [pairs, slide.conceptIndex]);

  const matchedMap = revealed ? answer.value as Record<string, string> : matched;

  const getLeftColor = (pairId: string): string | null => {
    if (!matchedMap[pairId]) return null;
    const idx = pairs.findIndex(p => p.id === pairId);
    return idx >= 0 ? PAIR_COLORS[idx % PAIR_COLORS.length] : null;
  };

  const getRightColor = (pairId: string): string | null => {
    const rightId = pairId + '_r';
    const leftId  = Object.keys(matchedMap).find(k => matchedMap[k] === rightId);
    if (!leftId) return null;
    const idx = pairs.findIndex(p => p.id === leftId);
    return idx >= 0 ? PAIR_COLORS[idx % PAIR_COLORS.length] : null;
  };

  const isPairCorrect = (pairId: string): boolean => matchedMap[pairId] === pairId + '_r';

  const handleLeftPress = (pairId: string) => {
    if (revealed) return;
    onSelectLeft(selectedLeft === pairId ? null : pairId);
  };

  const handleRightPress = (pair: DesafioPair) => {
    if (revealed || !selectedLeft) return;
    const rightId = pair.id + '_r';
    const next    = { ...matched };
    const prevLeftForRight = Object.keys(next).find(k => next[k] === rightId);
    if (prevLeftForRight) delete next[prevLeftForRight];
    if (next[selectedLeft]) delete next[selectedLeft];
    next[selectedLeft] = rightId;
    onMatch(next);
    onSelectLeft(null);
  };

  return (
    <View style={c.root}>
      <Text style={c.typeLabel}>{slideTypeLabel(slide.type, slide.isRetry, slide.isSpacedRepetition)}</Text>
      <Text style={mp.prompt}>{slide.pairsPrompt ?? 'Une cada elemento con su descripción'}</Text>
      <View style={mp.cols}>

        {/* Left column — chips with drag handle */}
        <View style={mp.col}>
          {pairs.map((pair) => {
            const color  = getLeftColor(pair.id);
            const isSel  = selectedLeft === pair.id;
            const isCorr = revealed && isPairCorrect(pair.id);
            const isWrg  = revealed && !!matchedMap[pair.id] && !isPairCorrect(pair.id);
            return (
              <Pressable
                key={pair.id}
                style={[
                  mp.chip,
                  isSel && mp.chipSelected,
                  !revealed && color ? { borderColor: color, borderWidth: 2, backgroundColor: color + '18' } : null,
                  revealed && isCorr && mp.chipCorrect,
                  revealed && isWrg  && mp.chipWrong,
                ]}
                onPress={() => handleLeftPress(pair.id)}
                disabled={revealed}
              >
                {revealed ? (
                  <Text style={[mp.revealIcon, isCorr ? mp.iconCorrect : mp.iconWrong]}>
                    {isCorr ? '✓' : '✗'}
                  </Text>
                ) : (
                  <Text style={[mp.handle, isSel && mp.handleActive]}>☰</Text>
                )}
                <Text style={mp.chipText} numberOfLines={2}>{pair.left}</Text>
                {!revealed && color && <View style={[mp.connector, { backgroundColor: color }]} />}
              </Pressable>
            );
          })}
        </View>

        {/* Right column — target slots */}
        <View style={mp.col}>
          {shuffledRight.map((pair) => {
            const color       = getRightColor(pair.id);
            const hasSelected = !!selectedLeft && !revealed;
            return (
              <Pressable
                key={pair.id + '_r'}
                style={[
                  mp.target,
                  hasSelected && mp.targetActive,
                  !revealed && color ? { borderColor: color, borderWidth: 2 } : null,
                ]}
                onPress={() => handleRightPress(pair)}
                disabled={revealed || !selectedLeft}
              >
                {!revealed && color && <View style={[mp.connector, { backgroundColor: color }]} />}
                <Text style={mp.targetText} numberOfLines={2}>{pair.right}</Text>
              </Pressable>
            );
          })}
        </View>

      </View>
    </View>
  );
}

const mp = StyleSheet.create({
  prompt: { fontSize: 16, fontWeight: '700', color: palette.charcoal, marginBottom: 16, lineHeight: 22 },
  cols:   { flexDirection: 'row', gap: 10 },
  col:    { flex: 1, gap: 10 },

  // Left: interactive chip with drag handle
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.blanco, borderRadius: 22,
    borderWidth: 2, borderColor: palette.bordeClaro,
    paddingHorizontal: 12, paddingVertical: 14, minHeight: 58,
  },
  chipSelected: { borderColor: palette.morado, backgroundColor: palette.moradoBg },
  chipCorrect:  { borderColor: palette.verde,      backgroundColor: '#F0FDF7' },
  chipWrong:    { borderColor: palette.rojoError,  backgroundColor: palette.rojoErrorBg },

  handle:       { fontSize: 15, color: palette.grisMedio, flexShrink: 0, opacity: 0.5 },
  handleActive: { color: palette.morado, opacity: 1 },
  chipText:     { flex: 1, fontSize: 13, fontWeight: '600', color: palette.charcoal, lineHeight: 18 },

  // Color connector pill — appears on right of left chip and left of right target
  connector: { width: 14, height: 4, borderRadius: 2, flexShrink: 0 },

  // Right: target slot — lavender background signals "receptive"
  target: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: palette.moradoBg,
    borderRadius: 22,
    borderWidth: 1.5, borderColor: palette.morado + '30',
    paddingHorizontal: 12, paddingVertical: 14, minHeight: 58,
  },
  targetActive: { borderColor: palette.morado + '80', borderWidth: 2 },
  targetText:   { flex: 1, fontSize: 13, fontWeight: '700', color: palette.charcoal, lineHeight: 18, textAlign: 'center' },

  revealIcon: { fontSize: 14, fontWeight: '700', flexShrink: 0 },
  iconCorrect:{ color: palette.verde },
  iconWrong:  { color: palette.rojoError },
});

// ── Classify content ──────────────────────────────────────────────────────────

function ClassifyContent({
  slide, assigned, onAssign, answer,
}: {
  slide: DesafioSlide;
  assigned: Record<string, string>;
  onAssign: (updated: Record<string, string>) => void;
  answer: SlideAnswer | undefined;
}) {
  const revealed   = !!answer;
  const items      = slide.classifyItems ?? [];
  const categories = slide.classifyCategories ?? [];
  const revMap     = revealed ? answer.value as Record<string, string> : assigned;

  return (
    <View style={c.root}>
      <Text style={c.typeLabel}>{slideTypeLabel(slide.type, slide.isRetry, slide.isSpacedRepetition)}</Text>
      <Text style={cl.prompt}>{slide.classifyPrompt ?? 'Clasifica cada expresión'}</Text>
      {items.map((item) => {
        const chosen = revMap[item.id];
        const isCorr = revealed && chosen === item.category;
        const isWrg  = revealed && !!chosen && chosen !== item.category;
        return (
          <View
            key={item.id}
            style={[
              cl.itemCard,
              revealed && isCorr && cl.itemCorrect,
              revealed && isWrg  && cl.itemWrong,
            ]}
          >
            <Text style={cl.itemText}>{item.text}</Text>
            {!revealed && (
              <View style={cl.catRow}>
                {categories.map((cat, ci) => (
                  <Pressable
                    key={cat}
                    style={[
                      cl.catBtn,
                      assigned[item.id] === cat && {
                        backgroundColor: CAT_COLORS[ci % CAT_COLORS.length],
                        borderColor:     CAT_COLORS[ci % CAT_COLORS.length],
                      },
                    ]}
                    onPress={() => onAssign({ ...assigned, [item.id]: cat })}
                  >
                    <Text style={[cl.catBtnText, assigned[item.id] === cat && cl.catBtnTextSel]}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {revealed && (
              <Text style={[cl.revealText, isCorr ? cl.textCorrect : cl.textWrong]}>
                {isCorr ? `✓ ${chosen}` : `✗ ${chosen ?? '—'}  →  ${item.category}`}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const cl = StyleSheet.create({
  prompt: { fontSize: 16, fontWeight: '700', color: palette.charcoal, marginBottom: 16, lineHeight: 22 },
  itemCard: {
    backgroundColor: palette.blanco, borderRadius: 14,
    borderWidth: 1.5, borderColor: palette.bordeClaro,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
  },
  itemCorrect: { borderColor: palette.verde, backgroundColor: '#F0FDF7' },
  itemWrong:   { borderColor: palette.rojoError, backgroundColor: palette.rojoErrorBg },
  itemText:    { fontSize: 15, fontWeight: '600', color: palette.charcoal, marginBottom: 10 },
  catRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1.5, borderColor: palette.bordeClaro, backgroundColor: palette.blanco,
  },
  catBtnText:    { fontSize: 12, fontWeight: '600', color: palette.charcoal },
  catBtnTextSel: { color: palette.blanco },
  revealText:    { fontSize: 13, fontWeight: '600', marginTop: 4 },
  textCorrect:   { color: palette.verde },
  textWrong:     { color: palette.rojoError },
});

// ── Order steps content ───────────────────────────────────────────────────────

function OrderStepsContent({
  slide, stepsOrder, onReorder, answer,
}: {
  slide: DesafioSlide;
  stepsOrder: number[];
  onReorder: (updated: number[]) => void;
  answer: SlideAnswer | undefined;
}) {
  const revealed     = !!answer;
  const steps        = slide.steps ?? [];
  const correctOrder = slide.correctOrder ?? [];
  const displayOrder = revealed ? answer.value as number[] : stepsOrder;

  const correctSequence = correctOrder.map(i => steps[i]).filter(Boolean);

  const moveUp = (pos: number) => {
    if (pos === 0 || revealed) return;
    const next = [...stepsOrder];
    [next[pos - 1], next[pos]] = [next[pos], next[pos - 1]];
    onReorder(next);
  };

  const isStepCorrect = (pos: number): boolean => displayOrder[pos] === correctOrder[pos];

  return (
    <View style={c.root}>
      <Text style={c.typeLabel}>{slideTypeLabel(slide.type, slide.isRetry, slide.isSpacedRepetition)}</Text>
      <Text style={os.prompt}>{slide.orderPrompt ?? 'Ordena los pasos en el orden correcto'}</Text>
      {displayOrder.map((stepIdx, pos) => {
        const stepText = steps[stepIdx] ?? '';
        const posCorr  = revealed && isStepCorrect(pos);
        const posWrg   = revealed && !isStepCorrect(pos);
        return (
          <View
            key={stepIdx}
            style={[os.stepRow, posCorr && os.stepCorrect, posWrg && os.stepWrong]}
          >
            <View style={os.stepNum}>
              {revealed
                ? <Text style={[os.stepNumText, posCorr ? os.iconCorrect : os.iconWrong]}>
                    {posCorr ? '✓' : '✗'}
                  </Text>
                : <Text style={os.stepNumText}>{pos + 1}</Text>}
            </View>
            <Text style={os.stepText} numberOfLines={3}>{stepText}</Text>
            {!revealed && pos > 0 && (
              <Pressable style={os.upBtn} onPress={() => moveUp(pos)} hitSlop={8}>
                <Text style={os.upBtnText}>↑</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const os = StyleSheet.create({
  prompt: { fontSize: 16, fontWeight: '700', color: palette.charcoal, marginBottom: 16, lineHeight: 22 },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.blanco, borderRadius: 12,
    borderWidth: 1.5, borderColor: palette.bordeClaro,
    paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8,
  },
  stepCorrect: { borderColor: palette.verde, backgroundColor: '#F0FDF7' },
  stepWrong:   { borderColor: palette.rojoError, backgroundColor: palette.rojoErrorBg },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: palette.moradoBg, justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  stepNumText: { fontSize: 13, fontWeight: '700', color: palette.morado },
  iconCorrect: { color: palette.verde },
  iconWrong:   { color: palette.rojoError },
  stepText: { flex: 1, fontSize: 14, color: palette.charcoal, lineHeight: 20 },
  upBtn:    { padding: 4 },
  upBtnText:{ fontSize: 18, fontWeight: '700', color: palette.morado },
  correctOrderBox: {
    marginTop: 12, padding: 14, borderRadius: 12,
    backgroundColor: '#F0FDF7', borderWidth: 1, borderColor: palette.verde + '44',
  },
  correctOrderTitle: { fontSize: 11, fontWeight: '700', color: palette.verde, marginBottom: 6, letterSpacing: 1 },
  correctOrderItem:  { fontSize: 13, color: '#166534', lineHeight: 20 },
});

// ── Informational content (insight, instant_feedback, mastery_screen) ─────────

function InformationalContent({ slide }: { slide: DesafioSlide }) {
  const isMastery = slide.type === 'mastery_screen';
  const hasExamples = slide.type === 'insight' && Array.isArray(slide.examples) && slide.examples.length > 0;
  return (
    <View style={c.root}>
      <Text style={c.typeLabel}>{slideTypeLabel(slide.type)}</Text>
      <Text style={c.emoji}>{slideEmoji(slide)}</Text>
      <Text style={isMastery ? c.masteryTitle : c.insightTitle}>{slide.title}</Text>
      <Text style={c.body}>{slide.body}</Text>
      {hasExamples && (
        <View style={c.examplesRow}>
          {slide.examples!.map((ex, i) => (
            <View key={i} style={c.exampleCard}>
              <Text style={c.exampleExpr}>{ex.expression}</Text>
              <Text style={c.exampleLabel}>{ex.label}</Text>
            </View>
          ))}
        </View>
      )}
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

// ── Bullet parser for insight slides ─────────────────────────────────────────

function parseBullets(body: string): { bullets: string[]; rest: string } {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const bullets: string[] = [];
  const restLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('* ') || line.startsWith('• ')) {
      bullets.push(line.replace(/^[*•]\s*/, '').trim());
    } else {
      restLines.push(line);
    }
  }
  return { bullets, rest: restLines.join(' ').trim() };
}

// ── Focus detection for SmartExampleCard ─────────────────────────────────────
//
// Finds the pedagogically key fragment inside a raw example string.
// Works across subjects (math, history, chemistry, biology, etc.) using
// pattern matching only — no AI calls, no subject-specific rules.

interface FocusResult {
  before: string;
  focus:  string;
  after:  string;
  focusLabel: string | null;
}

function detectExampleFocus(raw: string, conceptTitle: string): FocusResult {
  // Strip redundant "Ejemplo: " prefix — the card header already says "Ejemplo práctico"
  const expr = raw.replace(/^[Ee]jemplo\s*:\s*/, '').trim() || raw.trim();
  const none: FocusResult = { before: expr, focus: '', after: '', focusLabel: null };

  // 1. Date range: 1914–1918 / 1939-1945
  const dr = expr.match(/([\s\S]*?)(\d{4}[–—\-]\d{4})([\s\S]*)/);
  if (dr) return { before: dr[1], focus: dr[2], after: dr[3], focusLabel: 'período' };

  // 2. Algebraic term with Unicode superscript: -6m⁴, ax², 3x²y
  const alg = expr.match(/([\s\S]*?)([-−]?\d*[a-zA-Z]\w*[⁰¹²³⁴-⁹]+)([\s\S]*)/);
  if (alg && alg[2].length >= 2) return { before: alg[1], focus: alg[2], after: alg[3], focusLabel: null };

  // 3. Coefficient × variable: -6m, 3x, 2ab
  const cv = expr.match(/([\s\S]*?)([-−]?\d+[a-zA-Z][a-zA-Z0-9]*)([\s\S]*)/);
  if (cv && cv[2].length >= 2) return { before: cv[1], focus: cv[2], after: cv[3], focusLabel: null };

  // 4. Chemical / molecular formula: NaCl, H2O, CO2, ATP, DNA
  const chem = expr.match(/([\s\S]*?)(\b[A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)+\b)([\s\S]*)/);
  if (chem) return { before: chem[1], focus: chem[2], after: chem[3], focusLabel: 'compuesto' };

  // 5. Arrow relation: "X → Y" — highlight the subject (X)
  const arrIdx = expr.indexOf('→');
  if (arrIdx > 0) {
    return { before: '', focus: expr.slice(0, arrIdx).trim(), after: ' → ' + expr.slice(arrIdx + 1).trim(), focusLabel: null };
  }

  // 6. Single year: 1818, 1969
  const yr = expr.match(/([\s\S]*?)(\b\d{4}\b)([\s\S]*)/);
  if (yr) return { before: yr[1], focus: yr[2], after: yr[3], focusLabel: 'año' };

  // 7. Short expression (≤ 20 chars): highlight the whole thing with concept title as label
  if (expr.length <= 20) {
    const label = conceptTitle.length <= 28 ? conceptTitle : null;
    return { before: '', focus: expr, after: '', focusLabel: label };
  }

  return none;
}

// ── Smart example card — highlights the pedagogical focus element ──────────────

function SmartExampleCard({ expression, conceptTitle }: { expression: string; conceptTitle: string }) {
  const { before, focus, after, focusLabel } = detectExampleFocus(expression, conceptTitle);
  const hasFocus = focus.length > 0;

  return (
    <View style={ins.exampleCard}>
      <Text style={ins.exampleTag}>Ejemplo práctico</Text>

      {/* Full expression with the focus element highlighted inline */}
      <Text style={ins.smartExprText}>
        {before}
        {hasFocus ? <Text style={ins.smartFocusText}>{focus}</Text> : null}
        {after}
      </Text>

      {/* Focus label badge — names the type of element highlighted */}
      {hasFocus && focusLabel ? (
        <View style={ins.focusBadgeRow}>
          <View style={ins.focusBadge}>
            <Text style={ins.focusBadgeText}>{focusLabel}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ── Insight content — redesigned CONCEPTO slide ───────────────────────────────

function InsightContent({ slide }: { slide: DesafioSlide }) {
  const { bullets, rest } = parseBullets(slide.body ?? '');
  const hasExamples = Array.isArray(slide.examples) && slide.examples.length > 0;

  return (
    <View style={ins.root}>
      <Text style={c.typeLabel}>{slideTypeLabel(slide.type)}</Text>
      <Text style={ins.emoji}>{slideEmoji(slide)}</Text>

      {/* Concept title — stronger hierarchy */}
      <Text style={ins.title}>{slide.title}</Text>

      {/* Learning blocks — each bullet becomes a mini-card */}
      {bullets.length > 0 && (
        <View style={ins.blocksContainer}>
          {bullets.map((bullet, i) => (
            <View key={i} style={ins.learningBlock}>
              <Text style={ins.blockIcon}>✦</Text>
              <Text style={ins.blockText}>{bullet}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Plain text body (key_relation, process_flow — no bullet markers).
          Hidden when examples are present: same content already appears in the example card. */}
      {rest.length > 0 && !hasExamples && <Text style={ins.restText}>{rest}</Text>}

      {/* Example card — smart focus highlight */}
      {hasExamples && slide.examples!.map((ex, i) => (
        <SmartExampleCard key={i} expression={ex.expression} conceptTitle={slide.title ?? ''} />
      ))}
    </View>
  );
}

// ── Mastery / completion reward summary ──────────────────────────────────────

function MasteryContent({
  slide, totalXP, answers, dynamicSlides, bestStreak,
}: {
  slide: DesafioSlide;
  totalXP: number;
  answers: Record<number, SlideAnswer>;
  dynamicSlides: DesafioSlide[];
  bestStreak: number;
}) {
  const interactiveIndices = Object.keys(answers)
    .map(k => parseInt(k, 10))
    .filter(i => i < dynamicSlides.length && isInteractiveByType(dynamicSlides[i]));
  const answeredCount = interactiveIndices.length;
  const correctCount  = interactiveIndices.filter(i => answers[i].correct).length;
  const accuracy      = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const concepts      = slide.conceptsCovered ?? [];
  const nemLabel      = accuracy >= 80 ? '¡Preparación excelente!' : accuracy >= 60 ? 'Buen avance' : 'Sigue practicando';

  return (
    <View style={ms.root}>
      <Text style={ms.emoji}>{slide.emoji ?? '🏆'}</Text>
      <Text style={ms.heading}>{slide.title ?? '¡Desafío completado!'}</Text>

      {/* XP hero */}
      <View style={ms.xpHero}>
        <Text style={ms.xpHeroText}>+{totalXP} XP</Text>
      </View>

      {/* 2-col stats */}
      <View style={ms.statsRow}>
        <View style={ms.statCard}>
          <Text style={ms.statVal}>{accuracy}%</Text>
          <Text style={ms.statLbl}>Precisión</Text>
        </View>
        <View style={ms.statSep} />
        <View style={ms.statCard}>
          <Text style={ms.statVal}>{bestStreak >= 2 ? `🔥 x${bestStreak}` : '—'}</Text>
          <Text style={ms.statLbl}>Mejor combo</Text>
        </View>
      </View>

      {/* Concepts mastered */}
      {concepts.length > 0 && (
        <View style={ms.section}>
          <Text style={ms.sectionTitle}>
            {concepts.length} concepto{concepts.length !== 1 ? 's' : ''} dominado{concepts.length !== 1 ? 's' : ''}
          </Text>
          <View style={ms.chips}>
            {concepts.map((name, i) => (
              <View key={i} style={ms.chip}>
                <Text style={ms.chipText}>{name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* NEM progress */}
      <View style={ms.section}>
        <View style={ms.nemHeader}>
          <Text style={ms.sectionTitle}>Preparación NEM</Text>
          <Text style={ms.nemPct}>{accuracy}%</Text>
        </View>
        <View style={ms.nemTrack}>
          <View style={[ms.nemFill, { width: `${accuracy}%` }]} />
        </View>
        <Text style={ms.nemSub}>{nemLabel}</Text>
      </View>
    </View>
  );
}

// ── Slide content dispatcher (inside keyed ScrollView — safe at grandchild depth) ──

function SlideContent({
  slide,
  mcSelection, onMcSelect, mcBlocked,
  pairsSelectedLeft, onPairsSelectLeft, pairsMatched, onPairsMatch,
  classifyAssigned, onClassifyAssign,
  stepsOrder, onStepsReorder,
  answer,
}: {
  slide: DesafioSlide;
  mcSelection: string | null;
  onMcSelect: (letter: string) => void;
  mcBlocked: boolean;
  pairsSelectedLeft: string | null;
  onPairsSelectLeft: (id: string | null) => void;
  pairsMatched: Record<string, string>;
  onPairsMatch: (updated: Record<string, string>) => void;
  classifyAssigned: Record<string, string>;
  onClassifyAssign: (updated: Record<string, string>) => void;
  stepsOrder: number[];
  onStepsReorder: (updated: number[]) => void;
  answer: SlideAnswer | undefined;
}) {
  if (!isInteractiveByType(slide)) {
    if (slide.type === 'insight') return <InsightContent slide={slide} />;
    return <InformationalContent slide={slide} />;
  }

  switch (effectiveInteractionType(slide)) {
    case 'multiple_choice':
      return <MultipleChoiceContent slide={slide} selection={mcSelection} onSelect={onMcSelect} answer={answer} blocked={mcBlocked} />;
    case 'fill_blank':
      return <FillBlankContent slide={slide} selection={mcSelection} onSelect={onMcSelect} answer={answer} blocked={mcBlocked} />;
    case 'match_pairs':
      return (
        <MatchPairsContent
          slide={slide} selectedLeft={pairsSelectedLeft}
          onSelectLeft={onPairsSelectLeft} matched={pairsMatched}
          onMatch={onPairsMatch} answer={answer}
        />
      );
    case 'classify':
      return (
        <ClassifyContent
          slide={slide} assigned={classifyAssigned}
          onAssign={onClassifyAssign} answer={answer}
        />
      );
    case 'order_steps':
      return (
        <OrderStepsContent
          slide={slide} stepsOrder={stepsOrder}
          onReorder={onStepsReorder} answer={answer}
        />
      );
    default:
      return <InformationalContent slide={slide} />;
  }
}

// ── Shared slide styles ───────────────────────────────────────────────────────

const c = StyleSheet.create({
  root:      { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  typeLabel: { ...Typography.challengeSectionLabel, color: palette.morado, marginBottom: 16 },
  emoji:    { fontSize: 48, textAlign: 'center', marginBottom: 16 },
  question: { ...Typography.challengeQuestion, color: palette.charcoal, marginBottom: 24 },
  subLabel: { fontSize: 13, fontWeight: '600', color: palette.grisMedio, marginBottom: 12 },

  hintBox: {
    marginTop: 16, padding: 14, borderRadius: 12,
    backgroundColor: palette.rojoErrorBg, borderWidth: 1, borderColor: palette.rojoError + '33',
  },
  hintText: { ...Typography.challengeExplanation, color: palette.rojoErrorDark },

  explanationBox: {
    marginTop: 16, padding: 14, borderRadius: 12,
    backgroundColor: '#F0FDF7', borderWidth: 1, borderColor: palette.verde + '44',
  },
  explanationText: { ...Typography.challengeExplanation, color: '#166534' },

  insightTitle: { fontSize: 22, fontWeight: '800', color: palette.charcoal, lineHeight: 30, marginBottom: 16 },
  masteryTitle: {
    fontSize: 26, fontWeight: '800', color: palette.charcoal,
    textAlign: 'center', lineHeight: 34, marginBottom: 16,
  },
  body: { fontSize: 16, color: palette.grisMedio, lineHeight: 24 },

  conceptsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 24 },
  conceptChip:  { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: palette.moradoBg, borderRadius: 20 },
  conceptChipText: { fontSize: 13, fontWeight: '600', color: palette.morado },

  examplesRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 24,
  },
  exampleCard: {
    flex: 1,
    minWidth: 80,
    alignItems: 'center' as const,
    backgroundColor: palette.blanco,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.bordeClaro,
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  exampleExpr: {
    fontFamily: 'Nunito',
    fontWeight: '800' as const,
    fontSize: 17,
    color: palette.morado,
    marginBottom: 6,
    textAlign: 'center' as const,
  },
  exampleLabel: {
    fontFamily: 'Nunito',
    fontWeight: '600' as const,
    fontSize: 11,
    color: palette.grisMedio,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    textAlign: 'center' as const,
  },
});

// ── Insight (CONCEPTO) slide styles ──────────────────────────────────────────

const ins = StyleSheet.create({
  root: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 14 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.charcoal,
    lineHeight: 34,
    letterSpacing: -0.3,
    marginBottom: 20,
  },
  blocksContainer: { gap: 10, marginBottom: 4 },
  learningBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F5F2FF',
    borderRadius: 16,
    padding: 14,
  },
  blockIcon: {
    fontSize: 13,
    color: palette.morado,
    lineHeight: 22,
    marginTop: 1,
    flexShrink: 0,
  },
  blockText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: palette.charcoal,
    lineHeight: 22,
  },
  restText: {
    fontSize: 15,
    color: palette.charcoal,
    lineHeight: 24,
    marginTop: 12,
  },
  exampleCard: {
    marginTop: 24,
    backgroundColor: palette.blanco,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: palette.morado + '33',
    padding: 18,
    shadowColor: palette.morado,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 10,
    elevation: 2,
  },
  exampleTag: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.morado,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  smartExprText: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.charcoal,
    lineHeight: 28,
  },
  smartFocusText: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.morado,
    lineHeight: 28,
  },
  focusBadgeRow: {
    flexDirection: 'row' as const,
    marginTop: 10,
  },
  focusBadge: {
    backgroundColor: palette.morado + '18',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  focusBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: palette.morado,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
});

// ── XP per slide type ────────────────────────────────────────────────────────
function xpForSlide(slide: DesafioSlide): number {
  switch (slide.type) {
    case 'discovery_challenge':     return 8;   // easy
    case 'reinforcement_challenge': return 12;  // medium
    case 'spaced_repetition':       return 12;  // medium
    case 'boss_loop':               return slide.emoji === '🏆' ? 25 : 18; // final / hard
    default:                        return 0;
  }
}

// ── Feedback message pools ────────────────────────────────────────────────────
const SUCCESS_MSGS = ['¡Bien!', '¡Excelente!', '¡Eso!', '¡Vas increíble!', '¡Dominado!'] as const;
const WRONG_MSGS   = ['Casi.', 'Buen intento.', 'Revisemos esto.'] as const;

function pickRandom(pool: readonly string[], lastIdx: { current: number }): string {
  const len = pool.length;
  let idx   = Math.floor(Math.random() * len);
  if (len > 1 && idx === lastIdx.current) idx = (idx + 1) % len;
  lastIdx.current = idx;
  return pool[idx];
}

// Geometry emojis are semantically wrong for algebra/math content — replace them.
const GEOMETRY_EMOJIS = new Set(['📐', '📏', '🔺', '🔷', '🔶', '🔵', '⬛', '🔲']);
function displayEmoji(emoji: string | undefined): string | undefined {
  if (!emoji) return undefined;
  return GEOMETRY_EMOJIS.has(emoji) ? '🔢' : emoji;
}

// Returns a type-based emoji that varies per concept so each slide feels distinct.
// Ignores slide.emoji — the AI-generated one is usually always 📚.
function slideEmoji(slide: DesafioSlide): string {
  const idx = slide.conceptIndex ?? 0;
  switch (slide.type) {
    case 'discovery_challenge':     return ['🔎', '🧠', '⚔️'][idx % 3];
    case 'insight':                 return ['💡', '🧩', '🗺️'][idx % 3];
    case 'reinforcement_challenge': return ['🎯', '🔥'][idx % 2];
    case 'spaced_repetition':       return '📝';
    default:                        return displayEmoji(slide.emoji) ?? '📚';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════

export default function DesafioScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [session,       setSession]       = useState<DesafioSession | null>(null);
  const [dynamicSlides, setDynamicSlides] = useState<DesafioSlide[]>([]);
  const [currentIdx,    setCurrentIdx]    = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [showCover,     setShowCover]     = useState(false);

  // Submitted answers per slide index
  const [answers,     setAnswers]     = useState<Record<number, SlideAnswer>>({});
  // Available retries per concept index
  const [retriesLeft, setRetriesLeft] = useState<Record<number, number>>({});

  // Timer: records when each interactive slide first renders (read-only in handleCta)
  const slideStartTime  = useRef(Date.now());
  // No-repeat tracking for feedback messages
  const lastSuccessIdx  = useRef(-1);
  const lastWrongIdx    = useRef(-1);

  // ── XP state ─────────────────────────────────────────────────────────────
  const [totalXP,   setTotalXP]   = useState(0);
  const [xpDisplay, setXpDisplay] = useState<number | null>(null);

  const xpOpacity    = useSharedValue(0);
  const xpTranslateY = useSharedValue(0);
  const xpScale      = useSharedValue(1);

  const xpFloatStyle = useAnimatedStyle(() => ({
    opacity:   xpOpacity.value,
    transform: [
      { translateY: xpTranslateY.value },
      { scale:      xpScale.value      },
    ],
  }));

  const triggerXpFloat = useCallback((xp: number) => {
    setXpDisplay(xp);
    setTotalXP(prev => prev + xp);
    xpOpacity.value    = 0;
    xpTranslateY.value = 0;
    xpScale.value      = 0.7;
    xpOpacity.value    = withSequence(
      withTiming(1,   { duration: 150, easing: Easing.out(Easing.quad) }),
      withTiming(1,   { duration: 550 }),
      withTiming(0,   { duration: 200, easing: Easing.in(Easing.quad)  }),
    );
    xpTranslateY.value = withTiming(-56, { duration: 900, easing: Easing.out(Easing.quad) });
    xpScale.value      = withSequence(
      withTiming(1.25, { duration: 200, easing: Easing.out(Easing.back(1.5)) }),
      withTiming(1.0,  { duration: 700, easing: Easing.out(Easing.quad)      }),
    );
  }, [xpOpacity, xpTranslateY, xpScale]);

  // ── Streak state ──────────────────────────────────────────────────────────
  const [streak,           setStreak]           = useState(0);
  const [bestStreak,       setBestStreak]        = useState(0);
  const [comboLostVisible, setComboLostVisible] = useState(false);

  const comboShakeX  = useSharedValue(0);
  const comboOpacity = useSharedValue(1);

  const comboLostStyle = useAnimatedStyle(() => ({
    opacity:   comboOpacity.value,
    transform: [{ translateX: comboShakeX.value }],
  }));

  const triggerComboLost = useCallback(() => {
    setComboLostVisible(true);
    comboOpacity.value = 1;
    comboShakeX.value  = withSequence(
      withTiming(-5, { duration: 55 }),
      withTiming( 5, { duration: 55 }),
      withTiming(-4, { duration: 55 }),
      withTiming( 4, { duration: 55 }),
      withTiming( 0, { duration: 55 }),
    );
    comboOpacity.value = withSequence(
      withTiming(1, { duration: 250 }),
      withTiming(0, { duration: 450, easing: Easing.in(Easing.quad) }),
    );
    setTimeout(() => setComboLostVisible(false), 720);
  }, [comboShakeX, comboOpacity]);

  // ── Energy state ──────────────────────────────────────────────────────────
  const [energy,    setEnergy]    = useState(3);
  const [energyMsg, setEnergyMsg] = useState<{ text: string; recovery: boolean } | null>(null);

  const energyMsgOpacity = useSharedValue(0);

  const energyMsgStyle = useAnimatedStyle(() => ({
    opacity: energyMsgOpacity.value,
  }));

  const showEnergyMsg = useCallback((text: string, recovery: boolean) => {
    setEnergyMsg({ text, recovery });
    energyMsgOpacity.value = 0;
    energyMsgOpacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(1, { duration: 1600 }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }),
    );
    setTimeout(() => setEnergyMsg(null), 2200);
  }, [energyMsgOpacity]);

  // ── Speed bonus ───────────────────────────────────────────────────────────
  const [speedBonusVisible, setSpeedBonusVisible] = useState(false);

  const speedOpacity = useSharedValue(0);
  const speedScale   = useSharedValue(1);

  const speedBonusStyle = useAnimatedStyle(() => ({
    opacity:   speedOpacity.value,
    transform: [{ scale: speedScale.value }],
  }));

  const triggerSpeedBonus = useCallback(() => {
    setSpeedBonusVisible(true);
    speedOpacity.value = 0;
    speedScale.value   = 0.6;
    speedOpacity.value = withSequence(
      withTiming(1,   { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(1,   { duration: 280 }),
      withTiming(0,   { duration: 200, easing: Easing.in(Easing.quad)  }),
    );
    speedScale.value = withSequence(
      withTiming(1.3, { duration: 150, easing: Easing.out(Easing.back(2)) }),
      withTiming(1.0, { duration: 450, easing: Easing.out(Easing.quad)   }),
    );
    setTimeout(() => setSpeedBonusVisible(false), 620);
  }, [speedOpacity, speedScale]);

  // ── Success message ───────────────────────────────────────────────────────
  const [successMsg,     setSuccessMsg]     = useState<string | null>(null);

  const successOpacity = useSharedValue(0);
  const successScale   = useSharedValue(1);

  const successMsgStyle = useAnimatedStyle(() => ({
    opacity:   successOpacity.value,
    transform: [{ scale: successScale.value }],
  }));

  const triggerSuccessMsg = useCallback((msg: string) => {
    setSuccessMsg(msg);
    successOpacity.value = 0;
    successScale.value   = 0.88;
    successOpacity.value = withSequence(
      withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 750 }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.quad)  }),
    );
    successScale.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.back(1.5)) });
    setTimeout(() => setSuccessMsg(null), 1200);
  }, [successOpacity, successScale]);

  // Per-interaction-type UI state (all reset on slide change)
  const [mcSelection,       setMcSelection]       = useState<string | null>(null);
  const [pairsSelectedLeft, setPairsSelectedLeft] = useState<string | null>(null);
  const [pairsMatched,      setPairsMatched]      = useState<Record<string, string>>({});
  const [classifyAssigned,  setClassifyAssigned]  = useState<Record<string, string>>({});
  const [stepsOrder,        setStepsOrder]        = useState<number[]>([]);

  // ── Feedback reveal state ─────────────────────────────────────────────────
  // showFeedback is separate from `revealed`: it's set with a delay after tap
  // to let the option animations play before the feedback panel slides in.
  const [showFeedback,  setShowFeedback]  = useState(false);
  const [mcBlocked,     setMcBlocked]     = useState(false); // blocks options between tap + reveal

  const feedbackY       = useSharedValue(20);
  const feedbackOpacity = useSharedValue(0);
  const feedbackAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: feedbackY.value }],
    opacity: feedbackOpacity.value,
  }));

  // Animate feedback card in when it becomes visible
  useEffect(() => {
    if (!showFeedback) return;
    feedbackY.value       = 20;
    feedbackOpacity.value = 0;
    feedbackY.value       = withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) });
    feedbackOpacity.value = withTiming(1, { duration: 200 });
  }, [showFeedback]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load session from AsyncStorage ────────────────────────────────────────
  // useFocusEffect instead of useEffect([]) so that re-entering this screen
  // after a new PDF upload always starts fresh (screen may stay mounted in the
  // navigation stack across sessions).
  useFocusEffect(
    useCallback(() => {
      // Full reset before reading new data
      setCurrentIdx(0);
      setAnswers({});
      setRetriesLeft({});
      setSession(null);
      setDynamicSlides([]);
      setTotalXP(0);
      setStreak(0);
      setBestStreak(0);
      setEnergy(3);
      setShowCover(false);
      setLoading(true);

      AsyncStorage.getItem(DESAFIO_KEY).then(raw => {
        if (raw) {
          try {
            const s: DesafioSession = JSON.parse(raw);
            setSession(s);
            setShowCover(true);
            setDynamicSlides(s.slides.map(shuffleSlideChoices));
            if (s.retrySlides) {
              const init: Record<number, number> = {};
              Object.keys(s.retrySlides).forEach(k => {
                const n = parseInt(k, 10);
                if (!isNaN(n)) init[n] = Math.min(2, s.retrySlides![k].length);
              });
              setRetriesLeft(init);
            }
          } catch {}
        }
        setLoading(false);
      });
    }, [])
  );

  // ── Reset interaction state on slide advance ───────────────────────────────
  useEffect(() => {
    setMcSelection(null);
    setMcBlocked(false);
    setShowFeedback(false);
    feedbackY.value       = 20;
    feedbackOpacity.value = 0;
    setPairsSelectedLeft(null);
    setPairsMatched({});
    setClassifyAssigned({});
    const slide = dynamicSlides[currentIdx];
    setStepsOrder(slide?.steps ? slide.steps.map((_, i) => i) : []);
    slideStartTime.current = Date.now();
  }, [currentIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ─────────────────────────────────────────────────────────
  const slide    = dynamicSlides[currentIdx];
  const revealed = !!answers[currentIdx];
  const isLast   = currentIdx >= dynamicSlides.length - 1;
  const itype    = slide ? effectiveInteractionType(slide) : 'multiple_choice';

  // MC/fill_blank evaluate on tap — no CTA submit step needed
  const isImmediateMcSlide = !!slide && isInteractiveByType(slide) &&
    (itype === 'multiple_choice' || itype === 'fill_blank');

  const ctaDisabled = useMemo(() => {
    if (!slide || !isInteractiveByType(slide)) return false;
    if (revealed) return false;
    switch (itype) {
      case 'multiple_choice': return true; // CTA hidden until feedback shows
      case 'fill_blank':      return true;
      case 'match_pairs':     return Object.keys(pairsMatched).length < (slide.pairs?.length ?? 1);
      case 'classify':        return Object.keys(classifyAssigned).length < (slide.classifyItems?.length ?? 1);
      case 'order_steps':     return false;
      default:                return false;
    }
  }, [slide, revealed, itype, pairsMatched, classifyAssigned]);

  const ctaLabel = useMemo(() => {
    if (!slide) return 'Continuar';
    if (!isInteractiveByType(slide)) return isLast ? '¡Terminar!' : 'Continuar';
    if (!revealed) return isImmediateMcSlide ? 'Continuar' : 'Verificar';
    return isLast ? '¡Terminar!' : 'Continuar';
  }, [slide, revealed, isLast, isImmediateMcSlide]);

  // Derive answer feedback for the bottom panel (replaces inline hintBox/explanationBox)
  const slideFeedback = useMemo(() => {
    if (!revealed || !slide || !isInteractiveByType(slide)) return null;
    const answer = answers[currentIdx];
    if (!answer) return null;
    const slideItype = effectiveInteractionType(slide);
    let text: string | null = null;
    let correctOrderItems: string[] | undefined;
    switch (slideItype) {
      case 'multiple_choice': {
        if (answer.correct) {
          const raw = slide.explanation ?? null;
          text = raw ? 'Exacto. ' + raw : null;
        } else {
          const raw = slide.wrongExplanation ?? null;
          text = raw ? 'Casi. ' + raw : null;
        }
        break;
      }
      case 'fill_blank': {
        if (answer.correct) {
          const raw = slide.blankExplanation ?? null;
          text = raw ? 'Exacto. ' + raw : null;
        } else {
          const raw = slide.wrongExplanation ?? null;
          text = raw ? 'Casi. ' + raw : null;
        }
        break;
      }
      case 'match_pairs':
        text = slide.pairsExplanation ?? null;
        break;
      case 'classify':
        text = slide.classifyExplanation ?? null;
        break;
      case 'order_steps': {
        const steps = slide.steps ?? [];
        const correctSeq = !answer.correct
          ? (slide.correctOrder ?? []).map(i => steps[i]).filter(Boolean)
          : [];
        text = slide.orderExplanation ?? null;
        correctOrderItems = correctSeq.length > 0 ? correctSeq : undefined;
        break;
      }
    }
    return { isCorrect: answer.correct, text, correctOrderItems };
  }, [revealed, slide, answers, currentIdx]);

  // ── Advance to next slide ──────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (currentIdx >= dynamicSlides.length - 1) { router.back(); return; }
    setCurrentIdx(idx => idx + 1);
  }, [currentIdx, dynamicSlides.length, router]);

  // ── MC/fill_blank: evaluate immediately on option tap (Duolingo-style) ───────
  const handleMcTap = useCallback((letter: string) => {
    if (revealed || !slide || !isInteractiveByType(slide)) return;
    const slideItype = effectiveInteractionType(slide);
    if (slideItype !== 'multiple_choice' && slideItype !== 'fill_blank') return;

    setMcBlocked(true);  // block all options instantly
    setMcSelection(letter);

    const correct = slideItype === 'multiple_choice'
      ? letter === slide.correctAnswer
      : letter === slide.blankAnswer;

    setAnswers(prev => ({ ...prev, [currentIdx]: { value: letter, correct } }));

    // Delay feedback: let animations breathe (correct=350ms, wrong=80ms)
    const delay = correct ? 350 : 80;
    setTimeout(() => setShowFeedback(true), delay);

    if (correct) {
      const elapsed     = Date.now() - slideStartTime.current;
      const speedBonus  = elapsed < 6000 ? 5 : 0;
      const newStreak   = streak + 1;
      setStreak(newStreak);
      setBestStreak(prev => Math.max(prev, newStreak));
      const streakBonus = newStreak >= 3 ? 5 : 0;
      triggerXpFloat(xpForSlide(slide) + streakBonus + speedBonus);
      if (speedBonus > 0) triggerSpeedBonus();
      triggerSuccessMsg(pickRandom(SUCCESS_MSGS, lastSuccessIdx));
    } else {
      if (streak >= 2) triggerComboLost();
      setStreak(0);
      setEnergy(prev => Math.max(0, prev - 1));
      showEnergyMsg(pickRandom(WRONG_MSGS, lastWrongIdx), false);
    }

    if (!correct && slide.conceptIndex >= 0 && session) {
      const remaining = retriesLeft[slide.conceptIndex] ?? 0;
      const retryArr  = session.retrySlides?.[String(slide.conceptIndex)];
      if (remaining > 0 && retryArr && retryArr.length > 0) {
        const pickIdx    = retryArr.length - remaining;
        const retrySlide = shuffleSlideChoices({
          ...retryArr[Math.min(pickIdx, retryArr.length - 1)],
          isRetry: true,
        } as DesafioSlide);
        setDynamicSlides(prev => [
          ...prev.slice(0, currentIdx + 1),
          retrySlide,
          ...prev.slice(currentIdx + 1),
        ]);
        setRetriesLeft(prev => ({ ...prev, [slide.conceptIndex]: remaining - 1 }));
      }
    }
  }, [
    revealed, slide, currentIdx, streak, session, retriesLeft,
    triggerXpFloat, triggerComboLost, showEnergyMsg, triggerSpeedBonus, triggerSuccessMsg,
  ]);

  // ── CTA press handler (non-MC types + advance after reveal) ──────────────
  const handleCta = useCallback(() => {
    if (!slide) return;
    if (!isInteractiveByType(slide)) { advance(); return; }
    if (revealed) { advance(); return; }
    // MC/fill_blank are handled by handleMcTap — CTA only reaches here for other types
    if (itype === 'multiple_choice' || itype === 'fill_blank') return;

    // Evaluate non-immediate interaction types
    let value: SlideAnswer['value'] = '';
    let correct = false;

    switch (itype) {
      case 'match_pairs':
        value   = { ...pairsMatched };
        correct = (slide.pairs ?? []).every(p => pairsMatched[p.id] === p.id + '_r');
        break;
      case 'classify':
        value   = { ...classifyAssigned };
        correct = (slide.classifyItems ?? []).every(item => classifyAssigned[item.id] === item.category);
        break;
      case 'order_steps':
        value   = [...stepsOrder];
        correct = stepsOrder.length === (slide.correctOrder ?? []).length &&
                  stepsOrder.every((v, i) => v === slide.correctOrder![i]);
        break;
    }

    setAnswers(prev => ({ ...prev, [currentIdx]: { value, correct } }));
    setShowFeedback(true); // immediate reveal for non-MC types

    if (correct && slide) {
      const elapsed     = Date.now() - slideStartTime.current;
      const speedBonus  = elapsed < 6000 ? 5 : 0;
      const newStreak   = streak + 1;
      setStreak(newStreak);
      setBestStreak(prev => Math.max(prev, newStreak));
      const streakBonus = newStreak >= 3 ? 5 : 0;
      triggerXpFloat(xpForSlide(slide) + streakBonus + speedBonus);
      if (speedBonus > 0) triggerSpeedBonus();
      triggerSuccessMsg(pickRandom(SUCCESS_MSGS, lastSuccessIdx));
    } else if (!correct) {
      if (streak >= 2) triggerComboLost();
      setStreak(0);
      setEnergy(prev => Math.max(0, prev - 1));
      showEnergyMsg(pickRandom(WRONG_MSGS, lastWrongIdx), false);
    }

    if (!correct && slide.conceptIndex >= 0 && session) {
      const remaining = retriesLeft[slide.conceptIndex] ?? 0;
      const retryArr  = session.retrySlides?.[String(slide.conceptIndex)];
      if (remaining > 0 && retryArr && retryArr.length > 0) {
        const pickIdx    = retryArr.length - remaining;
        const retrySlide = shuffleSlideChoices({
          ...retryArr[Math.min(pickIdx, retryArr.length - 1)],
          isRetry: true,
        } as DesafioSlide);
        setDynamicSlides(prev => [
          ...prev.slice(0, currentIdx + 1),
          retrySlide,
          ...prev.slice(currentIdx + 1),
        ]);
        setRetriesLeft(prev => ({ ...prev, [slide.conceptIndex]: remaining - 1 }));
      }
    }
  }, [
    slide, revealed, itype, advance,
    pairsMatched, classifyAssigned, stepsOrder,
    currentIdx, session, retriesLeft,
    streak, triggerXpFloat, triggerComboLost, showEnergyMsg, triggerSpeedBonus, triggerSuccessMsg,
  ]);

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

  if (!session || dynamicSlides.length === 0) {
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

  // ── Desafío cover screen ───────────────────────────────────────────────────
  if (showCover) {
    const coverConcepts = (() => {
      const seen = new Set<string>();
      const names: string[] = [];
      for (const s of session.slides) {
        if (s.type === 'insight' && (s as any).title) {
          const t = String((s as any).title).trim();
          if (t && !seen.has(t)) { seen.add(t); names.push(t); }
        }
        if (names.length === 3) break;
      }
      return names;
    })();
    const interactive = dynamicSlides.filter(isInteractiveByType).length;
    const estimatedMin = Math.max(5, Math.round(interactive * 0.75));
    const estimatedXp  = interactive * 15;

    return (
      <SafeAreaView style={g.screen} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.crema} />
        <View style={g.topBar}>
          <Pressable onPress={() => router.back()} style={g.iconBtn} hitSlop={10}>
            <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <Text style={g.screenTitle}>⚔️ Desafío</Text>
          <Pressable onPress={() => router.back()} style={g.iconBtn} hitSlop={10}>
            <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={cvr.scroll} showsVerticalScrollIndicator={false}>
          <View style={cvr.card}>
            <View style={cvr.grad}>
              <View style={cvr.badge}><Text style={cvr.badgeText}>⚔️ DESAFÍO</Text></View>
              <Text style={cvr.emoji}>🎯</Text>
              <Text style={cvr.title}>{session.topic}</Text>
              {coverConcepts.length > 0 && (
                <View style={cvr.learnBlock}>
                  <Text style={cvr.learnLabel}>Qué evaluarás</Text>
                  {coverConcepts.map((t, i) => (
                    <View key={i} style={cvr.learnRow}>
                      <Text style={cvr.learnBullet}>✓</Text>
                      <Text style={cvr.learnText} numberOfLines={1}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={cvr.metaRow}>
                <View style={cvr.metaChip}>
                  <Text style={cvr.metaChipText}>⏱ {estimatedMin} min</Text>
                </View>
                <View style={[cvr.metaChip, cvr.metaChipXp]}>
                  <Text style={[cvr.metaChipText, { color: palette.charcoal }]}>⚡ +{estimatedXp} XP</Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
        <Pressable style={cvr.cta} onPress={() => setShowCover(false)}>
          <Text style={cvr.ctaText}>¡Comenzar! →</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const desafioProgress = dynamicSlides.length > 0
    ? (currentIdx + 1) / dynamicSlides.length
    : 0;

  // ── Main render — 3 stable SafeAreaView direct children ───────────────────
  return (
    <SafeAreaView style={g.screen} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.crema} />

      {/* Stable child 1 — top bar + progress bar (wrapped so child count stays stable) */}
      <View>
        <View style={g.topBar}>
          <Pressable onPress={() => router.back()} style={g.iconBtn} hitSlop={10}>
            <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <Text style={g.screenTitle}>⚔️ Desafío</Text>
          <Pressable onPress={() => router.back()} style={g.iconBtn} hitSlop={10}>
            <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
        </View>
        <UnifiedProgressBar progress={desafioProgress} showCurrentMode={false} />

        {/* Stats bar — 🧠 Energy · 🔥 Streak · ⚡ XP */}
        <View style={g.statsBar}>
          <View style={g.statItem}>
            <View style={g.energyRow}>
              {[0, 1, 2].map(i => (
                <Text key={i} style={[g.energyBrain, i >= energy && g.energyBrainLost]}>🧠</Text>
              ))}
            </View>
          </View>
          <View style={g.statDivider} />
          <View style={g.statItem}>
            {comboLostVisible ? (
              <Animated.View style={comboLostStyle}>
                <Text style={g.comboLostText}>Combo perdido</Text>
              </Animated.View>
            ) : streak >= 2 ? (
              <View style={g.streakRow}>
                <Text style={g.statEmoji}>🔥</Text>
                <Text style={g.streakText}>
                  x{streak}{streak >= 4 ? ' Imparable' : ''}
                </Text>
              </View>
            ) : (
              <View style={g.streakRow}>
                <Text style={g.statEmoji}>🔥</Text>
                <Text style={g.statValueDim}>—</Text>
              </View>
            )}
          </View>
          <View style={g.statDivider} />
          <View style={g.statItem}>
            <Text style={g.statEmoji}>⚡</Text>
            <Text style={g.statValue}>{totalXP} XP</Text>
          </View>
        </View>

        {/* Success message — floats below stats bar over the scroll content */}
        {successMsg !== null && (
          <Animated.View style={[g.successMsgBadge, successMsgStyle]} pointerEvents="none">
            <Text style={g.successMsgText}>{successMsg}</Text>
          </Animated.View>
        )}
      </View>

      {/* Stable child 2 — slide content; key forces remount on advance */}
      <ScrollView
        key={currentIdx}
        style={g.scrollArea}
        contentContainerStyle={g.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {slide.type === 'mastery_screen' ? (
          <MasteryContent
            slide={slide}
            totalXP={totalXP}
            answers={answers}
            dynamicSlides={dynamicSlides}
            bestStreak={bestStreak}
          />
        ) : (
          <SlideContent
            slide={slide}
            mcSelection={mcSelection}
            onMcSelect={handleMcTap}
            mcBlocked={mcBlocked}
            pairsSelectedLeft={pairsSelectedLeft}
            onPairsSelectLeft={setPairsSelectedLeft}
            pairsMatched={pairsMatched}
            onPairsMatch={setPairsMatched}
            classifyAssigned={classifyAssigned}
            onClassifyAssign={setClassifyAssigned}
            stepsOrder={stepsOrder}
            onStepsReorder={setStepsOrder}
            answer={answers[currentIdx]}
          />
        )}
      </ScrollView>

      {/* Stable child 3 — CTA footer (matches Misión / Quiz / Tarjetas pattern) */}
      <View style={[g.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {/* Speed bonus badge — top: -80, quick flash on correct < 6s */}
        {speedBonusVisible && (
          <Animated.View style={[g.speedBadge, speedBonusStyle]} pointerEvents="none">
            <Text style={g.speedBadgeText}>⚡ Rápido!</Text>
          </Animated.View>
        )}
        {/* XP float — absolutely positioned above the button, pointerEvents ignored */}
        {xpDisplay !== null && (
          <Animated.View style={[g.xpBadge, xpFloatStyle]} pointerEvents="none">
            <Text style={g.xpBadgeText}>+{xpDisplay} XP</Text>
          </Animated.View>
        )}
        {/* Energy message — inline, just above the feedback panel */}
        {energyMsg !== null && (
          <Animated.View
            style={[
              g.energyMsgBadge,
              energyMsg.recovery ? g.energyMsgBadgeOk : g.energyMsgBadgeWarn,
              energyMsgStyle,
            ]}
            pointerEvents="none"
          >
            <Text style={[g.energyMsgText, energyMsg.recovery ? g.energyMsgTextOk : g.energyMsgTextWarn]}>
              {energyMsg.text}
            </Text>
          </Animated.View>
        )}
        {/* Feedback panel — slide-up + fade-in after answer animations complete */}
        {showFeedback && slideFeedback && (
          <Animated.View style={feedbackAnimStyle}>
            <View style={[g.feedbackPanel, slideFeedback.isCorrect ? g.feedbackPanelOk : g.feedbackPanelWrong]}>
              <Text style={[g.feedbackLabel, slideFeedback.isCorrect ? g.feedbackLabelOk : g.feedbackLabelWrong]}>
                {slideFeedback.isCorrect ? '✓ ¡Correcto!' : '✗ Incorrecto'}
              </Text>
              {slideFeedback.text != null && (
                <Text style={[g.feedbackText, slideFeedback.isCorrect ? g.feedbackTextOk : g.feedbackTextWrong]}>
                  {slideFeedback.text}
                </Text>
              )}
              {slideFeedback.correctOrderItems && (
                <>
                  <Text style={[g.feedbackOrderTitle, g.feedbackOrderTitleWrong]}>ORDEN CORRECTO</Text>
                  {slideFeedback.correctOrderItems.map((t, i) => (
                    <Text key={i} style={[g.feedbackOrderItem, g.feedbackOrderItemWrong]}>{i + 1}. {t}</Text>
                  ))}
                </>
              )}
            </View>
          </Animated.View>
        )}
        {/* CTA: hidden for MC until feedback shows; always visible for other types */}
        {isImmediateMcSlide && !showFeedback ? (
          <View style={g.ctaBtnOff}>
            <Text style={g.ctaTextOff}>Selecciona una opción</Text>
          </View>
        ) : ctaDisabled ? (
          <View style={g.ctaBtnOff}>
            <Text style={g.ctaTextOff}>{ctaLabel}</Text>
          </View>
        ) : (
          <Pressable onPress={handleCta} style={{ width: '100%' }}>
            <View style={g.ctaBtn}>
              <Text style={g.ctaText}>{ctaLabel}</Text>
            </View>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Global styles ─────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: palette.crema },
  scrollArea:   { flex: 1 },
  scrollContent:{ flexGrow: 1 },

  // ── Header — matches session.tsx g.topBar / g.iconBtn / g.screenTitle ────
  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  iconBtn:     { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.blanco, borderWidth: 1, borderColor: palette.bordeClaro, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: semantic.textPrimary, letterSpacing: -0.2 },

  // ── Bottom — matches session.tsx g.bottom / g.ctaBtn / g.ctaText ─────────
  bottom:      { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.bordeClaro, backgroundColor: palette.crema },
  ctaBtn:      { paddingVertical: 20, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.morado },
  ctaText:     { ...Typography.challengeCTA, color: palette.blanco },
  ctaBtnOff:   { paddingVertical: 17, borderRadius: 18, alignItems: 'center', backgroundColor: palette.crema },
  ctaTextOff:  { ...Typography.challengeCTA, color: palette.grisMedio },

  // ── XP float badge ───────────────────────────────────────────────────────
  xpBadge: {
    position: 'absolute', top: -44, alignSelf: 'center',
    backgroundColor: palette.morado, borderRadius: 100,
    paddingHorizontal: 16, paddingVertical: 7,
    shadowColor: palette.morado, shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 8,
  },
  xpBadgeText: { ...Typography.challengeFloatingXP, color: palette.blanco },

  // ── Stats bar ─────────────────────────────────────────────────────────────
  statsBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: palette.crema },
  statItem:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  statDivider:  { width: 1, height: 16, backgroundColor: palette.bordeClaro },
  statEmoji:    { fontSize: 14 },
  statValue:    { ...Typography.challengeXP, color: semantic.textPrimary },
  statValueDim: { ...Typography.challengeStreak, color: palette.grisMedio },
  streakRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakText:   { ...Typography.challengeStreak, color: '#F97316' },
  comboLostText:{ fontSize: 11, fontWeight: '700', color: palette.rojoError },

  // ── Energy ────────────────────────────────────────────────────────────────
  energyRow:         { flexDirection: 'row', gap: 2, alignItems: 'center' },
  energyBrain:       { fontSize: 16 },
  energyBrainLost:   { opacity: 0.2 },
  successMsgBadge: {
    position: 'absolute', bottom: -24, alignSelf: 'center',
    backgroundColor: palette.morado, borderRadius: 100,
    paddingHorizontal: 20, paddingVertical: 8,
    shadowColor: palette.morado, shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 7,
    zIndex: 10,
  },
  successMsgText: { ...Typography.challengeMicroCelebration, color: palette.blanco },

  speedBadge: {
    position: 'absolute', top: -80, alignSelf: 'center',
    backgroundColor: '#FEFCE8', borderRadius: 100,
    borderWidth: 1, borderColor: '#FCD34D',
    paddingHorizontal: 14, paddingVertical: 6,
    shadowColor: '#F59E0B', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 6,
  },
  speedBadgeText: { ...Typography.challengeMicroCelebration, color: '#92400E' },

  energyMsgBadge: {
    alignSelf: 'center',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7,
    marginBottom: 8,
    shadowOpacity: 0.15, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, elevation: 6,
  },
  energyMsgBadgeWarn:{ backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FB923C', shadowColor: '#F97316' },
  energyMsgBadgeOk:  { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: palette.verde, shadowColor: palette.verde },
  energyMsgText:     { fontSize: 13, fontWeight: '700', textAlign: 'center' as const },
  energyMsgTextWarn: { color: '#9A3412' },
  energyMsgTextOk:   { color: '#166534' },

  // ── Feedback panel ────────────────────────────────────────────────────────
  feedbackPanel:          { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, borderWidth: 1 },
  feedbackPanelOk:        { backgroundColor: '#F0FDF7', borderColor: palette.verde + '44' },
  feedbackPanelWrong:     { backgroundColor: palette.rojoErrorBg, borderColor: palette.rojoError + '44' },
  feedbackLabel:          { ...Typography.challengeSectionLabel, marginBottom: 4 },
  feedbackLabelOk:        { color: palette.verde },
  feedbackLabelWrong:     { color: palette.rojoError },
  feedbackText:           { ...Typography.challengeExplanation },
  feedbackTextOk:         { color: '#166534' },
  feedbackTextWrong:      { color: palette.rojoErrorDark },
  feedbackOrderTitle:     { fontSize: 11, fontWeight: '700', marginTop: 8, marginBottom: 4, letterSpacing: 1 },
  feedbackOrderTitleWrong:{ color: palette.rojoError },
  feedbackOrderItem:      { fontSize: 12, lineHeight: 18 },
  feedbackOrderItemWrong: { color: palette.rojoErrorDark },

  // ── Loading / error ───────────────────────────────────────────────────────
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { fontSize: 16, color: palette.grisMedio },
  errorText:   { fontSize: 16, color: palette.charcoal, textAlign: 'center', marginBottom: 24 },
  backBtn:     { backgroundColor: palette.morado, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { fontSize: 15, fontWeight: '700', color: palette.blanco },
});

// ── Mastery screen styles ─────────────────────────────────────────────────────

const ms = StyleSheet.create({
  root: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 32, alignItems: 'center' },

  emoji:   { fontSize: 52, marginBottom: 10 },
  heading: { fontSize: 22, fontWeight: '800', color: palette.charcoal, textAlign: 'center', lineHeight: 30, marginBottom: 24 },

  xpHero: {
    backgroundColor: palette.morado, borderRadius: 24,
    paddingHorizontal: 32, paddingVertical: 14, marginBottom: 24,
    shadowColor: palette.morado, shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 8,
  },
  xpHeroText: { ...Typography.challengeRewardXP, color: palette.blanco },

  statsRow: {
    flexDirection: 'row', width: '100%',
    backgroundColor: palette.blanco, borderRadius: 16,
    borderWidth: 1, borderColor: palette.bordeClaro, marginBottom: 20, overflow: 'hidden',
  },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  statSep:  { width: 1, backgroundColor: palette.bordeClaro },
  statVal:  { ...Typography.challengeRewardStats, color: palette.charcoal, marginBottom: 4 },
  statLbl:  { fontSize: 12, fontWeight: '600', color: palette.grisMedio, letterSpacing: 0.3 },

  section:      { width: '100%', marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: palette.charcoal, marginBottom: 10 },

  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:     { backgroundColor: palette.moradoBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { ...Typography.challengeConceptChip, color: palette.morado },

  nemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  nemPct:    { fontSize: 13, fontWeight: '700', color: palette.morado },
  nemTrack: {
    width: '100%', height: 8, borderRadius: 4,
    backgroundColor: palette.moradoBg, marginBottom: 8, overflow: 'hidden',
  },
  nemFill: { height: '100%', borderRadius: 4, backgroundColor: palette.morado },
  nemSub:  { fontSize: 12, fontWeight: '600', color: palette.grisMedio },
});

// ── Cover screen styles (mirrors session.tsx sum.mission* exactly) ────────────
const cvr = StyleSheet.create({
  scroll:       { flexGrow: 1, padding: 16, justifyContent: 'center' },
  card:         { borderRadius: 28, overflow: 'hidden' },
  grad:         { borderRadius: 28, paddingVertical: 26, paddingHorizontal: 22, alignItems: 'center', backgroundColor: palette.morado },
  badge:        { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100, paddingVertical: 5, paddingHorizontal: 16, marginBottom: 14 },
  badgeText:    { color: palette.blanco, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  emoji:        { fontSize: 54, marginBottom: 10 },
  title:        { fontSize: 22, fontWeight: '900', color: palette.blanco, textAlign: 'center', letterSpacing: -0.5, lineHeight: 30, marginBottom: 14 },
  learnBlock:   { alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 12, marginBottom: 14, gap: 6 },
  learnLabel:   { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  learnRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  learnBullet:  { fontSize: 13, color: palette.limaElectrica, fontWeight: '900', lineHeight: 20 },
  learnText:    { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600', lineHeight: 20 },
  metaRow:      { flexDirection: 'row', gap: 8 },
  metaChip:     { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 100, paddingVertical: 5, paddingHorizontal: 12 },
  metaChipText: { fontSize: 12, color: palette.blanco, fontWeight: '700' },
  metaChipXp:   { backgroundColor: palette.limaElectrica },
  cta:          { margin: 16, borderRadius: 16, backgroundColor: palette.morado, paddingVertical: 16, alignItems: 'center' },
  ctaText:      { fontSize: 17, fontWeight: '900', color: palette.blanco, letterSpacing: -0.3 },
});
