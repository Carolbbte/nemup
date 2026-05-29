import { Colors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  RefreshCw,
  RotateCcw,
  X,
  Zap,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SM    = SCREEN_H < 740;
const BG    = '#F8F9FC';
const BRAND = '#5B3DF5';
const NEON  = '#7C5AFF';
const LIME  = '#C4F852';

// ── Types ─────────────────────────────────────────────────────────
type Option  = { id: string; text: string };
type Question = { id: string; text: string; options: Option[]; correctOptionId: string; explanation: string; sourceQuote: string };
type Flashcard = { id: string; front: string; back: string };
type SummarySlideType = 'concept' | 'key_fact' | 'important' | 'remember' | 'example' | 'curiosity' | 'wow_fact';
type BackendSlide = { type: SummarySlideType; emoji: string; title: string; definition: string; example: string };
type LegacySection = { heading: string; content: string; keyPoints: string[] };
type Session = {
  subject: string; topic: string; estimatedDuration: number; difficulty: string;
  xpReward: number; gemReward: number; questions: Question[]; flashcards: Flashcard[];
  summary: { title: string; slides?: BackendSlide[]; sections?: LegacySection[] };
};
type Phase     = 'lobby' | 'mode-select' | 'summary' | 'quiz' | 'flashcards' | 'celebration' | 'complete';
type QuizStep  = 'answering' | 'correct' | 'wrong';

// ── Constants ─────────────────────────────────────────────────────
const LETTERS        = ['A', 'B', 'C', 'D', 'E'];
const MAX_LIVES      = 3;
const XP_PER_CORRECT = 15;
const XP_PER_SUMMARY = 20;
const XP_PER_CARD    = 5;

const SUBJECT_EMOJI: [string, string][] = [
  ['biolog', '🧬'], ['matemát', '📐'], ['matemat', '📐'],
  ['histor', '🌎'], ['físic', '⚡'],   ['fisic', '⚡'],
  ['químic', '🧪'], ['quimic', '🧪'], ['lenguaj', '📝'],
  ['inglés', '🗣️'], ['ingles', '🗣️'], ['economí', '📈'],
  ['economi', '📈'], ['psicolog', '🧠'], ['geograf', '🗺️'],
  ['filosofí', '🤔'], ['filosof', '🤔'],
];
function getSubjectEmoji(subject: string) {
  const k = (subject ?? '').toLowerCase();
  return SUBJECT_EMOJI.find(([key]) => k.includes(key))?.[1] ?? '📚';
}

// ── Confetti ──────────────────────────────────────────────────────
const CONFETTI_DATA = [
  { left: '8%',  bg: LIME,      size: 9,  dur: 2800, delay: 0,    zig: 8 },
  { left: '18%', bg: '#FF5B9F', size: 7,  dur: 3100, delay: 300,  zig: -10, r: 4 },
  { left: '30%', bg: '#5BC8FF', size: 10, dur: 2600, delay: 700,  zig: 12 },
  { left: '42%', bg: LIME,      size: 6,  dur: 3500, delay: 150,  zig: -8, r: 3 },
  { left: '55%', bg: '#FFB547', size: 9,  dur: 2900, delay: 500,  zig: 6 },
  { left: '66%', bg: NEON,      size: 7,  dur: 3200, delay: 900,  zig: -12, r: 4 },
  { left: '76%', bg: '#FF5B9F', size: 8,  dur: 2700, delay: 250,  zig: 10, r: 4 },
  { left: '86%', bg: LIME,      size: 6,  dur: 3400, delay: 600,  zig: -6, r: 3 },
  { left: '22%', bg: '#5BC8FF', size: 8,  dur: 3000, delay: 400,  zig: 8, r: 4 },
  { left: '48%', bg: '#FFB547', size: 7,  dur: 2500, delay: 800,  zig: -10 },
  { left: '90%', bg: LIME,      size: 9,  dur: 3300, delay: 100,  zig: 6 },
  { left: '60%', bg: '#5BC8FF', size: 6,  dur: 2800, delay: 1100, zig: -8, r: 3 },
] as const;
type CItem = (typeof CONFETTI_DATA)[number];

function ConfettiPiece({ item }: { item: CItem }) {
  const ty = useSharedValue(-20);
  const tx = useSharedValue(0);
  const rot = useSharedValue(0);
  useEffect(() => {
    ty.value  = withDelay(item.delay, withRepeat(withTiming(SCREEN_H + 40, { duration: item.dur, easing: Easing.linear }), -1, false));
    tx.value  = withDelay(item.delay, withRepeat(withSequence(
      withTiming(item.zig,            { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
      withTiming(-item.zig,           { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
      withTiming(item.zig * 0.6,      { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
      withTiming(0,                   { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
    ), -1, false));
    rot.value = withDelay(item.delay, withRepeat(withTiming(720, { duration: item.dur, easing: Easing.linear }), -1, false));
  }, []);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotateZ: rot.value + 'deg' }],
  }));
  return (
    <Animated.View style={[
      { position: 'absolute', top: -20, width: item.size, height: item.size,
        backgroundColor: item.bg, borderRadius: 'r' in item ? (item as any).r : 2,
        left: item.left as any },
      anim,
    ]} />
  );
}

// ── Pill progress bar ─────────────────────────────────────────────
function PillBar({ filled, total, color }: { filled: number; total: number; color: string }) {
  const count  = Math.min(total, 20);
  const active = Math.round((filled / Math.max(total, 1)) * count);
  return (
    <View style={{ flexDirection: 'row', flex: 1, gap: 3 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: 3,
          backgroundColor: i < active ? color : 'rgba(0,0,0,0.08)' }} />
      ))}
    </View>
  );
}

// ── Flip card ─────────────────────────────────────────────────────
function FlipCard({ front, back, onFlip }: { front: string; back: string; onFlip?: (f: boolean) => void }) {
  const flip    = useSharedValue(0);
  const flipped = useRef(false);

  const frontStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flip.value, [0, 0.45, 0.55, 1], [1, 0, 0, 0]),
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flip.value, [0, 0.45, 0.55, 1], [0, 0, 1, 1]),
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));

  const handlePress = () => {
    const target = flipped.current ? 0 : 1;
    flipped.current = !flipped.current;
    flip.value = withSpring(target, { damping: 16, stiffness: 130 });
    onFlip?.(flipped.current);
  };

  return (
    <Pressable onPress={handlePress} style={fcd.container}>
      <Animated.View style={[fcd.face, fcd.front, frontStyle]}>
        <Text style={fcd.label}>CONCEPTO</Text>
        <Text style={fcd.frontText}>{front}</Text>
        <View style={fcd.hint}>
          <RotateCcw size={14} color={Colors.muted} strokeWidth={2} />
          <Text style={fcd.hintText}>Toca para voltear</Text>
        </View>
      </Animated.View>
      <Animated.View style={[fcd.face, fcd.back, backStyle]}>
        <Text style={[fcd.label, { color: BRAND }]}>EXPLICACIÓN</Text>
        <Text style={fcd.backText}>{back}</Text>
      </Animated.View>
    </Pressable>
  );
}
const fcd = StyleSheet.create({
  container: { flex: 1, marginHorizontal: 20, marginVertical: 12 },
  face: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 28, alignItems: 'center', justifyContent: 'center', padding: 28,
    shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12,
    shadowRadius: 24, elevation: 8, borderWidth: 1, borderColor: Colors.line,
  },
  front:     { backgroundColor: 'white' },
  back:      { backgroundColor: '#F0EDFF' },
  label:     { fontSize: 10, fontWeight: '800', color: Colors.muted, letterSpacing: 1.5, marginBottom: 24 },
  frontText: { fontSize: SM ? 26 : 32, fontWeight: '900', color: Colors.ink, textAlign: 'center', letterSpacing: -0.5, lineHeight: SM ? 34 : 42 },
  backText:  { fontSize: SM ? 15 : 17, color: Colors.ink2, textAlign: 'center', lineHeight: SM ? 24 : 28, fontWeight: '500' },
  hint:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 28 },
  hintText:  { fontSize: 12, color: Colors.muted, fontStyle: 'italic' },
});

