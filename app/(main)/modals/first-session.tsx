import { SHOW_GEMS } from '@/config/features';
import { palette, paletteExtras, semantic } from '@/theme/colors';
import { getDemoSession, type DemoQuestion, type DemoSession } from '@/constants/demoSessions';
import { useOnboarding } from '@/contexts/OnboardingContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  ArrowRight, BookOpen, BookText, Brain, Calculator, Camera,
  Check, Dna, Flame, FlaskConical, Languages,
  Loader, Scroll, Target, Trophy, X, Zap,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue,
  withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');
const SM = SCREEN_H < 740;

const BG    = palette.crema;
const BRAND = palette.azul;
const LIME  = palette.verdeXP;

const COMPLETED_KEY = 'nemup_first_session_completed';
const PROGRESS_KEY  = 'nemup_first_session_progress';

type Phase = 'loading' | 'intro' | 'answering' | 'answered' | 'result';
interface SavedProgress { qIndex: number; correctCount: number; xpEarned: number; lives: number; streak: number }

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const SUBJECT_ICON_MAP: [string, LucideIcon][] = [
  ['matemática', Calculator],
  ['física',     Zap],
  ['química',    FlaskConical],
  ['biología',   Dna],
  ['historia',   Scroll],
  ['lengua',     BookText],
  ['inglés',     Languages],
  ['filosofía',  Brain],
];

function SubjectIcon({ subject, size, color }: { subject: string; size: number; color: string }) {
  const k    = subject?.toLowerCase() ?? '';
  const Icon = SUBJECT_ICON_MAP.find(([key]) => k.includes(key))?.[1] ?? BookOpen;
  return <Icon size={size} color={color} strokeWidth={1.4} />;
}

// ─── Animated count-up ────────────────────────────────────────────────────────
function AnimatedNumber({ to, delay = 0, style }: { to: number; delay?: number; style?: any }) {
  const progress = useSharedValue(0);
  const [displayed, setDisplayed] = useState(0);
  useAnimatedReaction(
    () => Math.round(progress.value * to),
    (cur, prev) => { if (cur !== prev) runOnJS(setDisplayed)(cur); }
  );
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }));
  }, []);
  return <Text style={style}>{displayed}</Text>;
}

// ─── Pill progress bar ────────────────────────────────────────────────────────
function PillBar({ filled, total, color }: { filled: number; total: number; color: string }) {
  const count  = Math.min(total, 20);
  const active = Math.round((filled / Math.max(total, 1)) * count);
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2,
          backgroundColor: i < active ? color : palette.bordeClaro }} />
      ))}
    </View>
  );
}

// ─── Burst confetti (correct answer) ─────────────────────────────────────────
const BURST_COLORS = [LIME, palette.azul, palette.rosaQuiz, paletteExtras.cieloAzul, palette.ambar, palette.tealTarjetas];
const BURST_ANGLES = [0, 55, 110, 165, 220, 275, 30, 85, 140, 195, 250, 305];

function BurstParticle({ i }: { i: number }) {
  const angle = (BURST_ANGLES[i % 12] * Math.PI) / 180;
  const r  = 52 + (i * 11) % 36;
  const tx = Math.cos(angle) * r;
  const ty = Math.sin(angle) * r - 16;
  const sz = 5 + (i % 4) * 2;
  const op  = useSharedValue(0);
  const trX = useSharedValue(0);
  const trY = useSharedValue(0);
  useEffect(() => {
    const d = i * 32;
    op.value  = withDelay(d, withSequence(withTiming(1, { duration: 70 }), withDelay(480, withTiming(0, { duration: 320 }))));
    trX.value = withDelay(d, withTiming(tx, { duration: 860, easing: Easing.out(Easing.cubic) }));
    trY.value = withDelay(d, withTiming(ty, { duration: 860, easing: Easing.out(Easing.cubic) }));
  }, []);
  const aStyle = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateX: trX.value }, { translateY: trY.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: '50%', left: '50%', width: sz, height: sz, borderRadius: sz / 2,
        backgroundColor: BURST_COLORS[i % 6], marginLeft: -sz / 2, marginTop: -sz / 2 }, aStyle]}
    />
  );
}
function ConfettiBurst({ count = 10 }: { count?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => <BurstParticle key={i} i={i} />)}
    </View>
  );
}

