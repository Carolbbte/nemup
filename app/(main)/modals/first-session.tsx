import { Colors } from '@/constants/Colors';
import { getDemoSession, type DemoQuestion, type DemoSession } from '@/constants/demoSessions';
import { useOnboarding } from '@/contexts/OnboardingContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');
const SM = SCREEN_H < 740;

const BG          = '#F7F8FC';
const PURPLE_HDR  = '#4A35CC';
const NEON        = '#7C5AFF';
const LIME        = '#C4F852';
const CORRECT_CLR = '#2D7D52';

const COMPLETED_KEY = 'nemup_first_session_completed';
const PROGRESS_KEY  = 'nemup_first_session_progress';

type Phase = 'loading' | 'intro' | 'answering' | 'answered' | 'result';
interface SavedProgress { qIndex: number; correctCount: number; xpEarned: number; lives: number; streak: number }

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
function PillProgress({ filled, total }: { filled: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', flex: 1, gap: 4, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: 3,
          backgroundColor: i < filled ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.22)' }} />
      ))}
    </View>
  );
}

// ─── Burst confetti (correct answer) ─────────────────────────────────────────
const BURST_COLORS = [LIME, Colors.brand, '#FF5B9F', '#5BC8FF', '#FFB547', '#00C2A8'];
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
  { left: '4%',   color: LIME,          size: 9,  dur: 1800, delay: 0   },
  { left: '16%',  color: '#FF5B9F',     size: 7,  dur: 2200, delay: 180 },
  { left: '28%',  color: '#5BC8FF',     size: 10, dur: 2000, delay: 80  },
  { left: '42%',  color: LIME,          size: 6,  dur: 2400, delay: 320 },
  { left: '55%',  color: Colors.brand,  size: 8,  dur: 1900, delay: 120 },
  { left: '67%',  color: '#FFB547',     size: 7,  dur: 2300, delay: 260 },
  { left: '79%',  color: '#FF5B9F',     size: 9,  dur: 2100, delay: 400 },
  { left: '91%',  color: '#5BC8FF',     size: 6,  dur: 2500, delay: 50  },
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
    ? (isCorrectOpt ? CORRECT_CLR : isWrong ? Colors.rose : Colors.line)
    : (selected ? Colors.brand : Colors.line);
  const bgColor     = revealed
    ? (isCorrectOpt ? 'rgba(45,125,82,0.08)' : isWrong ? 'rgba(255,77,109,0.08)' : 'white')
    : (selected ? Colors.brandSoft : 'white');
  const letterBg    = revealed
    ? (isCorrectOpt ? CORRECT_CLR : isWrong ? Colors.rose : Colors.bgSoft)
    : (selected ? Colors.brand : Colors.bgSoft);
  const letterColor = ((revealed && (isCorrectOpt || isWrong)) || (!revealed && selected)) ? 'white' : Colors.ink;

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
            revealed && isCorrectOpt && { color: '#1A5C3A', fontWeight: '700' },
            revealed && isWrong      && { color: '#B91C30', fontWeight: '700' },
          ]}>
            {opt.text}
          </Text>
          {revealed && isCorrectOpt && <Animated.Text style={[{ fontSize: 16 }, checkStyle]}>✓</Animated.Text>}
          {revealed && isWrong      && <Text style={{ fontSize: 16 }}>✕</Text>}
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
        <Text style={{ fontSize: 32 }}>⏳</Text>
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
            <Text style={styles.introEmoji}>{session.subjectEmoji}</Text>
          </View>

          <Text style={styles.introTitle}>
            Entrena con{' '}
            <Text style={{ color: Colors.brand }}>{session.subjectName}</Text>
            {' '}— siente cómo funciona NemUp.
          </Text>

          <LinearGradient
            colors={[Colors.brand, NEON]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.introTopicCard}
          >
            <View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60,
              backgroundColor: 'rgba(255,255,255,0.1)', top: -40, right: -30 }} />
            <Text style={styles.introTopicLabel}>TEMA DE HOY</Text>
            <Text style={styles.introTopic}>{session.topic}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={styles.introChip}><Text style={styles.introChipText}>3 preguntas</Text></View>
              <View style={styles.introChip}><Text style={styles.introChipText}>~2 min</Text></View>
            </View>
          </LinearGradient>

          <Text style={styles.introSub}>
            Después podrás subir tus propios apuntes y NemUp generará sesiones personalizadas con tu material 📚
          </Text>

          <Pressable onPress={() => setPhase('answering')}>
            <LinearGradient
              colors={[Colors.brand, NEON]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              <Text style={styles.ctaBtnText}>¡Vamos! →</Text>
            </LinearGradient>
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
        <StatusBar barStyle="light-content" backgroundColor={Colors.brand} />
        <LinearGradient colors={[Colors.brand, Colors.accent]} style={{ flex: 1 }}>
          {FALL_CONF.map((c, i) => <FallingPiece key={i} c={c} />)}
          <SafeAreaView style={[styles.resultSafe, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.trophyEmoji}>🏆</Text>
            <Text style={styles.resultTitle}>
              ¡Sesión{' '}<Text style={{ color: LIME }}>completada!</Text>
            </Text>
            <Text style={styles.resultSub}>Terminaste el entrenamiento demo de {session.subjectName}</Text>

            <View style={styles.statsRow}>
              {[
                { to: xpEarned, label: 'XP ganados', delay: 280 },
                { to: Math.round(xpEarned / 5), label: '💎 Gemas', delay: 380 },
                { to: accuracy, label: '% Aciertos', delay: 480 },
              ].map(({ to, label, delay }) => (
                <View key={label} style={styles.statBox}>
                  <AnimatedNumber to={to} delay={delay} style={styles.statValue} />
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.nextCard}>
              <LinearGradient colors={[LIME + '1A', LIME + '06']} style={StyleSheet.absoluteFill} />
              <Text style={styles.nextCardTitle}>🎯 Próximo paso</Text>
              <Text style={styles.nextCardBody}>
                Sube tus apuntes de{' '}
                <Text style={{ color: LIME, fontWeight: '800' }}>{session.subjectName}</Text>
                {' '}y NemUp generará sesiones con tu material.
              </Text>
              <Text style={styles.nextCardSub}>⚡ Las sesiones con tus apuntes valen el doble de XP</Text>
            </View>

            <View style={{ gap: 10, width: '100%' }}>
              <Pressable onPress={() => router.replace('/modals/upload' as any)}>
                <LinearGradient
                  colors={[LIME, '#A8E020']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[styles.ctaBtn, { borderRadius: 18 }]}
                >
                  <Text style={[styles.ctaBtnText, { color: Colors.ink }]}>📸 Subir mis apuntes</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={() => router.replace('/home')} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>Explorar la app</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </View>
    );
  }

  // ── Quiz (answering / answered) ────────────────────────────────────────────
  const revealed = phase === 'answered';

  return (
    <View style={{ flex: 1, backgroundColor: PURPLE_HDR }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Purple header — identical to real session */}
        <View style={{ backgroundColor: PURPLE_HDR, paddingHorizontal: 16, paddingBottom: 14 }}>
          <View style={styles.headerRow}>
            <View style={{ width: 32 }} />
            <Text style={styles.headerTitle}>Quiz</Text>
            <View style={{ width: 32 }} />
          </View>
          <View style={styles.progressRow}>
            <PillProgress filled={qIndex + 1} total={session.questions.length} />
            <Text style={styles.counter}>{qIndex + 1}/{session.questions.length}</Text>
          </View>
        </View>

        {/* White content area */}
        <View style={{ flex: 1, backgroundColor: BG }}>

          {/* Stats row — 🔥 streak | ⚡ XP */}
          <View style={styles.quizStats}>
            <View style={styles.quizStatBox}>
              <Text style={{ fontSize: 20 }}>🔥</Text>
              <View>
                <Text style={styles.quizStatVal}>{streak}</Text>
                <Text style={styles.quizStatLbl}>Racha</Text>
              </View>
            </View>
            <View style={styles.quizStatBox}>
              <Text style={{ fontSize: 20 }}>⚡</Text>
              <View>
                <Text style={styles.quizStatVal}>{xpEarned}</Text>
                <Text style={styles.quizStatLbl}>XP</Text>
              </View>
            </View>
          </View>

          <ScrollView contentContainerStyle={[styles.quizScroll, { paddingBottom: 8 }]} showsVerticalScrollIndicator={false}>
            {/* Source chip */}
            <View style={styles.sourceChip}>
              <Text style={styles.sourceChipText}>📖 Apunte demo · Pág. {question?.sourcePage}</Text>
            </View>

            {/* Question */}
            <Text style={styles.questionText}>{question?.text}</Text>

            {/* Options */}
            <View style={{ gap: 10, marginBottom: 12, position: 'relative' }}>
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
              {/* Burst confetti on correct answer */}
              {revealed && isCorrect && <ConfettiBurst count={10} />}
            </View>

            {/* Inline feedback — same as real session */}
            {revealed && question?.explanation ? (
              <View style={[styles.feedbackCallout, {
                borderLeftColor: isCorrect ? CORRECT_CLR : Colors.rose,
                backgroundColor: isCorrect ? 'rgba(45,125,82,0.06)' : 'rgba(255,77,109,0.06)',
              }]}>
                <Text style={[styles.feedbackTitle, { color: isCorrect ? CORRECT_CLR : Colors.rose }]}>
                  {isCorrect ? `¡Excelente! +${qIndex === 0 ? 30 : 10} XP` : 'Casi'}
                </Text>
                <Text style={styles.feedbackText}>{question.explanation}</Text>
                {question.sourceQuote ? (
                  <Text style={styles.feedbackSource} numberOfLines={2}>
                    📖 "{question.sourceQuote.slice(0, 90)}{question.sourceQuote.length > 90 ? '…' : ''}"
                  </Text>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          {/* Bottom bar — 💡 | Siguiente | 🚩 */}
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable style={styles.sideBtn}><Text style={{ fontSize: 20 }}>💡</Text></Pressable>
            {revealed ? (
              <Pressable onPress={handleContinue} style={{ flex: 1 }}>
                <LinearGradient
                  colors={isCorrect ? [CORRECT_CLR, '#1A5C3A'] : [Colors.rose, '#C0132A']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.nextBtn}
                >
                  <Text style={styles.nextBtnText}>
                    {qIndex < session.questions.length - 1 ? 'Siguiente' : 'Ver mis resultados →'}
                  </Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <View style={[styles.nextBtn, { flex: 1, backgroundColor: Colors.line }]}>
                <Text style={{ color: Colors.muted, fontWeight: '700', fontSize: 15 }}>Selecciona</Text>
              </View>
            )}
            <Pressable style={styles.sideBtn}><Text style={{ fontSize: 20 }}>🚩</Text></Pressable>
          </View>

        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Intro
  introPad:       { padding: 24, paddingTop: SM ? 20 : 32, gap: 20 },
  introEmojiWrap: { alignItems: 'center' },
  introEmoji:     { fontSize: SM ? 68 : 84, textAlign: 'center' },
  introTitle:     { fontSize: SM ? 20 : 23, fontWeight: '800', color: Colors.ink, textAlign: 'center', lineHeight: SM ? 28 : 32 },
  introTopicCard: { borderRadius: 22, padding: 22, overflow: 'hidden' },
  introTopicLabel:{ fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.6, marginBottom: 6 },
  introTopic:     { fontSize: SM ? 17 : 19, fontWeight: '800', color: 'white', lineHeight: SM ? 24 : 28 },
  introChip:      { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10 },
  introChipText:  { color: 'white', fontSize: 11, fontWeight: '600' },
  introSub:       { fontSize: SM ? 12 : 13, color: Colors.muted, textAlign: 'center', lineHeight: 19 },
  ctaBtn:         { paddingVertical: 16, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText:     { fontSize: 16, fontWeight: '800', color: 'white' },

  // Quiz header
  headerRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  headerTitle:{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: 'white', letterSpacing: -0.2 },
  progressRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  counter:    { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)', minWidth: 36, textAlign: 'right' },

  // Quiz stats
  quizStats:   { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  quizStatBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, paddingHorizontal: 14, paddingVertical: 10 },
  quizStatVal: { fontSize: 18, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5 },
  quizStatLbl: { fontSize: 10, color: Colors.muted, fontWeight: '600' },

  // Quiz content
  quizScroll:     { paddingHorizontal: 16, paddingTop: 4 },
  sourceChip:     { alignSelf: 'flex-start', backgroundColor: 'rgba(91,61,245,0.07)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(91,61,245,0.18)', paddingVertical: 4, paddingHorizontal: 10, marginBottom: 14 },
  sourceChipText: { fontSize: 11, fontWeight: '700', color: Colors.brand },
  questionText:   { fontSize: SM ? 16 : 19, fontWeight: '800', color: Colors.ink, lineHeight: SM ? 22 : 26, letterSpacing: -0.3, marginBottom: 18 },

  // Options
  option:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 2, backgroundColor: 'white' },
  optLetter:     { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optLetterText: { fontSize: 12, fontWeight: '800' },
  optText:       { flex: 1, fontSize: 14, color: Colors.ink, fontWeight: '600', lineHeight: 20 },

  // Feedback callout
  feedbackCallout:{ borderRadius: 14, borderLeftWidth: 3, padding: 14, marginTop: 4, marginBottom: 4 },
  feedbackTitle:  { fontSize: 12, fontWeight: '800', marginBottom: 4, letterSpacing: 0.2 },
  feedbackText:   { fontSize: 14, color: Colors.ink2, lineHeight: 21, marginBottom: 6 },
  feedbackSource: { fontSize: 11, color: Colors.muted, fontStyle: 'italic', lineHeight: 16 },

  // Bottom bar
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: BG },
  sideBtn:   { width: 44, height: 44, borderRadius: 22, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  nextBtn:   { borderRadius: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },

  // Result
  resultSafe:    { flex: 1, paddingHorizontal: 24, paddingTop: SM ? 16 : 24, gap: SM ? 16 : 20, alignItems: 'center', justifyContent: 'center' },
  trophyEmoji:   { fontSize: SM ? 64 : 80 },
  resultTitle:   { fontSize: SM ? 24 : 28, fontWeight: '900', color: 'white', textAlign: 'center' },
  resultSub:     { fontSize: SM ? 12 : 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },
  statsRow:      { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: SM ? 14 : 16, width: '100%' },
  statBox:       { flex: 1, alignItems: 'center', gap: 4 },
  statValue:     { fontSize: SM ? 22 : 26, fontWeight: '900', color: LIME },
  statLabel:     { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  nextCard:      { borderRadius: 16, borderWidth: 1.5, borderColor: LIME + '50', padding: 14, overflow: 'hidden', gap: 6, width: '100%' },
  nextCardTitle: { fontSize: SM ? 13 : 14, fontWeight: '900', color: LIME },
  nextCardBody:  { fontSize: SM ? 12 : 13, color: 'rgba(255,255,255,0.8)', lineHeight: SM ? 18 : 20 },
  nextCardSub:   { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
  ghostBtn:      { alignItems: 'center', paddingVertical: 14, width: '100%' },
  ghostBtnText:  { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.45)' },
});