// ── Summary slide style config ────────────────────────────────────
const SLIDE_STYLE: Record<string, { accent: string; bg: string; label: string }> = {
  key_fact:  { accent: '#5B3DF5', bg: 'rgba(91,61,245,0.08)',  label: '💡 Dato clave' },
  important: { accent: '#FF7A2B', bg: 'rgba(255,122,43,0.08)', label: '🔥 Importante' },
  remember:  { accent: '#00C2A8', bg: 'rgba(0,194,168,0.08)',  label: '🎯 Recuerda' },
  example:   { accent: '#3B82F6', bg: 'rgba(59,130,246,0.08)', label: '📘 Ejemplo' },
  curiosity: { accent: '#FFB547', bg: 'rgba(255,181,71,0.08)', label: '✨ Curiosidad' },
  wow_fact:  { accent: '#FF4D6D', bg: 'rgba(255,77,109,0.08)', label: '🤯 ¿Sabías que?' },
};

// ── Summary slide builder ─────────────────────────────────────────
type SummarySlide =
  | { type: SummarySlideType; emoji: string; title: string; definition: string; example: string }
  | { type: 'milestone'; emoji: string; message: string };

const MILESTONES = [
  { emoji: '🚀', message: '¡Vas muy bien! Sigue así.' },
  { emoji: '🔥', message: '¡Excelente ritmo! Imparable.' },
  { emoji: '🏆', message: '¡Ya casi terminas! Último tramo.' },
] as const;