// ─── Falling confetti (result screen) ────────────────────────────────────────
const FALL_CONF = [
  { left: '4%',   color: LIME,               size: 9,  dur: 1800, delay: 0   },
  { left: '16%',  color: palette.rosaQuiz,       size: 7,  dur: 2200, delay: 180 },
  { left: '28%',  color: paletteExtras.cieloAzul, size: 10, dur: 2000, delay: 80  },
  { left: '42%',  color: LIME,               size: 6,  dur: 2400, delay: 320 },
  { left: '55%',  color: palette.azul,         size: 8,  dur: 1900, delay: 120 },
  { left: '67%',  color: palette.ambar,          size: 7,  dur: 2300, delay: 260 },
  { left: '79%',  color: palette.rosaQuiz,       size: 9,  dur: 2100, delay: 400 },
  { left: '91%',  color: paletteExtras.cieloAzul, size: 6,  dur: 2500, delay: 50  },
] as const;

function FallingPiece({ c }: { c: typeof FALL_CONF[number] }) {
  const y  = useSharedValue(-20);
  const op = useSharedValue(0);
  useEffect(() => {
    op.value = withDelay(c.delay, withTiming(1, { duration: 80 }));
    y.value  = withDelay(c.delay, withTiming(SCREEN_H * 0.55, { duration: c.dur, easing: Easing.in(Easing.quad) }));
  }, []);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: op.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, left: c.left as any, width: c.size, height: c.size,
        borderRadius: c.size / 2, backgroundColor: c.color, zIndex: 10 }, aStyle]}
    />
  );
}

// ─── Quiz option (light theme + animations) ───────────────────────────────────
function QuizOption({ opt, selected, revealed, isCorrectOpt, onPress }: {
  opt: { id: string; text: string };
  selected: boolean; revealed: boolean; isCorrectOpt: boolean; onPress: () => void;
}) {
  const scale      = useSharedValue(1);
  const shakeX     = useSharedValue(0);
  const checkScale = useSharedValue(0);

  useEffect(() => {
    if (revealed && selected && !isCorrectOpt) {
      shakeX.value = withSequence(
        withTiming(-10, { duration: 55 }), withTiming(10,  { duration: 55 }),
        withTiming(-6,  { duration: 55 }), withTiming(6,   { duration: 55 }),
        withTiming(0,   { duration: 55 })
      );
    }
    if (revealed && isCorrectOpt) {
      checkScale.value = withSequence(
        withSpring(1.4, { mass: 0.3, stiffness: 550, damping: 9 }),
        withSpring(1,   { mass: 0.3, stiffness: 300, damping: 18 })
      );
    }
  }, [revealed]);

  const handlePress = () => {
    if (revealed) return;
    scale.value = withSequence(
      withTiming(0.95, { duration: 75 }),
      withSpring(1.03, { mass: 0.3, stiffness: 480, damping: 13 }),
      withSpring(1,    { mass: 0.3, stiffness: 300, damping: 20 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  const isWrong     = revealed && selected && !isCorrectOpt;
  const dimmed      = revealed && !selected && !isCorrectOpt;
  const borderColor = revealed
    ? (isCorrectOpt ? BRAND : isWrong ? palette.bordeMedio : palette.bordeClaro)
    : (selected ? BRAND : palette.bordeClaro);
  const bgColor     = revealed
    ? (isCorrectOpt ? 'rgba(22,119,242,0.04)' : palette.blanco)
    : (selected ? palette.azulClaro : palette.blanco);
  const letterBg    = revealed
    ? (isCorrectOpt ? BRAND : isWrong ? palette.bordeMedio : palette.crema)
    : (selected ? BRAND : palette.crema);
  const letterColor = ((revealed && isCorrectOpt) || (!revealed && selected)) ? palette.blanco : semantic.textPrimary;

  const optStyle   = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: shakeX.value }],
    opacity: dimmed ? 0.4 : 1,
  }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));

  return (
    <Animated.View style={optStyle}>
      <Pressable onPress={handlePress} disabled={revealed} style={{ borderRadius: 14 }}>
        <View style={[styles.option, { borderColor, backgroundColor: bgColor }]}>
          <View style={[styles.optLetter, { backgroundColor: letterBg }]}>
            <Text style={[styles.optLetterText, { color: letterColor }]}>{opt.id}</Text>
          </View>
          <Text style={[styles.optText,
            revealed && isCorrectOpt && { color: BRAND, fontWeight: '700' },
            revealed && isWrong      && { color: semantic.textTertiary, fontWeight: '700' },
          ]}>
            {opt.text}
          </Text>
          {revealed && isCorrectOpt && (
            <Animated.View style={checkStyle}>
              <Check size={16} color={BRAND} strokeWidth={2.5} />
            </Animated.View>
          )}
          {revealed && isWrong && <X size={16} color={palette.bordeMedio} strokeWidth={2.5} />}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function FirstSessionScreen() {
  const { state } = useOnboarding();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();

  const session = useMemo<DemoSession>(() => {
    const subjectId = state.data.subjects[0] ?? 'general';
    return getDemoSession(subjectId);
  }, []);

  const [phase,        setPhase]        = useState<Phase>('loading');
  const [qIndex,       setQIndex]       = useState(0);
  const [selected,     setSelected]     = useState<string | null>(null);
  const [isCorrect,    setIsCorrect]    = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [xpEarned,     setXpEarned]     = useState(0);
  const [lives,        setLives]        = useState(3);
  const [streak,       setStreak]       = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(COMPLETED_KEY).then(done => {
      if (done === 'true') { router.replace('/home'); return; }
      AsyncStorage.getItem(PROGRESS_KEY).then(raw => {
        if (raw) {
          const p: SavedProgress = JSON.parse(raw);
          setQIndex(p.qIndex); setCorrectCount(p.correctCount);
          setXpEarned(p.xpEarned); setLives(p.lives); setStreak(p.streak);
          setPhase('answering');
        } else {
          setPhase('intro');
        }
      });
    });
  }, []);

  useEffect(() => {
    if (phase === 'answering') {
      AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify({ qIndex, correctCount, xpEarned, lives, streak }));
    }
  }, [phase, qIndex]);

  const handleOptionSelect = (optId: string) => {
    if (phase !== 'answering' || !session) return;
    const q = session.questions[qIndex];
    const correct = optId === q.correctOptionId;
    const gained  = correct ? (qIndex === 0 ? 30 : 10) : 0;

    setSelected(optId);
    setIsCorrect(correct);
    if (correct) {
      setStreak(s => s + 1);
      setCorrectCount(c => c + 1);
      setXpEarned(xp => xp + gained);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      setStreak(0);
      setLives(l => Math.max(0, l - 1));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setPhase('answered');
  };

  const handleContinue = () => {
    if (qIndex < session.questions.length - 1) {
      setQIndex(i => i + 1);
      setSelected(null);
      setPhase('answering');
    } else {
      AsyncStorage.setItem(COMPLETED_KEY, 'true');
      AsyncStorage.removeItem(PROGRESS_KEY);
      setPhase('result');
    }
  };

  const question = session?.questions[qIndex];

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={40} color={palette.azul} strokeWidth={1.8} />
      </View>
    );
  }

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <ScrollView
          contentContainerStyle={[styles.introPad, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introEmojiWrap}>
            <SubjectIcon subject={session.subjectName} size={SM ? 72 : 88} color={palette.azul} />
          </View>

          <Text style={styles.introTitle}>
            Entrena con{' '}
            <Text style={{ color: palette.azul }}>{session.subjectName}</Text>
            {' '}— siente cómo funciona NemUp.
          </Text>

          <View style={[styles.introTopicCard, { backgroundColor: BRAND }]}>
            <View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60,
              backgroundColor: 'rgba(255,255,255,0.1)', top: -40, right: -30 }} />
            <Text style={styles.introTopicLabel}>TEMA DE HOY</Text>
            <Text style={styles.introTopic}>{session.topic}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={styles.introChip}><Text style={styles.introChipText}>3 preguntas</Text></View>
              <View style={styles.introChip}><Text style={styles.introChipText}>~2 min</Text></View>
            </View>
          </View>

          <Text style={styles.introSub}>
            Después podrás subir tus propios apuntes y NemUp generará sesiones personalizadas con tu material.
          </Text>

          <Pressable onPress={() => setPhase('answering')}>
            <View style={[styles.ctaBtn, { backgroundColor: BRAND }]}>
              <Text style={styles.ctaBtnText}>¡Vamos!</Text>
              <ArrowRight size={18} color={palette.blanco} strokeWidth={2.5} />
            </View>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  if (phase === 'result') {
    const accuracy = Math.round((correctCount / session.questions.length) * 100);
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor={palette.azul} />
        <View style={{ flex: 1, backgroundColor: palette.azul }}>
          {FALL_CONF.map((c, i) => <FallingPiece key={i} c={c} />)}
          <SafeAreaView style={[styles.resultSafe, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.trophyWrap}>
              <Trophy size={SM ? 56 : 72} color={LIME} strokeWidth={1.5} />
            </View>
            <Text style={styles.resultTitle}>
              ¡Sesión{' '}<Text style={{ color: LIME }}>completada!</Text>
            </Text>
            <Text style={styles.resultSub}>Terminaste el entrenamiento demo de {session.subjectName}</Text>

            <View style={styles.statsRow}>
              {[
                { to: xpEarned,                        label: 'XP ganados', delay: 280 },
                ...(SHOW_GEMS ? [{ to: Math.round(xpEarned / 5), label: 'Gemas', delay: 380 }] : []),
                { to: accuracy,                        label: '% Aciertos', delay: 480 },
              ].map(({ to, label, delay }) => (
                <View key={label} style={styles.statBox}>
                  <AnimatedNumber to={to} delay={delay} style={styles.statValue} />
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.nextCard}>
              <View style={styles.nextCardTitleRow}>
                <Target size={15} color={LIME} strokeWidth={2} />
                <Text style={styles.nextCardTitle}>Próximo paso</Text>
              </View>
              <Text style={styles.nextCardBody}>
                Sube tus apuntes de{' '}
                <Text style={{ color: LIME, fontWeight: '800' }}>{session.subjectName}</Text>
                {' '}y NemUp generará sesiones con tu material.
              </Text>
              <View style={styles.nextCardSubRow}>
                <Zap size={12} color="rgba(255,255,255,0.45)" strokeWidth={2} />
                <Text style={styles.nextCardSub}>Las sesiones con tus apuntes valen el doble de XP</Text>
              </View>
            </View>

            <View style={{ gap: 10, width: '100%' }}>
              <Pressable onPress={() => router.replace('/modals/upload' as any)}>
                <View style={[styles.ctaBtn, { backgroundColor: BRAND }]}>
                  <Camera size={18} color={palette.blanco} strokeWidth={2} />
                  <Text style={styles.ctaBtnText}>Subir mis apuntes</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => router.replace('/home')} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>Explorar la app</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
    );
  }

  // ── Quiz (answering / answered) ────────────────────────────────────────────
  const revealed = phase === 'answered';

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Stats chip bar — matches session.tsx */}
        <View style={styles.statsBar}>
          <View style={styles.chip}>
            <Text style={{ fontSize: 16 }}>🔥</Text>
            <Text style={styles.chipVal}>{streak}</Text>
            <Text style={styles.chipLbl}>racha</Text>
          </View>
          <View style={[styles.chip, { flex: 1.6, gap: 6 }]}>
            <PillBar filled={qIndex + (revealed ? 1 : 0)} total={session.questions.length} color={BRAND} />
            <Text style={styles.chipCounter}>{qIndex + 1}/{session.questions.length}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={{ fontSize: 16 }}>⚡</Text>
            <Text style={styles.chipVal}>{xpEarned}</Text>
            <Text style={styles.chipLbl}>XP</Text>
          </View>
        </View>

        {/* Lives row */}
        <View style={styles.livesRow}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Text key={i} style={{ fontSize: 16, opacity: i < lives ? 1 : 0.2 }}>❤️</Text>
          ))}
        </View>

        <ScrollView contentContainerStyle={[styles.quizScroll, { paddingBottom: 8 }]} showsVerticalScrollIndicator={false}>
          {/* Question card */}
          <View style={styles.questionCard}>
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Text style={styles.questionChip}>🧠 Pregunta {qIndex + 1}</Text>
            </View>
            <Text style={styles.questionText}>{question?.text}</Text>
          </View>

          {/* Options */}
          <View style={{ gap: 8, marginBottom: 10, position: 'relative' }}>
            {question?.options.map(opt => (
              <QuizOption
                key={opt.id}
                opt={opt}
                selected={selected === opt.id}
                revealed={revealed}
                isCorrectOpt={opt.id === question.correctOptionId}
                onPress={() => handleOptionSelect(opt.id)}
              />
            ))}
            {revealed && isCorrect && <ConfettiBurst count={10} />}
          </View>

          {/* Feedback strip — compact, NemUp-branded */}
          {revealed && question?.explanation ? (
            <View style={[styles.feedbackCallout, {
              borderLeftColor: isCorrect ? BRAND : palette.bordeMedio,
              backgroundColor: isCorrect ? 'rgba(22,119,242,0.04)' : palette.crema,
            }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.feedbackTitle}>
                  {isCorrect ? '🎉 ¡Correcto!' : '💪 Casi'}
                </Text>
                {isCorrect && (
                  <View style={{ backgroundColor: BRAND, borderRadius: 100, paddingVertical: 2, paddingHorizontal: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: palette.blanco }}>+{qIndex === 0 ? 30 : 10} XP</Text>
                  </View>
                )}
              </View>
              <Text style={styles.feedbackText} numberOfLines={2}>{question.explanation}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* CTA — always BRAND/NEON */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          {revealed ? (
            <Pressable onPress={handleContinue} style={{ width: '100%' }}>
              <View style={[styles.nextBtn, { backgroundColor: BRAND }]}>
                <Text style={styles.nextBtnText}>
                  {qIndex < session.questions.length - 1
                    ? (isCorrect ? '⚡ Siguiente' : '🚀 Continuar')
                    : '🏆 Ver mis resultados'}
                </Text>
              </View>
            </Pressable>
          ) : (
            <View style={[styles.nextBtn, { backgroundColor: palette.bordeClaro }]}>
              <Text style={{ color: semantic.textTertiary, fontWeight: '700', fontSize: 15 }}>Selecciona una respuesta</Text>
            </View>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Intro
  introPad:        { padding: 24, paddingTop: SM ? 20 : 32, gap: 20 },
  introEmojiWrap:  { alignItems: 'center' },
  introTitle:      { fontSize: SM ? 20 : 23, fontWeight: '800', color: semantic.textPrimary, textAlign: 'center', lineHeight: SM ? 28 : 32 },
  introTopicCard:  { borderRadius: 22, padding: 22, overflow: 'hidden' },
  introTopicLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.6, marginBottom: 6 },
  introTopic:      { fontSize: SM ? 17 : 19, fontWeight: '800', color: palette.blanco, lineHeight: SM ? 24 : 28 },
  introChip:       { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10 },
  introChipText:   { color: palette.blanco, fontSize: 11, fontWeight: '600' },
  introSub:        { fontSize: SM ? 12 : 13, color: semantic.textTertiary, textAlign: 'center', lineHeight: 19 },
  ctaBtn:          { paddingVertical: 17, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  ctaBtnText:      { fontSize: 16, fontWeight: '800', color: palette.blanco },

  // Stats chip bar
  statsBar:    { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.blanco, borderRadius: 12, borderWidth: 1, borderColor: palette.bordeClaro, paddingHorizontal: 10, paddingVertical: 6 },
  chipVal:     { fontSize: 15, fontWeight: '900', color: semantic.textPrimary },
  chipLbl:     { fontSize: 10, color: semantic.textTertiary, fontWeight: '600' },
  chipCounter: { fontSize: 11, fontWeight: '700', color: semantic.textTertiary, marginLeft: 4, flexShrink: 0 },

  // Lives row
  livesRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, marginBottom: 2 },

  // Quiz content
  quizScroll:    { paddingHorizontal: 16, paddingTop: 6 },
  questionCard:  { backgroundColor: palette.blanco, borderRadius: 20, padding: SM ? 14 : 16, marginBottom: 10 },
  questionChip:  { fontSize: 10, fontWeight: '800', color: palette.azul, letterSpacing: 0.4, backgroundColor: 'rgba(22,119,242,0.08)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 100 },
  questionText:  { fontSize: SM ? 16 : 18, fontWeight: '800', color: semantic.textPrimary, lineHeight: SM ? 24 : 27, letterSpacing: -0.2 },

  // Options
  option:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 16, borderWidth: 2, backgroundColor: palette.blanco },
  optLetter:     { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optLetterText: { fontSize: 13, fontWeight: '800' },
  optText:       { flex: 1, fontSize: 14, color: semantic.textPrimary, fontWeight: '600', lineHeight: 20 },

  // Feedback strip
  feedbackCallout: { borderRadius: 14, borderLeftWidth: 3, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8 },
  feedbackTitle:   { fontSize: 13, fontWeight: '800', color: semantic.textPrimary },
  feedbackText:    { fontSize: 12, color: semantic.textPrimary, lineHeight: 18 },

  // Bottom bar
  bottomBar:   { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.bordeClaro, backgroundColor: BG },
  nextBtn:     { borderRadius: 18, paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { color: palette.blanco, fontWeight: '800', fontSize: 16 },

  // Result
  resultSafe:       { flex: 1, paddingHorizontal: 24, paddingTop: SM ? 16 : 24, gap: SM ? 16 : 20, alignItems: 'center', justifyContent: 'center' },
  trophyWrap:       { alignItems: 'center' },
  resultTitle:      { fontSize: SM ? 24 : 28, fontWeight: '900', color: palette.blanco, textAlign: 'center' },
  resultSub:        { fontSize: SM ? 12 : 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },
  statsRow:         { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: SM ? 14 : 16, width: '100%' },
  statBox:          { flex: 1, alignItems: 'center', gap: 4 },
  statValue:        { fontSize: SM ? 22 : 26, fontWeight: '900', color: LIME },
  statLabel:        { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  nextCard:         { borderRadius: 16, borderWidth: 1.5, borderColor: LIME + '50', padding: 14, overflow: 'hidden', gap: 6, width: '100%' },
  nextCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextCardTitle:    { fontSize: SM ? 13 : 14, fontWeight: '900', color: LIME },
  nextCardBody:     { fontSize: SM ? 12 : 13, color: 'rgba(255,255,255,0.8)', lineHeight: SM ? 18 : 20 },
  nextCardSubRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nextCardSub:      { fontSize: 11, color: 'rgba(255,255,255,0.45)', flex: 1 },
  ghostBtn:         { alignItems: 'center', paddingVertical: 14, width: '100%' },
  ghostBtnText:     { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.45)' },
});