// Inject celebration milestones every 4 content slides
function buildSummarySlides(backendSlides: BackendSlide[]): SummarySlide[] {
  const result: SummarySlide[] = [];
  let mileIdx = 0;
  for (let i = 0; i < backendSlides.length; i++) {
    result.push(backendSlides[i]);
    if ((i + 1) % 4 === 0 && mileIdx < MILESTONES.length) {
      result.push({ type: 'milestone', ...MILESTONES[mileIdx++] });
    }
  }
  return result.length ? result : [{ type: 'concept', emoji: '📚', title: 'Resumen', definition: '', example: '' }];
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function SessionPlayerScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { data } = useLocalSearchParams<{ data: string }>();
  const session: Session | null = data ? JSON.parse(data as string) : null;

  const [phase, setPhase]           = useState<Phase>('lobby');
  const [completedModes, setCompleted] = useState<Set<string>>(new Set());
  const [celebSrc, setCelebSrc]     = useState<'summary' | 'quiz' | 'flashcards'>('quiz');

  // Summary
  const [summaryIdx, setSummaryIdx] = useState(0);

  // Quiz
  const [quizIdx, setQuizIdx]             = useState(0);
  const [quizStep, setQuizStep]           = useState<QuizStep>('answering');
  const [selected, setSelected]           = useState<string | null>(null);
  const [lives, setLives]                 = useState(MAX_LIVES);
  const [xpEarned, setXpEarned]           = useState(0);
  const [correctCount, setCorrectCount]   = useState(0);
  const [streak, setStreak]               = useState(0);
  const [maxStreak, setMaxStreak]         = useState(0);
  const [quizDone, setQuizDone]           = useState(false);

  // Flashcards
  const [cardIdx, setCardIdx]       = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [cardsDone, setCardsDone]   = useState(false);

  // Summary slide animation (hooks must be unconditional)
  const touchStartX  = useRef(0);
  const slideX       = useSharedValue(0);
  const slideOpacity = useSharedValue(1);
  const slideStyle   = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: slideOpacity.value,
  }));
  useEffect(() => {
    if (phase !== 'summary') return;
    slideX.value = SCREEN_W * 0.12;
    slideOpacity.value = 0;
    slideX.value = withSpring(0, { damping: 22, stiffness: 220 });
    slideOpacity.value = withTiming(1, { duration: 240 });
  }, [summaryIdx, phase]);

  const questions     = session?.questions  ?? [];
  const flashcards    = session?.flashcards ?? [];
  const summarySlides: BackendSlide[] = session?.summary?.slides?.length
    ? session.summary.slides
    : (session?.summary?.sections ?? []).flatMap((sec) => {
        const out: BackendSlide[] = [];
        if (sec.content) out.push({ type: 'concept', emoji: '📚', title: sec.heading, definition: sec.content, example: '' });
        for (const kp of (sec.keyPoints ?? [])) {
          out.push({ type: 'key_fact', emoji: '💡', title: sec.heading, definition: kp, example: '' });
        }
        return out;
      });
  const question      = questions[quizIdx];
  const card          = flashcards[cardIdx];

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.muted }}>Sin datos de sesión.</Text>
      </View>
    );
  }

  const emoji = getSubjectEmoji(session.subject);

  // ── Helpers ────────────────────────────────────────────────────
  const completeMode = (mode: 'summary' | 'quiz' | 'flashcards') => {
    setCompleted(prev => new Set([...prev, mode]));
    setCelebSrc(mode);
    setPhase('celebration');
  };

  const resetQuiz = () => {
    setQuizIdx(0); setSelected(null); setQuizStep('answering');
    setCorrectCount(0); setLives(MAX_LIVES); setXpEarned(0);
    setStreak(0); setMaxStreak(0); setQuizDone(false);
  };

  const handleOption = (optId: string) => {
    if (quizStep !== 'answering') return;
    setSelected(optId);
    if (optId === question.correctOptionId) {
      setCorrectCount(c => c + 1);
      setXpEarned(x => x + XP_PER_CORRECT);
      const ns = streak + 1;
      setStreak(ns);
      setMaxStreak(m => Math.max(m, ns));
      setQuizStep('correct');
      Vibration.vibrate(50);
    } else {
      setLives(l => Math.max(0, l - 1));
      setStreak(0);
      setQuizStep('wrong');
    }
  };

  const handleQuizNext = () => {
    const next = quizIdx + 1;
    if (next >= questions.length) setQuizDone(true);
    else { setQuizIdx(next); setSelected(null); setQuizStep('answering'); }
  };

  const handleCardNext = () => {
    const next = cardIdx + 1;
    if (next >= flashcards.length) setCardsDone(true);
    else { setCardIdx(next); setCardFlipped(false); }
  };

  const finalAccuracy = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 100;

  // ══════════════════════════════════════════════════════════════
  // LOBBY — Screen 1
  // ══════════════════════════════════════════════════════════════
  if (phase === 'lobby') {
    const missions = [
      { key: 'summary',    label: '📖 Leer el resumen' },
      { key: 'quiz',       label: '🧠 Completar el quiz' },
      { key: 'flashcards', label: '🗂️ Repasar tarjetas' },
    ];
    const done = missions.filter(m => completedModes.has(m.key)).length;
    const pct  = Math.round((done / missions.length) * 100);

    return (
      <SafeAreaView style={g.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={g.topBar}>
          <Pressable onPress={() => router.back()} style={g.iconBtn} hitSlop={10}>
            <ArrowLeft size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={g.xpPill}>
            <Text style={{ fontSize: 12 }}>⚡</Text>
            <Text style={g.xpText}>+{session.xpReward} XP</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={[g.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <LinearGradient colors={[BRAND, '#8B5CF6', NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={lob.hero}>
            <View style={lob.glow1} /><View style={lob.glow2} />
            <Text style={lob.heroEmoji}>{emoji}</Text>
            <Text style={lob.heroSubject}>{(session.subject ?? '').toUpperCase()}</Text>
            <Text style={lob.heroTopic}>{session.topic}</Text>
            <View style={lob.chips}>
              <View style={lob.chip}>
                <Clock size={10} color="rgba(255,255,255,0.8)" strokeWidth={2} />
                <Text style={lob.chipText}>{session.estimatedDuration} min</Text>
              </View>
              <View style={lob.chip}>
                <BookOpen size={10} color="rgba(255,255,255,0.8)" strokeWidth={2} />
                <Text style={lob.chipText}>{questions.length} preguntas</Text>
              </View>
              <View style={lob.chip}>
                <Layers size={10} color="rgba(255,255,255,0.8)" strokeWidth={2} />
                <Text style={lob.chipText}>{flashcards.length} tarjetas</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Rewards */}
          <View style={lob.rewardsRow}>
            {[
              { emoji: '⚡', val: session.xpReward, lbl: 'XP', color: BRAND },
              { emoji: '💎', val: session.gemReward ?? 10, lbl: 'GEMAS', color: Colors.teal },
              { emoji: '📚', val: summarySlides.length, lbl: 'CONCEPTOS', color: Colors.amber },
            ].map(({ emoji: e, val, lbl, color }) => (
              <View key={lbl} style={lob.rewardCard}>
                <Text style={{ fontSize: SM ? 22 : 28 }}>{e}</Text>
                <Text style={[lob.rewardVal, { color }]}>{val}</Text>
                <Text style={lob.rewardLbl}>{lbl}</Text>
              </View>
            ))}
          </View>

          {/* Missions */}
          <View style={lob.missionCard}>
            <View style={lob.missionHead}>
              <Text style={lob.missionTitle}>🎯 Misiones del día</Text>
              <Text style={lob.missionPct}>{pct}%</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: Colors.line, marginBottom: 16, overflow: 'hidden' }}>
              <LinearGradient colors={[BRAND, NEON]} style={{ width: `${pct}%`, height: '100%', borderRadius: 3 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
            </View>
            {missions.map(m => {
              const isDone = completedModes.has(m.key);
              return (
                <View key={m.key} style={lob.missionRow}>
                  <View style={[lob.missionCheck, isDone && lob.missionCheckDone]}>
                    {isDone && <Check size={10} color="white" strokeWidth={3} />}
                  </View>
                  <Text style={[lob.missionLabel, isDone && lob.missionLabelDone]}>{m.label}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={[g.bottom, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={() => setPhase('mode-select')} style={{ width: '100%' }}>
            <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={g.ctaBtn}>
              <Text style={g.ctaText}>🚀 Comenzar</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // MODE SELECT — Screen 2
  // ══════════════════════════════════════════════════════════════
  if (phase === 'mode-select') {
    const modes = [
      { key: 'summary' as const,    emoji: '📖', title: 'Resumen',  desc: 'Lee y comprende los conceptos clave', detail: `${summarySlides.length} conceptos`, xp: XP_PER_SUMMARY * Math.max(summarySlides.length, 1), colors: [BRAND, '#8B5CF6'] as [string,string] },
      { key: 'quiz' as const,       emoji: '🧠', title: 'Quiz',     desc: 'Pon a prueba lo que aprendiste',      detail: `${questions.length} preguntas`, xp: XP_PER_CORRECT * Math.max(questions.length, 1), colors: ['#3B82F6', '#1D4ED8'] as [string,string] },
      { key: 'flashcards' as const, emoji: '🗂️', title: 'Tarjetas', desc: 'Memoriza con tarjetas interactivas',  detail: `${flashcards.length} tarjetas`, xp: XP_PER_CARD * Math.max(flashcards.length, 1), colors: ['#059669', '#047857'] as [string,string] },
    ];
    const goMode = (key: typeof modes[number]['key']) => {
      if (key === 'summary')    { setSummaryIdx(0); setPhase('summary'); }
      if (key === 'quiz')       { resetQuiz(); setPhase('quiz'); }
      if (key === 'flashcards') { setCardIdx(0); setCardFlipped(false); setCardsDone(false); setPhase('flashcards'); }
    };
    return (
      <SafeAreaView style={g.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={g.topBar}>
          <Pressable onPress={() => setPhase('lobby')} style={g.iconBtn} hitSlop={10}>
            <ChevronLeft size={18} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
          <Text style={g.screenTitle}>Modo de estudio</Text>
          <View style={{ width: 36 }} />
        </View>
        {/* Fixed header — no scroll */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <Text style={mds.heading}>¿Qué quieres hacer?</Text>
          <Text style={mds.sub}>Elige cómo quieres estudiar hoy</Text>
        </View>
        {/* Cards fill all remaining space */}
        <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 12, gap: 8 }}>
          {modes.map(m => {
            const isDone = completedModes.has(m.key);
            return (
              <Pressable key={m.key} onPress={() => goMode(m.key)} style={{ flex: 1 }}
                android_ripple={{ color: 'rgba(0,0,0,0.08)' }}>
                {({ pressed }) => (
                  <LinearGradient colors={m.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={[mds.gradient, pressed && { opacity: 0.92 }]}>
                    {isDone && (
                      <View style={mds.doneBadge}>
                        <Check size={10} color={m.colors[0]} strokeWidth={3} />
                        <Text style={[mds.doneBadgeText, { color: m.colors[0] }]}>Completado</Text>
                      </View>
                    )}
                    <View style={mds.cardTop}>
                      <Text style={mds.cardEmoji}>{m.emoji}</Text>
                      <View style={mds.xpBadge}>
                        <Text style={mds.xpBadgeText}>+{m.xp} XP</Text>
                      </View>
                    </View>
                    <Text style={mds.cardTitle}>{m.title}</Text>
                    <Text style={mds.cardDesc}>{m.desc}</Text>
                    <View style={mds.cardFoot}>
                      <Text style={mds.cardDetail}>{m.detail}</Text>
                      <View style={mds.arrow}>
                        <ChevronRight size={16} color="white" strokeWidth={2.5} />
                      </View>
                    </View>
                  </LinearGradient>
                )}
              </Pressable>
            );
          })}
          {/* Tip banner — always visible at bottom */}
          <View style={mds.tip}>
            <Text style={{ fontSize: 16 }}>⭐</Text>
            <Text style={mds.tipText}>Completa los 3 modos para ganar el máximo XP</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // SUMMARY — Screen 3 (story slides, NO SCROLL)
  // ══════════════════════════════════════════════════════════════
  if (phase === 'summary') {
    const slides = buildSummarySlides(summarySlides);
    const slide  = slides[summaryIdx];
    const isLast = summaryIdx >= slides.length - 1;

    const goNext = () => {
      Vibration.vibrate(18);
      slideX.value       = withTiming(-SCREEN_W * 0.15, { duration: 180 }, (done) => {
        if (done) runOnJS(setSummaryIdx)(summaryIdx + 1);
      });
      slideOpacity.value = withTiming(0, { duration: 180 });
    };
    const goPrev = () => {
      Vibration.vibrate(10);
      slideX.value       = withTiming(SCREEN_W * 0.15, { duration: 180 }, (done) => {
        if (done) runOnJS(setSummaryIdx)(summaryIdx - 1);
      });
      slideOpacity.value = withTiming(0, { duration: 180 });
    };

    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Story bar */}
          <View style={sum.storyBar}>
            {slides.map((_, i) => (
              <View key={i} style={sum.storySeg}>
                <View style={[sum.storyFill, { width: i <= summaryIdx ? '100%' : '0%' }]} />
              </View>
            ))}
          </View>

          {/* Header */}
          <View style={g.topBar}>
            <Pressable
              onPress={() => summaryIdx > 0 ? goPrev() : setPhase('mode-select')}
              style={g.iconBtn} hitSlop={10}
            >
              <ChevronLeft size={18} color={Colors.ink} strokeWidth={2.5} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={g.screenTitle}>🧠 Resumen</Text>
              <Text style={sum.slideCounter}>Concepto {summaryIdx + 1} de {slides.length}</Text>
            </View>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <X size={16} color={Colors.ink} strokeWidth={2.5} />
            </Pressable>
          </View>

          {/* Slide — no scroll, swipe gesture */}
          <Animated.View
            style={[sum.slideArea, slideStyle]}
            onTouchStart={(e) => { touchStartX.current = e.nativeEvent.pageX; }}
            onTouchEnd={(e) => {
              const dx = e.nativeEvent.pageX - touchStartX.current;
              if (dx < -40 && !isLast) goNext();
              if (dx > 40 && summaryIdx > 0) goPrev();
            }}
          >
            {slide?.type === 'milestone' ? (
              <View style={sum.milestone}>
                <Text style={sum.milestoneEmoji}>{slide.emoji}</Text>
                <Text style={sum.milestoneMsg}>{slide.message}</Text>
              </View>
            ) : slide?.type === 'concept' ? (
              <View style={sum.introCard}>
                <Text style={sum.slideEmoji}>{slide.emoji}</Text>
                <Text style={sum.introHeading}>{slide.title}</Text>
                {!!slide.definition && <Text style={sum.introDef}>{slide.definition}</Text>}
                {!!slide.example && (
                  <View style={sum.exampleBox}>
                    <Text style={sum.exampleLabel}>📌 Ejemplo</Text>
                    <Text style={sum.exampleText}>{slide.example}</Text>
                  </View>
                )}
              </View>
            ) : slide?.type === 'wow_fact' ? (
              <View style={sum.wowCard}>
                <Text style={sum.wowEmoji}>🤯</Text>
                <Text style={sum.wowLabel}>¿SABÍAS QUE?</Text>
                <Text style={sum.wowText}>{slide.definition}</Text>
              </View>
            ) : (
              <View style={[sum.kpCard, { backgroundColor: SLIDE_STYLE[slide?.type]?.bg, borderLeftColor: SLIDE_STYLE[slide?.type]?.accent }]}>
                <Text style={sum.kpEmoji}>{slide?.emoji}</Text>
                <Text style={[sum.kpLabel, { color: SLIDE_STYLE[slide?.type]?.accent }]}>{SLIDE_STYLE[slide?.type]?.label}</Text>
                <Text style={sum.kpTitle}>{slide?.title}</Text>
                {!!slide?.definition && <Text style={sum.kpDef}>{slide.definition}</Text>}
                {!!slide?.example && (
                  <View style={sum.exampleBox}>
                    <Text style={sum.exampleLabel}>📌 Ejemplo</Text>
                    <Text style={sum.exampleText}>{slide.example}</Text>
                  </View>
                )}
              </View>
            )}
          </Animated.View>

          {/* CTA */}
          <View style={[g.bottom, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable
              onPress={() => isLast ? completeMode('summary') : goNext()}
              style={{ width: '100%' }}
            >
              <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={g.ctaBtn}>
                <Text style={g.ctaText}>{isLast ? '✅ Completar resumen' : 'Siguiente →'}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // QUIZ — Screen 4
  // ══════════════════════════════════════════════════════════════
  if (phase === 'quiz') {
    if (quizDone) {
      const acc = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
      return (
        <SafeAreaView style={g.page} edges={['top']}>
          <StatusBar barStyle="dark-content" backgroundColor={BG} />
          <View style={g.topBar}>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <X size={16} color={Colors.ink} strokeWidth={2.5} />
            </Pressable>
            <Text style={g.screenTitle}>Resultado del quiz</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView contentContainerStyle={[qz.resultScroll, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={qz.resultEmoji}>{acc >= 80 ? '🏆' : acc >= 50 ? '🎯' : '📚'}</Text>
            <Text style={qz.resultTitle}>{acc >= 80 ? '¡Excelente!' : acc >= 50 ? '¡Buen trabajo!' : 'Sigue practicando'}</Text>
            <Text style={qz.resultScore}>{correctCount}/{questions.length}</Text>
            <View style={qz.resultGrid}>
              {[
                { e: '⚡', v: `+${xpEarned}`, l: 'XP ganados' },
                { e: '🔥', v: `${maxStreak}`, l: 'Racha máx.' },
                { e: '🎯', v: `${acc}%`,       l: 'Precisión' },
              ].map(({ e, v, l }) => (
                <View key={l} style={qz.resultCell}>
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                  <Text style={qz.resultCellVal}>{v}</Text>
                  <Text style={qz.resultCellLbl}>{l}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={resetQuiz} style={qz.retryBtn}>
              <RefreshCw size={16} color={BRAND} strokeWidth={2.5} />
              <Text style={qz.retryText}>Intentar de nuevo</Text>
            </Pressable>
            <Pressable onPress={() => completeMode('quiz')} style={{ width: '100%' }}>
              <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={g.ctaBtn}>
                <Text style={g.ctaText}>🎉 Continuar</Text>
              </LinearGradient>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Stats bar */}
          <View style={qz.statsBar}>
            <View style={qz.chip}>
              <Text style={{ fontSize: 16 }}>🔥</Text>
              <Text style={qz.chipVal}>{streak}</Text>
              <Text style={qz.chipLbl}>racha</Text>
            </View>
            <View style={[qz.chip, { flex: 1.6, gap: 6 }]}>
              <PillBar filled={quizIdx + (quizStep !== 'answering' ? 1 : 0)} total={questions.length} color={BRAND} />
              <Text style={qz.counter}>{quizIdx + 1}/{questions.length}</Text>
            </View>
            <View style={qz.chip}>
              <Text style={{ fontSize: 16 }}>⚡</Text>
              <Text style={qz.chipVal}>{xpEarned}</Text>
              <Text style={qz.chipLbl}>XP</Text>
            </View>
          </View>
          <View style={qz.livesRow}>
            {Array.from({ length: MAX_LIVES }).map((_, i) => (
              <Text key={i} style={{ fontSize: 16, opacity: i < lives ? 1 : 0.2 }}>❤️</Text>
            ))}
          </View>
          <ScrollView contentContainerStyle={[qz.scroll, { paddingBottom: 8 }]} showsVerticalScrollIndicator={false}>
            <View style={qz.questionCard}>
              <Text style={qz.questionNum}>Pregunta {quizIdx + 1}</Text>
              <Text style={qz.questionText}>{question?.text}</Text>
            </View>
            <View style={{ gap: 10, marginBottom: 12 }}>
              {question?.options.map((opt, i) => {
                const letter    = LETTERS[i] ?? String(i + 1);
                const isCorrect = opt.id === question.correctOptionId;
                const isWrong   = quizStep !== 'answering' && selected === opt.id && !isCorrect;
                const showGreen = quizStep !== 'answering' && isCorrect;
                const dimmed    = quizStep !== 'answering' && !isCorrect && !isWrong;
                return (
                  <Pressable key={opt.id} onPress={() => handleOption(opt.id)}
                    disabled={quizStep !== 'answering'}
                    style={({ pressed }) => [
                      qz.option,
                      showGreen && qz.optCorrect,
                      isWrong   && qz.optWrong,
                      pressed && quizStep === 'answering' && { opacity: 0.85 },
                      { opacity: dimmed ? 0.35 : 1 },
                    ]}
                  >
                    <View style={[qz.optLetter, showGreen && qz.optLetterGreen, isWrong && qz.optLetterRed]}>
                      {showGreen ? <Check size={13} color="white" strokeWidth={3} /> :
                       isWrong   ? <X    size={13} color="white" strokeWidth={3} /> :
                       <Text style={[qz.optLetterText, selected === opt.id && quizStep === 'answering' && { color: BRAND, fontWeight: '900' }]}>{letter}</Text>}
                    </View>
                    <Text style={[qz.optText, showGreen && { color: '#065F46', fontWeight: '700' }, isWrong && { color: '#991B1B', fontWeight: '700' }]}>
                      {opt.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {quizStep !== 'answering' && question?.explanation ? (
              <View style={[qz.feedback, quizStep === 'correct' ? qz.feedbackGreen : qz.feedbackRed]}>
                <Text style={qz.feedbackTitle}>{quizStep === 'correct' ? '🎉 Correcto' : '💡 Casi'}</Text>
                <Text style={qz.feedbackText}>{question.explanation}</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={[g.bottom, { paddingBottom: insets.bottom + 12 }]}>
            {quizStep !== 'answering' ? (
              <Pressable onPress={handleQuizNext} style={{ width: '100%' }}>
                <LinearGradient
                  colors={quizStep === 'correct' ? ['#059669', '#047857'] : ['#DC2626', '#B91C1C']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={g.ctaBtn}>
                  <Text style={g.ctaText}>Siguiente →</Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <View style={g.ctaBtnOff}>
                <Text style={g.ctaTextOff}>Selecciona una respuesta</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // FLASHCARDS — Screen 5
  // ══════════════════════════════════════════════════════════════
  if (phase === 'flashcards') {
    if (cardsDone) {
      return (
        <SafeAreaView style={g.page} edges={['top']}>
          <StatusBar barStyle="dark-content" backgroundColor={BG} />
          <View style={g.topBar}>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <X size={16} color={Colors.ink} strokeWidth={2.5} />
            </Pressable>
            <Text style={g.screenTitle}>Tarjetas completadas</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 72, marginBottom: 16 }}>🃏</Text>
            <Text style={{ fontSize: 24, fontWeight: '900', color: Colors.ink, textAlign: 'center', marginBottom: 8 }}>¡Tarjetas completadas!</Text>
            <Text style={{ fontSize: 14, color: Colors.muted, textAlign: 'center', marginBottom: 32 }}>{flashcards.length} tarjetas repasadas</Text>
            <Pressable onPress={() => completeMode('flashcards')} style={{ width: '100%' }}>
              <LinearGradient colors={['#059669', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={g.ctaBtn}>
                <Text style={g.ctaText}>🎉 Continuar</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={g.topBar}>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <X size={16} color={Colors.ink} strokeWidth={2.5} />
            </Pressable>
            <Text style={g.screenTitle}>🗂️ Tarjetas</Text>
            <View style={g.counterPill}>
              <Text style={g.counterText}>{cardIdx + 1} / {flashcards.length}</Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
            <PillBar filled={cardIdx + 1} total={flashcards.length} color="#059669" />
          </View>

          {/* Card takes all remaining space */}
          <FlipCard
            key={cardIdx}
            front={card?.front ?? ''}
            back={card?.back ?? ''}
            onFlip={(f) => setCardFlipped(f)}
          />

          {cardFlipped ? (
            <View style={[fcs.srsRow, { paddingBottom: insets.bottom + 12 }]}>
              {[
                { label: '❌\nNo lo sabía', colors: ['#DC2626', '#B91C1C'] as [string,string] },
                { label: '🤔\nLo dudé',     colors: [Colors.amber, '#D97706'] as [string,string] },
                { label: '✅\nLo sabía',    colors: ['#059669', '#047857'] as [string,string] },
              ].map(({ label, colors }) => (
                <Pressable key={label} onPress={handleCardNext} style={{ flex: 1 }}>
                  <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={fcs.srsBtn}>
                    <Text style={fcs.srsBtnText}>{label}</Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ height: 72 + insets.bottom }} />
          )}
        </SafeAreaView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // CELEBRATION — Screen 6
  // ══════════════════════════════════════════════════════════════
  if (phase === 'celebration') {
    const modeLabel = { summary: 'Resumen', quiz: 'Quiz', flashcards: 'Tarjetas' }[celebSrc];
    const allDone   = completedModes.size >= 3;
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {CONFETTI_DATA.map((item, i) => <ConfettiPiece key={i} item={item} />)}
        </View>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <Text style={{ fontSize: SM ? 72 : 88, marginBottom: 8 }}>🎉</Text>
            <Text style={{ fontSize: SM ? 24 : 28, fontWeight: '900', color: Colors.ink, textAlign: 'center', marginBottom: 8 }}>
              ¡{modeLabel} completado!
            </Text>
            <Text style={{ fontSize: 14, color: Colors.muted, textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
              Sigue así, lo estás haciendo increíble 🔥
            </Text>
            <View style={cel.row}>
              {[
                { e: '⚡', v: `+${xpEarned}`, l: 'XP' },
                { e: '🔥', v: `${streak}`, l: 'Racha' },
                { e: '🏅', v: `${completedModes.size}/3`, l: 'Modos' },
              ].map(({ e, v, l }) => (
                <View key={l} style={cel.cell}>
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                  <Text style={cel.val}>{v}</Text>
                  <Text style={cel.lbl}>{l}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={[g.bottom, { paddingBottom: insets.bottom + 12, gap: 10 }]}>
            <Pressable onPress={() => allDone ? setPhase('complete') : setPhase('mode-select')} style={{ width: '100%' }}>
              <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={g.ctaBtn}>
                <Text style={g.ctaText}>{allDone ? '🏆 Ver resultados finales' : 'Continuar aprendiendo →'}</Text>
              </LinearGradient>
            </Pressable>
            {!allDone && (
              <Pressable onPress={() => setPhase('complete')} style={g.secBtn}>
                <Text style={g.secText}>Finalizar sesión</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // COMPLETE — Screen 7 (Session end)
  // ══════════════════════════════════════════════════════════════
  if (phase === 'complete') {
    const totalXp  = xpEarned + (completedModes.has('summary') ? XP_PER_SUMMARY * summarySlides.length : 0)
                               + (completedModes.has('flashcards') ? XP_PER_CARD * flashcards.length : 0);
    const achievements = [
      completedModes.has('summary')    && { e: '📚', title: 'Maestro del resumen',   desc: `Leíste ${summarySlides.length} conceptos` },
      maxStreak >= 3                   && { e: '🔥', title: `Racha de ${maxStreak}`, desc: 'Respondiste en cadena' },
      completedModes.size >= 3         && { e: '🎖️', title: 'Aprendiz constante',    desc: 'Completaste los 3 modos' },
      finalAccuracy >= 80              && { e: '🎯', title: 'Precisión élite',        desc: `${finalAccuracy}% de aciertos` },
    ].filter(Boolean).slice(0, 3) as { e: string; title: string; desc: string }[];

    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {CONFETTI_DATA.map((item, i) => <ConfettiPiece key={i} item={item} />)}
        </View>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <ScrollView contentContainerStyle={[comp.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
            <Text style={comp.trophy}>🏆</Text>
            <Text style={comp.title}>¡Sesión completada!</Text>
            <Text style={comp.subtitle}>{session.topic}</Text>

            <View style={comp.grid}>
              {[
                { e: '⚡', v: `+${totalXp}`, l: 'XP Ganados' },
                { e: '🔥', v: `${maxStreak}`, l: 'Racha máx.' },
                { e: '🎯', v: `${finalAccuracy}%`, l: 'Precisión' },
                { e: '⏱️', v: `${session.estimatedDuration}m`, l: 'Duración' },
              ].map(({ e, v, l }) => (
                <View key={l} style={comp.cell}>
                  <Text style={{ fontSize: 28 }}>{e}</Text>
                  <Text style={comp.cellVal}>{v}</Text>
                  <Text style={comp.cellLbl}>{l}</Text>
                </View>
              ))}
            </View>

            {/* Level bar */}
            <View style={comp.levelCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.ink }}>Nivel 4</Text>
                <Text style={{ fontSize: 12, color: Colors.muted }}>68% al siguiente</Text>
              </View>
              <View style={{ height: 10, borderRadius: 99, backgroundColor: Colors.bgSoft, overflow: 'hidden' }}>
                <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: '68%', height: '100%', borderRadius: 99 }} />
              </View>
            </View>

            {achievements.length > 0 && (
              <View style={comp.achCard}>
                <Text style={comp.achTitle}>🎖️ Logros desbloqueados</Text>
                {achievements.map((a, i) => (
                  <View key={i} style={comp.achRow}>
                    <Text style={{ fontSize: 32 }}>{a.e}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={comp.achName}>{a.title}</Text>
                      <Text style={comp.achDesc}>{a.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={[g.bottom, { paddingBottom: insets.bottom + 12, gap: 10 }]}>
            <Pressable onPress={() => router.push('/home' as any)} style={{ width: '100%' }}>
              <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={g.ctaBtn}>
                <Text style={g.ctaText}>🚀 Seguir aprendiendo</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => router.back()} style={g.secBtn}>
              <Text style={g.secText}>Volver al inicio</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return null;
}

// ── Shared styles ──────────────────────────────────────────────────
const g = StyleSheet.create({
  page:    { flex: 1, backgroundColor: BG },
  scroll:  { paddingHorizontal: 20, paddingTop: 8 },
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  screenTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: Colors.ink, letterSpacing: -0.2 },
  xpPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.ink, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10 },
  xpText:  { color: LIME, fontWeight: '800', fontSize: 12 },
  counterPill: { backgroundColor: Colors.bgSoft, borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  counterText: { fontSize: 12, fontWeight: '800', color: Colors.ink },
  bottom:  { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: BG },
  ctaBtn:  { paddingVertical: 17, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '800', color: 'white' },
  ctaBtnOff:  { paddingVertical: 17, borderRadius: 18, alignItems: 'center', backgroundColor: Colors.bgSoft },
  ctaTextOff: { fontSize: 16, fontWeight: '700', color: Colors.muted },
  secBtn:  { paddingVertical: 13, borderRadius: 18, alignItems: 'center', backgroundColor: Colors.bgSoft },
  secText: { fontSize: 14, fontWeight: '700', color: Colors.ink2 },
});

// ── Lobby ──────────────────────────────────────────────────────────
const lob = StyleSheet.create({
  hero:       { borderRadius: 28, padding: 28, marginBottom: 14, overflow: 'hidden', alignItems: 'center' },
  glow1:      { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,91,159,0.2)', top: -60, right: -60 },
  glow2:      { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(196,248,82,0.15)', bottom: -50, left: -40 },
  heroEmoji:  { fontSize: SM ? 64 : 80, marginBottom: 10 },
  heroSubject:{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.5, marginBottom: 6 },
  heroTopic:  { fontSize: SM ? 20 : 24, fontWeight: '900', color: 'white', textAlign: 'center', letterSpacing: -0.5, lineHeight: SM ? 26 : 32, marginBottom: 18 },
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  chipText:   { color: 'white', fontSize: 11, fontWeight: '600' },
  rewardsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  rewardCard: { flex: 1, backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, padding: SM ? 10 : 14, alignItems: 'center', gap: 2, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  rewardVal:  { fontSize: SM ? 18 : 22, fontWeight: '900', letterSpacing: -0.5 },
  rewardLbl:  { fontSize: 8, fontWeight: '700', color: Colors.muted, letterSpacing: 1 },
  missionCard:{ backgroundColor: 'white', borderRadius: 20, borderWidth: 1, borderColor: Colors.line, padding: 18, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  missionHead:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  missionTitle:{ fontSize: 14, fontWeight: '800', color: Colors.ink },
  missionPct: { fontSize: 13, fontWeight: '900', color: BRAND },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  missionCheck:{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.line2, alignItems: 'center', justifyContent: 'center' },
  missionCheckDone:{ backgroundColor: BRAND, borderColor: BRAND },
  missionLabel:{ fontSize: 14, color: Colors.ink2, fontWeight: '600' },
  missionLabelDone:{ color: Colors.muted, textDecorationLine: 'line-through' },
});

// ── Mode select ────────────────────────────────────────────────────
const mds = StyleSheet.create({
  heading: { fontSize: SM ? 20 : 22, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5, marginBottom: 4, textAlign: 'center' },
  sub:     { fontSize: 13, color: Colors.muted, textAlign: 'center' },
  // card is now a Pressable with flex:1 — no fixed height needed
  gradient:{ flex: 1, borderRadius: 20, padding: SM ? 14 : 16, justifyContent: 'space-between',
             shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 6 },
  doneBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 100, paddingVertical: 2, paddingHorizontal: 8, marginBottom: 6 },
  doneBadgeText:{ fontSize: 10, fontWeight: '800' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardEmoji:{ fontSize: SM ? 32 : 36 },
  xpBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100, paddingVertical: 3, paddingHorizontal: 9 },
  xpBadgeText:{ color: 'white', fontSize: 11, fontWeight: '800' },
  cardTitle:{ fontSize: SM ? 18 : 20, fontWeight: '900', color: 'white', marginBottom: 2 },
  cardDesc: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  cardDetail:{ fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  arrow:    { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  tip:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(196,248,82,0.12)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(196,248,82,0.3)', paddingVertical: 10, paddingHorizontal: 14 },
  tipText:  { flex: 1, fontSize: 12, color: Colors.ink2, lineHeight: 17, fontWeight: '600' },
});

// ── Summary ────────────────────────────────────────────────────────
const sum = StyleSheet.create({
  storyBar:     { flexDirection: 'row', paddingHorizontal: 16, gap: 4, paddingVertical: 8 },
  storySeg:     { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: Colors.line },
  storyFill:    { height: '100%', borderRadius: 2, backgroundColor: BRAND },
  slideCounter: { fontSize: 11, color: Colors.muted, fontWeight: '600', marginTop: 1 },
  slideArea:    { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },

  // Concept card (white)
  introCard:    { backgroundColor: 'white', borderRadius: 24, padding: SM ? 18 : 22, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  slideEmoji:   { fontSize: SM ? 38 : 44, marginBottom: 10 },
  introHeading: { fontSize: SM ? 20 : 23, fontWeight: '900', color: Colors.ink, letterSpacing: -0.4, lineHeight: SM ? 26 : 30, marginBottom: 8 },
  introDef:     { fontSize: SM ? 14 : 15, color: Colors.ink2, lineHeight: SM ? 21 : 23, fontWeight: '500', marginBottom: 2 },

  // Accent card (key_fact, important, etc.)
  kpCard:       { borderRadius: 20, borderLeftWidth: 4, padding: SM ? 16 : 20, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  kpEmoji:      { fontSize: SM ? 32 : 36, marginBottom: 6 },
  kpLabel:      { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  kpTitle:      { fontSize: SM ? 16 : 18, fontWeight: '900', color: Colors.ink, marginBottom: 6, letterSpacing: -0.3 },
  kpDef:        { fontSize: SM ? 13 : 14, color: Colors.ink2, lineHeight: SM ? 20 : 22, fontWeight: '500' },

  // Shared example block
  exampleBox:   { marginTop: SM ? 10 : 14, paddingTop: SM ? 10 : 12, borderTopWidth: 1, borderTopColor: Colors.line },
  exampleLabel: { fontSize: 10, fontWeight: '800', color: Colors.muted, letterSpacing: 0.6, marginBottom: 4, textTransform: 'uppercase' },
  exampleText:  { fontSize: SM ? 13 : 14, color: Colors.ink, lineHeight: SM ? 20 : 22, fontWeight: '600' },

  // Wow fact card
  wowCard:      { backgroundColor: 'white', borderRadius: 24, padding: SM ? 28 : 34, alignItems: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  wowEmoji:     { fontSize: SM ? 56 : 68, marginBottom: 16 },
  wowLabel:     { fontSize: 11, fontWeight: '900', color: '#FF4D6D', letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' },
  wowText:      { fontSize: SM ? 17 : 20, fontWeight: '700', color: Colors.ink, textAlign: 'center', lineHeight: SM ? 26 : 30, letterSpacing: -0.3 },

  // Milestone
  milestone:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  milestoneEmoji: { fontSize: 80, marginBottom: 20 },
  milestoneMsg:   { fontSize: SM ? 22 : 26, fontWeight: '900', color: Colors.ink, textAlign: 'center', letterSpacing: -0.5 },
});

// ── Quiz ───────────────────────────────────────────────────────────
const qz = StyleSheet.create({
  statsBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: Colors.line, paddingHorizontal: 10, paddingVertical: 6 },
  chipVal:  { fontSize: 15, fontWeight: '900', color: Colors.ink },
  chipLbl:  { fontSize: 10, color: Colors.muted, fontWeight: '600' },
  counter:  { fontSize: 11, fontWeight: '700', color: Colors.muted, marginLeft: 4, flexShrink: 0 },
  livesRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, marginBottom: 4 },
  scroll:   { paddingHorizontal: 16, paddingTop: 8 },
  questionCard: { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 14, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 4 },
  questionNum:  { fontSize: 11, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5, marginBottom: 10 },
  questionText: { fontSize: SM ? 16 : 19, fontWeight: '800', color: Colors.ink, lineHeight: SM ? 24 : 28, letterSpacing: -0.2 },
  option:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: Colors.line, backgroundColor: 'white' },
  optCorrect:   { borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.06)' },
  optWrong:     { borderColor: '#DC2626', backgroundColor: 'rgba(220,38,38,0.06)' },
  optLetter:    { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optLetterGreen:{ backgroundColor: '#059669' },
  optLetterRed:  { backgroundColor: '#DC2626' },
  optLetterText: { fontSize: 13, fontWeight: '800', color: Colors.ink },
  optText:       { flex: 1, fontSize: 14, color: Colors.ink, fontWeight: '600', lineHeight: 20 },
  feedback:      { borderRadius: 14, padding: 14, marginBottom: 8 },
  feedbackGreen: { backgroundColor: 'rgba(5,150,105,0.06)', borderWidth: 1, borderColor: 'rgba(5,150,105,0.2)' },
  feedbackRed:   { backgroundColor: 'rgba(220,38,38,0.06)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.2)' },
  feedbackTitle: { fontSize: 13, fontWeight: '800', color: Colors.ink, marginBottom: 4 },
  feedbackText:  { fontSize: 13, color: Colors.ink2, lineHeight: 20 },
  resultScroll:  { paddingHorizontal: 24, paddingTop: 24, alignItems: 'center' },
  resultEmoji:   { fontSize: 72, marginBottom: 12 },
  resultTitle:   { fontSize: 26, fontWeight: '900', color: Colors.ink, marginBottom: 6, textAlign: 'center' },
  resultScore:   { fontSize: 48, fontWeight: '900', color: BRAND, letterSpacing: -1, marginBottom: 20 },
  resultGrid:    { flexDirection: 'row', gap: 10, marginBottom: 24, width: '100%' },
  resultCell:    { flex: 1, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, padding: 14, alignItems: 'center', gap: 4 },
  resultCellVal: { fontSize: 16, fontWeight: '900', color: Colors.ink },
  resultCellLbl: { fontSize: 10, color: Colors.muted, fontWeight: '600' },
  retryBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgSoft, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, marginBottom: 12 },
  retryText:     { fontSize: 14, fontWeight: '700', color: BRAND },
});

// ── Flashcard SRS buttons ──────────────────────────────────────────
const fcs = StyleSheet.create({
  srsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  srsBtn: { paddingVertical: 13, borderRadius: 16, alignItems: 'center' },
  srsBtnText: { fontSize: SM ? 10 : 11, fontWeight: '800', color: 'white', textAlign: 'center', lineHeight: 16 },
});

// ── Celebration ────────────────────────────────────────────────────
const cel = StyleSheet.create({
  row:  { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 16 },
  cell: { flex: 1, backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, padding: 16, alignItems: 'center', gap: 4, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  val:  { fontSize: 20, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5 },
  lbl:  { fontSize: 10, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5 },
});

// ── Complete ───────────────────────────────────────────────────────
const comp = StyleSheet.create({
  scroll:   { paddingHorizontal: 20, paddingTop: 20, alignItems: 'center' },
  trophy:   { fontSize: SM ? 80 : 96, textAlign: 'center', marginBottom: 8 },
  title:    { fontSize: SM ? 26 : 32, fontWeight: '900', color: Colors.ink, textAlign: 'center', letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 13, color: Colors.muted, textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%', marginBottom: 16 },
  cell:     { width: '47%', backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, padding: 16, alignItems: 'center', gap: 4, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cellVal:  { fontSize: 22, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5 },
  cellLbl:  { fontSize: 10, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5 },
  levelCard:{ backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, padding: 18, width: '100%', marginBottom: 16, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  achCard:  { backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, padding: 18, width: '100%', marginBottom: 16, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  achTitle: { fontSize: 14, fontWeight: '800', color: Colors.ink, marginBottom: 14 },
  achRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  achName:  { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  achDesc:  { fontSize: 12, color: Colors.muted },
});
