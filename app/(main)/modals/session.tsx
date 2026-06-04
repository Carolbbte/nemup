import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  X,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useAnimatedReaction,
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
const BRAND = '#6C4DFF';
const NEON  = '#7C5AFF';
const LIME  = '#C4F852';

// ── Types ─────────────────────────────────────────────────────────
type Option  = { id: string; text: string };
type Question = { id: string; text: string; options: Option[]; correctOptionId: string; explanation: string; sourceQuote: string };
type Flashcard = { id: string; front: string; back: string };
type SummarySlideType = 'concept' | 'key_fact' | 'important' | 'remember' | 'example' | 'curiosity' | 'wow_fact'
  | 'mission' | 'main_concept' | 'comprehension' | 'key_relation' | 'mini_quiz' | 'process_flow' | 'application' | 'common_error' | 'final_challenge' | 'victory' | 'challenge' | 'decide' | 'order_sequence';
type IllustrationType = 'educational' | 'diagram' | 'concept' | 'timeline' | 'map' | 'process' | 'comparison';
type BackendSlide = { type: SummarySlideType; emoji: string; title: string; definition: string; example: string; visualHint?: string; illustrationType?: IllustrationType; connector?: string | null; question?: string | null; options?: string[] | null; correctAnswer?: string | null; wrongAnswerHints?: Record<string, string> | null };
type LegacySection = { heading: string; content: string; keyPoints: string[] };
type Session = {
  id?: string; userId?: string;
  subject: string; topic: string; estimatedDuration: number; difficulty: string;
  xpReward: number; baseXpReward?: number; gemReward: number; questions: Question[]; flashcards: Flashcard[];
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

// Quiz engagement constants
const COMBO_SIZE = 6;
const COMBO_MILESTONES: Record<number, { xp: number; msg: string }> = {
  2: { xp: 5,  msg: '🔥 Combo ×2  +5 XP'  },
  4: { xp: 10, msg: '⚡ Combo ×4  +10 XP' },
  6: { xp: 20, msg: '🚀 Combo ×6  +20 XP' },
};
const STREAK_MESSAGES: Record<number, string> = {
  1: '🔥 En marcha',
  2: '🔥🔥 En racha',
  3: '⚡ Excelente ritmo',
  4: '🚀 Imparable',
  5: '🏆 Dominando el tema',
};
const MICRO_REWARD_MSGS: Record<number, string> = {
  3:  '🏆 Concepto dominado',
  5:  '🎯 Dominando el tema',
  7:  '⚡ Bonus XP desbloqueado',
  10: '📚 ¡Tema completado!',
};
const SUMMARY_REWARDS = ['✨ +10 XP', '🔥 Correcto', '⚡ Muy bien', '🎯 Excelente'];
const NEMI_MSGS = [
  'Buen comienzo.',
  'Ya entendiste este concepto.',
  'Excelente progreso.',
  'Eres constante. Eso importa.',
  'Tu ritmo es sólido.',
  'Un concepto más dominado.',
  'Vamos por la última.',
];
const MOTIV_POOLS = {
  start:  ['🚀 ¡Empezamos!', '🧠 Vamos paso a paso.', '🔥 Construyamos una racha.'],
  early:  ['🎯 Ya avanzaste.', '🔥 Mantén el ritmo.', '⚡ Lo estás haciendo bien.'],
  mid:    ['🚀 Ya pasaste la mitad.', '⚡ Estás en racha.', '🎯 Sigue así.'],
  end:    ['🔥 No rompas la racha.', '🎯 Te falta una.', '🚀 Ya casi terminas.'],
  streak: ['🚀 Imparable, sigue así.', '⚡ Mantén tu racha.', '🔥🔥 ¡En llamas!'],
};
function pickMotivMsg(quizIdx: number, total: number, streak: number, prev: string): string {
  const pool =
    streak >= 3            ? MOTIV_POOLS.streak :
    quizIdx === 0          ? MOTIV_POOLS.start  :
    quizIdx >= total - 2   ? MOTIV_POOLS.end    :
    quizIdx >= total / 2   ? MOTIV_POOLS.mid    :
    MOTIV_POOLS.early;
  const filtered = pool.filter(m => m !== prev);
  const src = filtered.length > 0 ? filtered : pool;
  return src[Math.floor(Math.random() * src.length)];
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

// ── Animated counter (result screen) ─────────────────────────────
function AnimatedCounter({ to, delay = 0, style, prefix = '', suffix = '' }: {
  to: number; delay?: number; style?: any; prefix?: string; suffix?: string;
}) {
  const sv  = useSharedValue(0);
  const [val, setVal] = useState(0);
  useAnimatedReaction(
    () => Math.round(sv.value * to),
    (cur, prev) => { if (cur !== prev) runOnJS(setVal)(cur); },
  );
  useEffect(() => {
    sv.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [to]);
  return <Text style={style}>{prefix}{val}{suffix}</Text>;
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

// ── Summary slide style config (for kp-type cards) ───────────────
const SLIDE_STYLE: Record<string, { accent: string; bg: string; label: string }> = {
  key_fact:  { accent: '#5B3DF5', bg: 'rgba(91,61,245,0.08)',  label: '💡 Dato clave' },
  important: { accent: '#FF7A2B', bg: 'rgba(255,122,43,0.08)', label: '🔥 Importante' },
  remember:  { accent: '#00C2A8', bg: 'rgba(0,194,168,0.08)',  label: '🎯 Recuerda' },
  curiosity: { accent: '#FFB547', bg: 'rgba(255,181,71,0.08)', label: '✨ Curiosidad' },
};

// ── Summary slide builder ─────────────────────────────────────────
type SummarySlide =
  | BackendSlide
  | { type: 'quiz';       question: string; options: Option[]; correctId: string; explanation: string }
  | { type: 'prediction'; prompt: string; hint: string }
  | { type: 'motivation'; emoji: string; message: string; sub: string };

function buildSummarySlides(backendSlides: BackendSlide[], questions: Question[]): SummarySlide[] {
  if (!backendSlides.length) {
    return [{ type: 'concept', emoji: '📚', title: 'Resumen', definition: '', example: '' }];
  }

  // Mission model: quality pass before rendering
  if (backendSlides[0].type === 'mission') {
    const INTER = ['comprehension', 'mini_quiz', 'final_challenge', 'decide', 'order_sequence'];
    const isInteractive = (s: BackendSlide) =>
      INTER.includes(s.type) || (s.type === 'wow_fact' && !!s.question?.trim());

    // Helper: content words for redundancy check (Spanish stopwords removed, ≥3 chars)
    const STOPS = new Set(['que', 'de', 'la', 'el', 'en', 'es', 'un', 'una', 'los', 'las', 'del',
      'al', 'y', 'o', 'a', 'se', 'su', 'por', 'con', 'para', 'mas', 'pero', 'como', 'si',
      'no', 'le', 'lo', 'hay', 'cada', 'vez', 'cuando', 'esto', 'este', 'eso', 'esa', 'son']);
    const keyWords = (text: string): Set<string> =>
      new Set(text.toLowerCase().replace(/[^a-záéíóúüñ\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOPS.has(w)));

    // Step 1: sanitise — never drop, always convert/fallback
    const SLIDE_CONTENT_FALLBACKS: Record<string, { title: string; definition: string }> = {
      mission: { title: '¡Comienza la misión!', definition: 'Al terminar, podrás aplicar lo aprendido con confianza.' },
      main_concept: { title: 'Concepto principal', definition: 'Este es el concepto central que debes comprender bien.' },
      comprehension: { title: '¿Comprendiste?', definition: '🎯 Reflexiona sobre lo que acabas de ver.' },
      mini_quiz: { title: 'Quiz rápido', definition: '⚡ Aplica lo que aprendiste.' },
      process_flow: { title: 'El método', definition: 'Paso 1: Analiza → Paso 2: Aplica → Paso 3: Verifica' },
      application: { title: '¿Dónde se aplica?', definition: 'Este concepto tiene aplicaciones concretas en la vida real.' },
      common_error: { title: 'Error frecuente', definition: '❌ Muchos cometen este error. ✅ La forma correcta es aplicar el método.' },
      decide: { title: '¿Cuál es correcto?', definition: '🔥 Analiza las opciones y decide cuál es la correcta.' },
      final_challenge: { title: 'Desafío final', definition: '🏆 Demuestra tu dominio aplicando todo lo aprendido.' },
      challenge: { title: 'Reflexiona', definition: 'Piensa en cómo aplicarías este concepto en una situación real.' },
      victory: { title: '¡Misión completada!', definition: 'Aprendiste los conceptos clave de esta sesión.' },
    };
    const applyFallback = (s: BackendSlide): BackendSlide => {
      const fb = SLIDE_CONTENT_FALLBACKS[s.type] ?? { title: 'Contenido', definition: 'Revisa este concepto con tu material.' };
      return {
        ...s,
        title: s.title?.trim() ? s.title : fb.title,
        definition: s.definition?.trim() ? s.definition : fb.definition,
      };
    };

    let valid = backendSlides.map(s => {
      // Convert interactive slides with missing question/options to non-interactive
      if (INTER.includes(s.type) && s.type !== 'order_sequence' && s.type !== 'wow_fact') {
        if (!s.question?.trim() || !s.options?.length) {
          console.warn(`[Summary] Interactive slide ${s.type} missing question/options — converting to challenge`);
          return applyFallback({ ...s, type: 'challenge' as SummarySlideType, question: null, options: null, correctAnswer: null });
        }
      }
      return applyFallback(s);
    }).map(s => {
      if (!s.definition) return s;
      const words = s.definition.trim().split(/\s+/);
      return words.length > 45 ? { ...s, definition: words.slice(0, 45).join(' ') + '…' } : s;
    });

    // Step 2: redundancy — skip non-interactive slides with >70% word overlap vs prior
    const noRedundant: BackendSlide[] = [];
    let prevWords = new Set<string>();
    for (const s of valid) {
      if (!isInteractive(s) && s.type !== 'mission' && s.type !== 'victory') {
        const words = keyWords(`${s.title ?? ''} ${s.definition ?? ''}`);
        if (prevWords.size > 0 && words.size > 0) {
          let hits = 0;
          for (const w of words) if (prevWords.has(w)) hits++;
          if (hits / Math.min(words.size, prevWords.size) > 0.70) {
            console.warn(`[Summary] Redundant slide skipped: ${s.type} — ${s.title}`);
            continue;
          }
        }
        prevWords = words;
      } else if (!isInteractive(s)) {
        prevWords = new Set();
      }
      noRedundant.push(s);
    }

    // Step 3: convert first process_flow with 3–5 arrow-separated steps → order_sequence
    let converted = false;
    const withOrder: BackendSlide[] = noRedundant.map(s => {
      if (!converted && s.type === 'process_flow' && s.definition?.includes('→')) {
        const steps = s.definition.split('→').map(t => t.trim()).filter(Boolean);
        if (steps.length >= 3 && steps.length <= 5) {
          converted = true;
          return { ...s, type: 'order_sequence' as SummarySlideType, options: steps };
        }
      }
      return s;
    });

    // Step 4: max 2 consecutive non-interactive — inject from quiz pool if violated
    const pool = questions.slice(0, 2);
    let poolIdx = 0;
    const enforced: BackendSlide[] = [];
    let consec = 0;
    for (const s of withOrder) {
      if (isInteractive(s)) {
        consec = 0;
      } else {
        if (consec >= 2 && poolIdx < pool.length) {
          const q = pool[poolIdx++];
          const correctLetter = LETTERS[q.options.findIndex(o => o.id === q.correctOptionId)] ?? 'A';
          enforced.push({
            type: 'comprehension', emoji: '🧩', title: '¿Comprendiste?',
            definition: q.explanation || '', example: '', question: q.text,
            options: q.options.slice(0, 4).map((o, i) => `${LETTERS[i]}. ${o.text}`),
            correctAnswer: correctLetter,
          } as BackendSlide);
          consec = 0;
        }
        consec++;
      }
      enforced.push(s);
    }

    return enforced as SummarySlide[];
  }

  const out: SummarySlide[] = [];
  const quizPool            = questions.slice(0, 3);
  let quizUsed              = 0;
  const total               = backendSlides.length;

  const popQuiz = (): SummarySlide | null => {
    if (quizUsed >= quizPool.length) return null;
    const q = quizPool[quizUsed++];
    return { type: 'quiz', question: q.text, options: q.options.slice(0, 3), correctId: q.correctOptionId, explanation: q.explanation };
  };

  const makeMotivation = (done: number): SummarySlide => {
    const pct = Math.round((done / total) * 100);
    const rem = total - done;
    if (pct >= 70) return { type: 'motivation', emoji: '🏆', message: `¡${pct}% completado!`,   sub: rem > 0 ? `Solo ${rem} conceptos más.` : '¡Lo lograste!' };
    if (pct >= 50) return { type: 'motivation', emoji: '🔥', message: 'Vas por la mitad.',       sub: `Ya dominaste ${done} conceptos.` };
    return              { type: 'motivation', emoji: '🚀', message: '¡Vas muy bien!',            sub: `${done} de ${total} conceptos.` };
  };

  const makePrediction = (slide: BackendSlide): SummarySlide => ({
    type: 'prediction',
    prompt: `¿Qué crees que es "${slide.title}"?`,
    hint: slide.definition,
  });

  // Content types that count toward the TikTok rhythm check
  const CONTENT_TYPES: string[] = ['concept', 'key_fact', 'important', 'remember', 'curiosity', 'example', 'wow_fact'];

  for (let i = 0; i < backendSlides.length; i++) {
    const slide = backendSlides[i];

    // TikTok rhythm: prevent 3+ consecutive same content type
    const prev2 = out.slice(-2);
    if (
      prev2.length === 2 &&
      CONTENT_TYPES.includes(prev2[0].type) &&
      prev2[0].type === prev2[1].type &&
      prev2[1].type === slide.type
    ) {
      out.push(popQuiz() ?? makeMotivation(i));
    }

    // Prediction before a key concept at the 1/3 mark (once quiz pool is used)
    if (i === Math.floor(total / 3) && quizUsed >= quizPool.length && (slide.type === 'concept' || slide.type === 'key_fact')) {
      out.push(makePrediction(slide));
    }

    out.push(slide);

    // After every 4th content slide inject quiz → prediction → motivation
    if ((i + 1) % 4 === 0 && i < backendSlides.length - 1) {
      const quiz = popQuiz();
      if (quiz) {
        out.push(quiz);
      } else {
        const next = backendSlides[i + 1];
        if (next && (next.type === 'concept' || next.type === 'key_fact')) {
          out.push(makePrediction(next));
        } else {
          out.push(makeMotivation(i + 1));
        }
      }
    }
  }

  // Contextual final motivation
  out.push({ type: 'motivation', emoji: '🎉', message: '¡Resumen completado!', sub: `Aprendiste ${total} conceptos clave.` });
  return out;
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function SessionPlayerScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [session, setSession] = useState<Session | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [skillPath, setSkillPath] = useState<{ pathId: string; totalMissions: number; missions: Array<{ missionIndex: number; skillId: string | null; skillLabel: string | null; sessionId: string; session: Session }> } | null>(null);
  const [masteryLevel, setMasteryLevel] = useState<'needs_practice' | 'in_progress' | 'good_mastery' | 'mastered' | null>(null);
  const [masteryPct, setMasteryPct] = useState<number | null>(null);
  const [earnedXp, setEarnedXp] = useState<number | null>(null);
  const loadedSessionKeyRef = useRef<string | null>(null);

  // Tab screens are never unmounted by React Navigation, so useEffect([], [])
  // only fires on the very first mount and misses subsequent sessions.
  // useFocusEffect fires every time the screen gains focus; we guard with a
  // per-session key written by upload.tsx so we only reset state when the
  // user actually starts a NEW session, not when they navigate back mid-session.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function loadIfNew() {
        const [[, rawKey], [, rawSession], [, rawSessionId], [, rawPath]] = await AsyncStorage.multiGet([
          'nemup_session_key',
          'nemup_last_session',
          'nemup_last_session_id',
          'nemup_skill_path',
        ]);
        if (!active) return;
        const isNewSession = rawKey !== loadedSessionKeyRef.current;
        if (!isNewSession) return;
        loadedSessionKeyRef.current = rawKey;
        if (!rawSession) return;
        try {
          const parsed: Session = JSON.parse(rawSession);
          setSession(parsed);
          setCurrentSessionId(rawSessionId ?? null);
          setMasteryLevel(null);
          try { setSkillPath(rawPath ? JSON.parse(rawPath) : null); } catch { setSkillPath(null); }
          // Reset ALL game state
          setPhase('lobby');
          setCompleted(new Set());
          setSummaryIdx(0);
          setQuizAnswers({});
          setQuizIdx(0);
          setSelected(null);
          setQuizStep('answering');
          setLives(MAX_LIVES);
          setXpEarned(0);
          setCorrectCount(0);
          setStreak(0);
          setMaxStreak(0);
          setQuizDone(false);
          setComboCount(0);
          setStreakMsg('');
          setMicroMsg('');
          setSummaryRewardText(null);
          setOrderTaps([]);
          setNemiMsg('');
          setMotivText(MOTIV_POOLS.start[0]);
          setCardIdx(0);
          setCardFlipped(false);
          setCardsDone(false);
          setCelebSrc('quiz');
        } catch {}
      }
      loadIfNew();
      return () => { active = false; };
    }, []),
  );

  // Derived from session — declared early so useEffect dependency arrays can reference them
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

  // Pre-built slides — useState so adaptive correction can inject remedial slides
  const [missionSlides, setMissionSlides] = useState<SummarySlide[]>([]);
  useEffect(() => {
    setMissionSlides(buildSummarySlides(summarySlides, questions));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const [phase, setPhase]           = useState<Phase>('lobby');
  const [completedModes, setCompleted] = useState<Set<string>>(new Set());
  const [celebSrc, setCelebSrc]     = useState<'summary' | 'quiz' | 'flashcards'>('quiz');

  // Summary
  const [summaryIdx, setSummaryIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});

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
  const [comboCount, setComboCount]       = useState(0);
  const [streakMsg, setStreakMsg]         = useState('');
  const [microMsg, setMicroMsg]           = useState('');
  const [summaryRewardText, setSummaryRewardText] = useState<string | null>(null);
  const [orderTaps, setOrderTaps]     = useState<number[]>([]); // original indices tapped in sequence
  const [nemiMsg, setNemiMsg]             = useState('');
  const [motivText, setMotivText]         = useState(MOTIV_POOLS.start[0]);

  const nemiLastIdxRef = useRef(-3);
  const prevMotivRef   = useRef(MOTIV_POOLS.start[0]);
  const nextIdxRef     = useRef(0);

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

  // Quiz animation shared values (ALL unconditional)
  const xpFloatY      = useSharedValue(0);
  const xpFloatOp     = useSharedValue(0);
  const streakBadgeSV = useSharedValue(0);
  const microSV       = useSharedValue(0);
  const heartShakeSV  = useSharedValue(0);
  const feedbackY     = useSharedValue(14);
  const feedbackOp    = useSharedValue(0);
  const optScale0     = useSharedValue(1);
  const optScale1     = useSharedValue(1);
  const optScale2     = useSharedValue(1);
  const optScale3     = useSharedValue(1);
  const optScale4     = useSharedValue(1);

  const xpFloatStyle     = useAnimatedStyle(() => ({ opacity: xpFloatOp.value, transform: [{ translateY: xpFloatY.value }] }));
  const streakBadgeStyle = useAnimatedStyle(() => ({ opacity: streakBadgeSV.value, transform: [{ scale: 0.82 + streakBadgeSV.value * 0.18 }] }));
  const microRewardStyle = useAnimatedStyle(() => ({ opacity: microSV.value, transform: [{ scale: 0.82 + microSV.value * 0.18 }] }));
  const heartShakeStyle  = useAnimatedStyle(() => ({ transform: [{ translateX: heartShakeSV.value }] }));
  const feedbackStyle    = useAnimatedStyle(() => ({ opacity: feedbackOp.value, transform: [{ translateY: feedbackY.value }] }));
  const optAnimStyle0    = useAnimatedStyle(() => ({ transform: [{ scale: optScale0.value }] }));
  const optAnimStyle1    = useAnimatedStyle(() => ({ transform: [{ scale: optScale1.value }] }));
  const optAnimStyle2    = useAnimatedStyle(() => ({ transform: [{ scale: optScale2.value }] }));
  const optAnimStyle3    = useAnimatedStyle(() => ({ transform: [{ scale: optScale3.value }] }));
  const optAnimStyle4    = useAnimatedStyle(() => ({ transform: [{ scale: optScale4.value }] }));
  const optAnimStyles    = [optAnimStyle0, optAnimStyle1, optAnimStyle2, optAnimStyle3, optAnimStyle4];
  const optScaleArr      = [optScale0, optScale1, optScale2, optScale3, optScale4];

  const wrongShakeSV     = useSharedValue(0);
  const wrongShakeStyle  = useAnimatedStyle(() => ({ transform: [{ translateX: wrongShakeSV.value }] }));

  // Summary mode micro-reward animation
  const summaryRewardOpSV = useSharedValue(0);
  const summaryRewardYSV  = useSharedValue(8);
  const summaryRewardStyle2 = useAnimatedStyle(() => ({
    opacity: summaryRewardOpSV.value,
    transform: [{ translateY: summaryRewardYSV.value }],
  }));

  // New: TikTok question transition
  const questionX    = useSharedValue(0);
  const questionOp   = useSharedValue(1);
  // New: correct option glow
  const correctGlowSV = useSharedValue(0);
  // New: combo bar pulse
  const comboPulseSV  = useSharedValue(1);
  // New: Nemi overlay
  const nemiOp        = useSharedValue(0);
  // New: motiv message fade
  const motivFadeOp   = useSharedValue(1);
  // New: result screen entrance
  const resultEntryY  = useSharedValue(36);
  const resultEntryOp = useSharedValue(0);
  // Progress bar fill (animated)
  const progressSV    = useSharedValue(0);

  const questionTransStyle = useAnimatedStyle(() => ({
    opacity:   questionOp.value,
    transform: [{ translateX: questionX.value }],
  }));
  const correctGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: correctGlowSV.value * 0.38,
    shadowRadius:  correctGlowSV.value * 18,
    shadowColor:   BRAND,
    shadowOffset:  { width: 0, height: 0 },
    elevation:     Math.round(correctGlowSV.value * 6),
  }));
  const comboPulseStyle  = useAnimatedStyle(() => ({ transform: [{ scale: comboPulseSV.value }] }));
  const nemiStyle        = useAnimatedStyle(() => ({ opacity: nemiOp.value }));
  const motivFadeStyle   = useAnimatedStyle(() => ({ opacity: motivFadeOp.value }));
  const resultEntryStyle = useAnimatedStyle(() => ({
    opacity:   resultEntryOp.value,
    transform: [{ translateY: resultEntryY.value }],
  }));
  const progressFillStyle = useAnimatedStyle(() => ({ width: `${progressSV.value * 100}%` as any }));
  useEffect(() => {
    if (phase !== 'summary') return;
    slideX.value = SCREEN_W * 0.12;
    slideOpacity.value = 0;
    slideX.value = withSpring(0, { damping: 22, stiffness: 220 });
    slideOpacity.value = withTiming(1, { duration: 240 });
  }, [summaryIdx, phase]);

  // Animate progress bar fill — used by both quiz and flashcards phases
  useEffect(() => {
    if (phase === 'quiz') {
      const filled = quizIdx + (quizStep !== 'answering' ? 1 : 0);
      progressSV.value = withTiming(filled / Math.max(questions.length, 1), { duration: 380, easing: Easing.out(Easing.quad) });
    } else if (phase === 'flashcards') {
      progressSV.value = withTiming((cardIdx + 1) / Math.max(flashcards.length, 1), { duration: 380, easing: Easing.out(Easing.quad) });
    }
  }, [quizIdx, quizStep, phase, questions.length, cardIdx, flashcards.length]);

  // Reset order taps when slide changes
  useEffect(() => { setOrderTaps([]); }, [summaryIdx]);

  // Compute mastery when the victory slide is shown (mission model only)
  useEffect(() => {
    if (phase !== 'summary') return;
    const slide = missionSlides[summaryIdx] as BackendSlide | undefined;
    if (slide?.type !== 'victory') return;
    if (masteryLevel !== null) return; // already computed

    const V_INTER = ['comprehension', 'mini_quiz', 'final_challenge', 'decide', 'order_sequence', 'common_error', 'application', 'challenge', 'wow_fact'];
    const interSlides = missionSlides.map((s, i) => ({ s, i }))
      .filter(({ s }) => V_INTER.includes(s.type) && !!(s as BackendSlide).correctAnswer);
    const interTotal = interSlides.length;
    const interCorrect = interSlides.filter(({ s, i }) =>
      quizAnswers[i] === (s as BackendSlide).correctAnswer
    ).length;
    const pct = interTotal > 0 ? Math.round((interCorrect / interTotal) * 100) : 100;

    const level: 'needs_practice' | 'in_progress' | 'good_mastery' | 'mastered' =
      pct >= 90 ? 'mastered' :
      pct >= 70 ? 'good_mastery' :
      pct >= 40 ? 'in_progress' : 'needs_practice';

    const maxXp = session?.xpReward ?? 100;
    const computed = Math.round(maxXp * pct / 100);
    const computedGems = pct >= 70 ? Math.round((session?.gemReward ?? 10) * pct / 100) : 0;

    setMasteryLevel(level);
    setMasteryPct(pct);
    setEarnedXp(computed);

    // Persist mastery for next-mission flow
    if (currentSessionId) {
      AsyncStorage.setItem(`nemup_mastery_${currentSessionId}`, JSON.stringify({ level, pct })).catch(() => {});
    }

    // Apply performance-based rewards to backend
    const uid = session?.userId;
    if (uid && computed > 0) {
      fetch('https://nemup-production.up.railway.app/sessions/rewards/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, xp: computed, gems: computedGems }),
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryIdx, phase]);

  // Evaluate order_sequence when all items are tapped
  useEffect(() => {
    if (phase !== 'summary' || orderTaps.length === 0) return;
    const slide = missionSlides[summaryIdx] as BackendSlide | undefined;
    if (slide?.type !== 'order_sequence') return;
    const opts = slide.options ?? [];
    if (orderTaps.length < opts.length) return;

    const isCorrect = orderTaps.every((origIdx, pos) => origIdx === pos);
    if (isCorrect) {
      setQuizAnswers(prev => ({ ...prev, [summaryIdx]: 'correct' }));
      // Inline reward animation (showSummaryReward defined after if(!session) return)
      const txt = SUMMARY_REWARDS[Math.floor(Math.random() * SUMMARY_REWARDS.length)];
      setSummaryRewardText(txt);
      summaryRewardOpSV.value = withSequence(
        withSpring(1, { damping: 10, stiffness: 180 }),
        withDelay(700, withTiming(0, { duration: 280 })),
      );
      summaryRewardYSV.value = withSequence(
        withTiming(0, { duration: 200 }),
        withDelay(700, withTiming(8, { duration: 280 })),
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      wrongShakeSV.value = withSequence(
        withTiming(-7, { duration: 55 }), withTiming(7, { duration: 55 }),
        withTiming(-4, { duration: 55 }), withTiming(4, { duration: 55 }),
        withTiming(0,  { duration: 55 }),
      );
      setTimeout(() => setOrderTaps([]), 370);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderTaps]);

  // Motiv message cycling every 4 seconds while answering (FASE 1 / 12)
  useEffect(() => {
    if (phase !== 'quiz' || quizStep !== 'answering') return;
    const t = setInterval(() => {
      motivFadeOp.value = withSequence(
        withTiming(0, { duration: 200 }),
        withTiming(1, { duration: 350 }),
      );
      const msg = pickMotivMsg(quizIdx, questions.length, streak, prevMotivRef.current);
      prevMotivRef.current = msg;
      setTimeout(() => setMotivText(msg), 200);
    }, 4000);
    return () => clearInterval(t);
  }, [phase, quizStep, streak, quizIdx, questions.length]);

  // Result screen entrance animation (FASE 11)
  useEffect(() => {
    if (!quizDone) return;
    resultEntryY.value  = 36;
    resultEntryOp.value = 0;
    resultEntryY.value  = withSpring(0, { damping: 22, stiffness: 180 });
    resultEntryOp.value = withTiming(1, { duration: 420 });
  }, [quizDone]);

  const question      = questions[quizIdx];
  const card          = flashcards[cardIdx];

  if (!session) {
    return <View style={{ flex: 1, backgroundColor: BG }} />;
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
    setStreak(0); setMaxStreak(0); setQuizDone(false); setComboCount(0);
  };

  const handleOption = (optId: string) => {
    if (quizStep !== 'answering') return;
    setSelected(optId);

    // Feedback card slide-in (both cases)
    feedbackY.value = 14;
    feedbackOp.value = 0;
    feedbackY.value = withSpring(0, { damping: 18, stiffness: 200 });
    feedbackOp.value = withTiming(1, { duration: 200 });

    if (optId === question.correctOptionId) {
      const nextCorrect = correctCount + 1;
      const nextStreak  = streak + 1;
      const nextCombo   = comboCount + 1;

      setCorrectCount(nextCorrect);
      setXpEarned(x => x + XP_PER_CORRECT);
      setStreak(nextStreak);
      setMaxStreak(m => Math.max(m, nextStreak));

      // Combo milestone system (FASE 4)
      const milestone = COMBO_MILESTONES[nextCombo];
      if (milestone) {
        setXpEarned(x => x + milestone.xp);
        setMicroMsg(milestone.msg);
        microSV.value = withSequence(
          withSpring(1, { damping: 10, stiffness: 180 }),
          withDelay(1600, withTiming(0, { duration: 300 })),
        );
        comboPulseSV.value = withSequence(
          withSpring(1.1, { damping: 10, stiffness: 380 }),
          withSpring(1,   { damping: 18, stiffness: 280 }),
        );
        setComboCount(nextCombo >= COMBO_SIZE ? 0 : nextCombo);
      } else if (MICRO_REWARD_MSGS[nextCorrect]) {
        setComboCount(nextCombo);
        setMicroMsg(MICRO_REWARD_MSGS[nextCorrect]);
        microSV.value = withSequence(
          withSpring(1, { damping: 10, stiffness: 180 }),
          withDelay(1600, withTiming(0, { duration: 300 })),
        );
      } else {
        setComboCount(nextCombo);
      }

      // Streak badge — fires at every 1–5 (FASE 3)
      const label = STREAK_MESSAGES[Math.min(nextStreak, 5)];
      if (label) {
        setStreakMsg(label);
        streakBadgeSV.value = withSequence(
          withSpring(1, { damping: 12, stiffness: 200 }),
          withDelay(1400, withTiming(0, { duration: 300 })),
        );
      }

      // Floating XP badge (FASE 2)
      xpFloatY.value  = 0;
      xpFloatOp.value = 0;
      xpFloatY.value  = withTiming(-70, { duration: 650, easing: Easing.out(Easing.quad) });
      xpFloatOp.value = withSequence(
        withTiming(1, { duration: 70 }),
        withDelay(300, withTiming(0, { duration: 260 })),
      );

      // Correct option glow (FASE 2)
      correctGlowSV.value = withSequence(
        withTiming(1, { duration: 140 }),
        withDelay(700, withTiming(0, { duration: 400 })),
      );

      setQuizStep('correct');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else {
      setLives(l => Math.max(0, l - 1));
      setComboCount(0);
      setStreak(0);

      // Heart shake
      heartShakeSV.value = withSequence(
        withTiming(-8, { duration: 55 }),
        withTiming(8,  { duration: 55 }),
        withTiming(-5, { duration: 55 }),
        withTiming(5,  { duration: 55 }),
        withTiming(0,  { duration: 55 }),
      );
      // Wrong option shake (250ms)
      wrongShakeSV.value = withSequence(
        withTiming(-6, { duration: 50 }),
        withTiming(6,  { duration: 50 }),
        withTiming(-4, { duration: 50 }),
        withTiming(4,  { duration: 50 }),
        withTiming(0,  { duration: 50 }),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setQuizStep('wrong');
    }
  };

  const handleQuizNext = () => {
    const next = quizIdx + 1;
    if (next >= questions.length) { setQuizDone(true); return; }

    // Pick new motiv message
    const newMotiv = pickMotivMsg(next, questions.length, streak, prevMotivRef.current);
    prevMotivRef.current = newMotiv;

    // Nemi character — max once per 3 questions (FASE 9)
    nextIdxRef.current = next;
    if (next - nemiLastIdxRef.current >= 3 && Math.random() > 0.4) {
      nemiLastIdxRef.current = next;
      setNemiMsg(NEMI_MSGS[next % NEMI_MSGS.length]);
      nemiOp.value = withSequence(
        withDelay(500, withTiming(1, { duration: 320 })),
        withDelay(1900, withTiming(0, { duration: 380 })),
      );
    }

    // TikTok slide-out (FASE 8)
    questionOp.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) });
    questionX.value  = withTiming(-SCREEN_W * 0.28, { duration: 180, easing: Easing.in(Easing.quad) });

    // After exit: update state, then slide in from right
    setTimeout(() => {
      setQuizIdx(next);
      setSelected(null);
      setQuizStep('answering');
      setMotivText(newMotiv);
      correctGlowSV.value = 0;
      questionX.value  = SCREEN_W * 0.28;
      questionOp.value = 0;
      questionX.value  = withSpring(0, { damping: 22, stiffness: 220 });
      questionOp.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    }, 190);
  };

  const handleCardNext = () => {
    const next = cardIdx + 1;
    if (next >= flashcards.length) setCardsDone(true);
    else { setCardIdx(next); setCardFlipped(false); }
  };

  const showSummaryReward = () => {
    const text = SUMMARY_REWARDS[Math.floor(Math.random() * SUMMARY_REWARDS.length)];
    setSummaryRewardText(text);
    summaryRewardOpSV.value = withSequence(
      withSpring(1, { damping: 10, stiffness: 180 }),
      withDelay(700, withTiming(0, { duration: 280 })),
    );
    summaryRewardYSV.value = withSequence(
      withTiming(0, { duration: 200 }),
      withDelay(700, withTiming(8, { duration: 280 })),
    );
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

    return (
      <SafeAreaView style={g.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={g.topBar}>
          <Pressable onPress={() => router.back()} style={g.iconBtn} hitSlop={10}>
            <ArrowLeft size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={lob.xpPill}>
            <Text style={lob.xpPillText}>⚡ +{session.xpReward} XP</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={[g.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <LinearGradient colors={[BRAND, '#8B5CF6', NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={lob.hero}>
            <View style={lob.glow1} /><View style={lob.glow2} />
            <Text style={lob.heroEmoji}>{emoji}</Text>
            <Text style={lob.heroTopic} numberOfLines={2}>{session.topic}</Text>
            <View style={lob.chips}>
              <View style={lob.chip}><Text style={lob.chipText}>⏱ {session.estimatedDuration} min</Text></View>
              <View style={lob.chip}><Text style={lob.chipText}>📝 {questions.length} preguntas</Text></View>
              <View style={lob.chip}><Text style={lob.chipText}>🗂 {flashcards.length} tarjetas</Text></View>
            </View>
          </LinearGradient>

          {/* Rewards */}
          <View style={lob.rewardsRow}>
            <View style={lob.rewardCardPrimary}>
              <Text style={{ fontSize: SM ? 28 : 34 }}>⚡</Text>
              <Text style={[lob.rewardValPrimary, { color: BRAND }]}>{session.xpReward}</Text>
              <Text style={lob.rewardLbl}>XP</Text>
            </View>
            <View style={lob.rewardCardSmall}>
              <Text style={{ fontSize: SM ? 18 : 22 }}>💎</Text>
              <Text style={[lob.rewardVal, { color: Colors.teal }]}>{session.gemReward ?? 10}</Text>
              <Text style={lob.rewardLbl}>GEMAS</Text>
            </View>
            <View style={lob.rewardCardSmall}>
              <Text style={{ fontSize: SM ? 18 : 22 }}>📚</Text>
              <Text style={[lob.rewardVal, { color: Colors.amber }]}>{summarySlides.length}</Text>
              <Text style={lob.rewardLbl}>CONCEPTOS</Text>
            </View>
          </View>

          {/* Missions */}
          <View style={lob.missionCard}>
            <View style={lob.missionHead}>
              <Text style={lob.missionTitle}>📋 Completa esta sesión</Text>
              <Text style={lob.missionCounter}>{done}/3 completados</Text>
            </View>
            {missions.map(m => {
              const isDone = completedModes.has(m.key);
              return (
                <View key={m.key} style={lob.missionRow}>
                  <View style={[lob.missionCheck, isDone && lob.missionCheckDone]}>
                    {isDone && <Check size={9} color="white" strokeWidth={3} />}
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
              <Text style={g.ctaText}>🚀 Empezar a aprender</Text>
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
      { key: 'summary' as const,    emoji: '🎯', title: 'Misión',   desc: 'Lee y comprende los conceptos clave', detail: `${summarySlides.length} conceptos`, xp: XP_PER_SUMMARY * Math.max(summarySlides.length, 1), colors: [BRAND, '#8B5CF6'] as [string,string] },
      { key: 'quiz' as const,       emoji: '🧠', title: 'Quiz',     desc: 'Pon a prueba lo que aprendiste',      detail: `${questions.length} preguntas`, xp: XP_PER_CORRECT * Math.max(questions.length, 1), colors: ['#3B82F6', '#1D4ED8'] as [string,string] },
      { key: 'flashcards' as const, emoji: '🗂️', title: 'Tarjetas', desc: 'Memoriza con tarjetas interactivas',  detail: `${flashcards.length} tarjetas`, xp: XP_PER_CARD * Math.max(flashcards.length, 1), colors: ['#059669', '#047857'] as [string,string] },
    ];
    const goMode = (key: typeof modes[number]['key']) => {
      if (key === 'summary')    { setSummaryIdx(0); setQuizAnswers({}); setPhase('summary'); }
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
    const slides            = missionSlides;
    const slide             = slides[summaryIdx];
    const isLast            = summaryIdx >= slides.length - 1;
    const slideQuizAnswered = slide?.type === 'quiz' ? quizAnswers[summaryIdx] : undefined;
    // Stats for victory screen — computed once, used in victory card renderer and CTA button
    const V_CONCEPT          = ['main_concept', 'key_relation', 'process_flow', 'application', 'common_error', 'challenge'];
    const V_INTER            = ['comprehension', 'mini_quiz', 'final_challenge', 'decide', 'order_sequence', 'common_error', 'application', 'challenge', 'wow_fact'];
    const vConcepts          = slides.filter(s => V_CONCEPT.includes(s.type)).length;
    const vInterTotal        = slides.filter((s, i) => V_INTER.includes(s.type) && !!(s as BackendSlide).correctAnswer).length;
    const vCorrect           = slides.filter((s, i) => V_INTER.includes(s.type) && !!(s as BackendSlide).correctAnswer && quizAnswers[i] === (s as BackendSlide).correctAnswer).length;
    const answeredInteractive = slides.filter((s, i) => V_INTER.includes(s.type) && !!(s as BackendSlide).correctAnswer && !!quizAnswers[i]).length;
    const noInteractionsAttempted = vInterTotal > 0 && answeredInteractive === 0;

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

    // Adaptive correction: insert a conceptual-confusion slide after a wrong answer.
    // Uses the backend-generated wrongAnswerHints — specific explanation for each wrong option.
    // Per REGLA FINAL: skips entirely if no domain-specific hint is available.
    const insertCorrectiveSlide = (_wrongSlide: BackendSlide, _selectedKey: string) => {
      return; // reflexion slides after wrong answers are disabled

      const corrective: BackendSlide = {
        type: 'challenge' as SummarySlideType,
        emoji: '🧠',
        title: `err:${selectedKey}`,
        definition: hint,
        example: null,
        question: null, options: null, correctAnswer: null,
      };
      setMissionSlides(prev => {
        const insertAt = summaryIdx + 1;
        if (prev[insertAt]?.type === 'challenge' && (prev[insertAt] as BackendSlide)?.title?.startsWith('err:')) return prev;
        return [...prev.slice(0, insertAt), corrective as SummarySlide, ...prev.slice(insertAt)];
      });
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
              <Text style={g.screenTitle}>🎯 Misión</Text>
              <Text style={sum.slideCounter}>{summaryIdx + 1} / {slides.length}</Text>
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
            {slide?.type === 'quiz' ? (
              <View style={sum.quizCard}>
                <Text style={sum.quizLabel}>🧠 MINI QUIZ</Text>
                <Text style={sum.quizQuestion}>{slide.question}</Text>
                <View style={{ gap: 8, marginTop: 14 }}>
                  {slide.options.map((opt, i) => {
                    const isCorrect = opt.id === slide.correctId;
                    const showGreen = !!slideQuizAnswered && isCorrect;
                    const showRed   = slideQuizAnswered === opt.id && !isCorrect;
                    const dimmed    = !!slideQuizAnswered && !isCorrect && slideQuizAnswered !== opt.id;
                    return (
                      <Pressable key={opt.id}
                        onPress={() => !slideQuizAnswered && setQuizAnswers(prev => ({ ...prev, [summaryIdx]: opt.id }))}
                        style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                      >
                        <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                          {showGreen ? <Check size={12} color="white" strokeWidth={3} /> :
                           showRed   ? <X    size={12} color="white" strokeWidth={3} /> :
                           <Text style={sum.quizLetterText}>{LETTERS[i]}</Text>}
                        </View>
                        <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>
                          {opt.text}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!!slideQuizAnswered && (
                  <View style={[sum.quizFeedback, slideQuizAnswered === slide.correctId ? sum.quizFeedbackOk : sum.quizFeedbackErr]}>
                    <Text style={sum.quizFeedbackTitle}>{slideQuizAnswered === slide.correctId ? '🎉 ¡Correcto!' : '💡 Casi'}</Text>
                    <Text style={sum.quizFeedbackText}>{slide.explanation}</Text>
                  </View>
                )}
              </View>
            ) : slide?.type === 'prediction' ? (
              <View style={sum.predCard}>
                <Text style={sum.predIcon}>🧠</Text>
                <Text style={sum.predLabel}>PIENSA UN MOMENTO</Text>
                <Text style={sum.predPrompt}>{slide.prompt}</Text>
                <View style={sum.predHintBox}>
                  <Text style={sum.predHintLabel}>Respuesta</Text>
                  <Text style={sum.predHint}>{slide.hint}</Text>
                </View>
              </View>
            ) : slide?.type === 'motivation' ? (
              <View style={sum.motivCard}>
                <Text style={sum.motivEmoji}>{slide.emoji}</Text>
                <Text style={sum.motivMsg}>{slide.message}</Text>
                <Text style={sum.motivSub}>{slide.sub}</Text>
              </View>

            // ── Mission model screens ──────────────────────────────
            ) : slide?.type === 'mission' ? (
              <View style={sum.missionCard}>
                <LinearGradient colors={[BRAND, '#B44EFF']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={sum.missionGrad}>
                  <View style={sum.missionBadge}><Text style={sum.missionBadgeText}>🎯 MISIÓN</Text></View>
                  <Text style={sum.missionEmoji}>{slide.emoji}</Text>
                  <Text style={sum.missionTitle}>{slide.title}</Text>
                  {!!slide.definition && <Text style={sum.missionSub}>{slide.definition}</Text>}
                </LinearGradient>
              </View>
            ) : slide?.type === 'main_concept' ? (
              (() => {
              // Detect step-by-step format: lines starting with "Paso N:" or "Problema:" or "Resultado:"
              const STEP_RE = /^(Problema|Paso\s*\d+|Resultado)\s*:/i;
              const defLines = (slide.definition ?? '').split(/\\n|\n/).map(l => l.trim()).filter(Boolean);
              const isProcedural = defLines.length >= 3 && defLines.some(l => STEP_RE.test(l));
              return (
                <View style={sum.mainCard}>
                  <View style={sum.mainCardHeader}>
                    <Text style={sum.mainCardLabel}>📐 EJEMPLO GUIADO</Text>
                  </View>
                  <View style={sum.mainCardBody}>
                    <Text style={sum.mainCardEmoji}>{slide.emoji}</Text>
                    <Text style={sum.mainCardTitle}>{slide.title}</Text>
                    {slide.connector?.includes('↓') ? (
                      <View style={sum.chainContainer}>
                        {slide.connector.split('↓').map((part, i) => {
                          const text = part.trim();
                          if (!text) return null;
                          return i % 2 === 0 ? (
                            <View key={i} style={sum.chainNode}>
                              <Text style={sum.chainNodeText}>{text}</Text>
                            </View>
                          ) : (
                            <View key={i} style={sum.chainLink}>
                              <Text style={sum.chainLinkArrow}>↓</Text>
                              <Text style={sum.chainLinkText}>{text}</Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : isProcedural ? (
                      <View style={sum.stepsContainer}>
                        {defLines.map((line, i) => {
                          const isResult = /^Resultado\s*:/i.test(line);
                          const isProblem = /^Problema\s*:/i.test(line);
                          const label = line.split(':')[0].trim();
                          const content = line.slice(line.indexOf(':') + 1).trim();
                          return (
                            <View key={i} style={[sum.stepRow, isResult && sum.stepRowResult, isProblem && sum.stepRowProblem]}>
                              <View style={[sum.stepBadge, isResult && sum.stepBadgeResult, isProblem && sum.stepBadgeProblem]}>
                                <Text style={sum.stepBadgeText}>{label}</Text>
                              </View>
                              <Text style={[sum.stepContent, isResult && sum.stepContentResult]}>{content}</Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      !!slide.definition && <Text style={sum.mainCardDef}>{slide.definition}</Text>
                    )}
                    {!!slide.example && (
                      <View style={sum.exampleBox}>
                        <Text style={sum.exampleLabel}>✅ Comprobación</Text>
                        <Text style={sum.exampleText}>{slide.example}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
              })()
            ) : slide?.type === 'comprehension' ? (
              <View style={sum.quizCard}>
                <Text style={[sum.quizLabel, { color: '#7C5AFF' }]}>🧩 COMPRENSIÓN</Text>
                <Text style={sum.quizQuestion}>{slide.question ?? slide.title}</Text>
                <View style={{ gap: 8, marginTop: 14 }}>
                  {slide.options?.map((opt, i) => {
                    const letter    = LETTERS[i];
                    const answered  = quizAnswers[summaryIdx];
                    const isCorrect = slide.correctAnswer === letter;
                    const showGreen = !!answered && isCorrect;
                    const showRed   = answered === letter && !isCorrect;
                    const dimmed    = !!answered && !isCorrect && answered !== letter;
                    return (
                      <Pressable key={i}
                        onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                        style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                      >
                        <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                          {showGreen ? <Check size={12} color="white" strokeWidth={3} /> :
                           showRed   ? <X    size={12} color="white" strokeWidth={3} /> :
                           <Text style={sum.quizLetterText}>{letter}</Text>}
                        </View>
                        <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!!quizAnswers[summaryIdx] && (
                  <View style={[sum.quizFeedback, quizAnswers[summaryIdx] === slide.correctAnswer ? sum.quizFeedbackOk : sum.quizFeedbackErr]}>
                    {quizAnswers[summaryIdx] === slide.correctAnswer ? (
                      <Text style={sum.quizFeedbackTitle}>🎉 ¡Bien! {slide.title}</Text>
                    ) : (
                      <>
                        <Text style={sum.quizFeedbackTitle}>💡 Buena intención</Text>
                        <Text style={sum.quizFeedbackText}>{slide.definition || `La opción correcta era la ${slide.correctAnswer}.`}</Text>
                      </>
                    )}
                  </View>
                )}
              </View>
            ) : slide?.type === 'key_relation' ? (
              <View style={sum.relationCard}>
                <Text style={sum.relationLabel}>🔗 RELACIÓN CLAVE</Text>
                {slide.connector?.includes('↓') ? (
                  <View style={sum.chainContainer}>
                    {slide.connector.split('↓').map((part, i) => {
                      const text = part.trim();
                      if (!text) return null;
                      return i % 2 === 0 ? (
                        <View key={i} style={sum.chainNode}>
                          <Text style={sum.chainNodeText}>{text}</Text>
                        </View>
                      ) : (
                        <View key={i} style={sum.chainLink}>
                          <Text style={sum.chainLinkArrow}>↓</Text>
                          <Text style={sum.chainLinkText}>{text}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={sum.relationRow}>
                    <View style={sum.relationChipA}>
                      <Text style={sum.relationChipText} numberOfLines={2}>{slide.title}</Text>
                    </View>
                    <View style={sum.relationArrow}>
                      <Text style={sum.relationArrowText}>→</Text>
                    </View>
                    <View style={sum.relationChipB}>
                      <Text style={sum.relationChipText} numberOfLines={2}>{slide.example}</Text>
                    </View>
                  </View>
                )}
                {!!slide.definition && <Text style={sum.relationDef}>{slide.definition}</Text>}
              </View>
            ) : slide?.type === 'mini_quiz' ? (
              <View style={sum.quizCard}>
                <Text style={sum.quizLabel}>⚡ MINI QUIZ</Text>
                <Text style={sum.quizQuestion}>{slide.question ?? slide.title}</Text>
                <View style={{ gap: 8, marginTop: 14 }}>
                  {slide.options?.map((opt, i) => {
                    const letter    = LETTERS[i];
                    const answered  = quizAnswers[summaryIdx];
                    const isCorrect = slide.correctAnswer === letter;
                    const showGreen = !!answered && isCorrect;
                    const showRed   = answered === letter && !isCorrect;
                    const dimmed    = !!answered && !isCorrect && answered !== letter;
                    return (
                      <Pressable key={i}
                        onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                        style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                      >
                        <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                          {showGreen ? <Check size={12} color="white" strokeWidth={3} /> :
                           showRed   ? <X    size={12} color="white" strokeWidth={3} /> :
                           <Text style={sum.quizLetterText}>{letter}</Text>}
                        </View>
                        <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!!quizAnswers[summaryIdx] && (
                  <View style={[sum.quizFeedback, quizAnswers[summaryIdx] === slide.correctAnswer ? sum.quizFeedbackOk : sum.quizFeedbackErr]}>
                    {quizAnswers[summaryIdx] === slide.correctAnswer ? (
                      <Text style={sum.quizFeedbackTitle}>🎉 ¡Bien! {slide.title}</Text>
                    ) : (
                      <>
                        <Text style={sum.quizFeedbackTitle}>💡 Buena intención</Text>
                        <Text style={sum.quizFeedbackText}>{slide.definition || `La opción correcta era la ${slide.correctAnswer}.`}</Text>
                      </>
                    )}
                  </View>
                )}
              </View>
            ) : slide?.type === 'process_flow' ? (
              <View style={sum.processCard}>
                <Text style={sum.processLabel}>⚙️ PROCESO</Text>
                <Text style={sum.processTitle}>{slide.title}</Text>
                {!!slide.definition && (
                  <View style={sum.processSteps}>
                    {slide.definition.split('→').map((step, i) => (
                      <View key={i} style={sum.processStep}>
                        <View style={sum.processNum}>
                          <Text style={sum.processNumText}>{i + 1}</Text>
                        </View>
                        <Text style={sum.processStepText}>{step.replace(/^\d+\.\s*/, '').trim()}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {!!slide.example && (
                  <View style={sum.exampleBox}>
                    <Text style={sum.exampleLabel}>📌 Ejemplo</Text>
                    <Text style={sum.exampleText}>{slide.example}</Text>
                  </View>
                )}
              </View>
            ) : slide?.type === 'application' ? (
              <View style={sum.appCard}>
                <View style={sum.appBand}>
                  <Text style={sum.appEmoji}>{slide.emoji}</Text>
                  <Text style={sum.appLabel}>🌍 APLICACIÓN REAL</Text>
                </View>
                <View style={sum.appBody}>
                  <Text style={sum.appTitle}>{slide.title}</Text>
                  {!!slide.definition && <Text style={sum.appSit}>{slide.definition}</Text>}
                  {slide.question && slide.options?.length ? (
                    // Interactive version
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <Text style={sum.quizQuestion}>{slide.question}</Text>
                      {slide.options.map((opt, i) => {
                        const letter = LETTERS[i];
                        const answered = quizAnswers[summaryIdx];
                        const isCorrect = (slide as BackendSlide).correctAnswer === letter;
                        const showGreen = !!answered && isCorrect;
                        const showRed = answered === letter && !isCorrect;
                        const dimmed = !!answered && !isCorrect && answered !== letter;
                        return (
                          <Pressable key={i}
                            onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                            style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                          >
                            <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                              {showGreen ? <Check size={12} color="white" strokeWidth={3} /> :
                               showRed   ? <X    size={12} color="white" strokeWidth={3} /> :
                               <Text style={sum.quizLetterText}>{letter}</Text>}
                            </View>
                            <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                          </Pressable>
                        );
                      })}
                      {!!quizAnswers[summaryIdx] && !!slide.example && (
                        <View style={sum.appAnswerBox}>
                          <Text style={sum.appAnswerLabel}>Cómo aplica</Text>
                          <Text style={sum.appAnswerText}>{slide.example}</Text>
                        </View>
                      )}
                    </View>
                  ) : !!slide.example ? (
                    // Passive version
                    <View style={sum.appAnswerBox}>
                      <Text style={sum.appAnswerLabel}>Cómo aplica</Text>
                      <Text style={sum.appAnswerText}>{slide.example}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : slide?.type === 'common_error' ? (
              // Interactive "find the error" when question + options present
              slide.question && slide.options?.length ? (
                <View style={sum.errorCard}>
                  <View style={sum.errorHeader}>
                    <Text style={sum.errorIcon}>⚠️</Text>
                    <Text style={sum.errorHeaderLabel}>Encuentra el Error</Text>
                  </View>
                  <View style={sum.errorBody}>
                    {!!slide.definition && (
                      <View style={sum.errorWrongBox}>
                        <Text style={sum.errorWrongLabel}>Analiza esta solución</Text>
                        <Text style={sum.errorWrongText}>{slide.definition}</Text>
                      </View>
                    )}
                    <Text style={[sum.quizQuestion, { marginTop: 10 }]}>{slide.question}</Text>
                    <View style={{ gap: 8, marginTop: 8 }}>
                      {slide.options.map((opt, i) => {
                        const letter = LETTERS[i];
                        const answered = quizAnswers[summaryIdx];
                        const isCorrect = slide.correctAnswer === letter;
                        const showGreen = !!answered && isCorrect;
                        const showRed = answered === letter && !isCorrect;
                        const dimmed = !!answered && !isCorrect && answered !== letter;
                        return (
                          <Pressable key={i}
                            onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                            style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                          >
                            <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                              {showGreen ? <Check size={12} color="white" strokeWidth={3} /> :
                               showRed   ? <X    size={12} color="white" strokeWidth={3} /> :
                               <Text style={sum.quizLetterText}>{letter}</Text>}
                            </View>
                            <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {!!quizAnswers[summaryIdx] && !!slide.example && (
                      <View style={[sum.errorRightBox, { marginTop: 10 }]}>
                        <Text style={sum.errorRightLabel}>✅ Solución correcta</Text>
                        <Text style={sum.errorRightText}>{slide.example}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : !slide.definition || !slide.example ? (
                <View style={sum.introCard}>
                  <Text style={sum.slideEmoji}>{slide.emoji}</Text>
                  <Text style={sum.introHeading}>{slide.title}</Text>
                  {!!(slide.definition || slide.example) && (
                    <Text style={sum.introDef}>{slide.definition || slide.example}</Text>
                  )}
                </View>
              ) : (
                <View style={sum.errorCard}>
                  <View style={sum.errorHeader}>
                    <Text style={sum.errorIcon}>⚠️</Text>
                    <Text style={sum.errorHeaderLabel}>Error Común</Text>
                  </View>
                  <View style={sum.errorBody}>
                    <View style={sum.errorWrongBox}>
                      <Text style={sum.errorWrongLabel}>❌ Error frecuente</Text>
                      <Text style={sum.errorWrongText}>{slide.definition}</Text>
                    </View>
                    <View style={sum.errorRightBox}>
                      <Text style={sum.errorRightLabel}>✅ Realidad</Text>
                      <Text style={sum.errorRightText}>{slide.example}</Text>
                    </View>
                  </View>
                </View>
              )
            ) : slide?.type === 'final_challenge' ? (
              <View style={sum.challengeCard}>
                <LinearGradient colors={['#FF7A2B', '#FFB347']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sum.challengeHeader}>
                  <Text style={sum.challengeTrophy}>🏆</Text>
                  <Text style={sum.challengeHeaderLabel}>Desafío Final</Text>
                </LinearGradient>
                <View style={sum.challengeBody}>
                  <Text style={sum.challengeQuestion}>{slide.question ?? slide.title}</Text>
                  <View style={{ gap: 8 }}>
                    {slide.options?.map((opt, i) => {
                      const letter    = LETTERS[i];
                      const answered  = quizAnswers[summaryIdx];
                      const isCorrect = slide.correctAnswer === letter;
                      const showGreen = !!answered && isCorrect;
                      const showRed   = answered === letter && !isCorrect;
                      const dimmed    = !!answered && !isCorrect && answered !== letter;
                      return (
                        <Pressable key={i}
                          onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (slide.correctAnswer !== letter) insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                          style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                        >
                          <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                            {showGreen ? <Check size={12} color="white" strokeWidth={3} /> :
                             showRed   ? <X    size={12} color="white" strokeWidth={3} /> :
                             <Text style={sum.quizLetterText}>{letter}</Text>}
                          </View>
                          <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {!!quizAnswers[summaryIdx] && (
                    <View style={[sum.quizFeedback, quizAnswers[summaryIdx] === slide.correctAnswer ? sum.quizFeedbackOk : sum.quizFeedbackErr]}>
                      {quizAnswers[summaryIdx] === slide.correctAnswer ? (
                        <Text style={sum.quizFeedbackTitle}>🏆 ¡Superado! {slide.title}</Text>
                      ) : (
                        <>
                          <Text style={sum.quizFeedbackTitle}>💡 Buena intención</Text>
                          {!!slide.definition && <Text style={sum.quizFeedbackText}>{slide.definition}</Text>}
                        </>
                      )}
                    </View>
                  )}
                </View>
              </View>
            ) : slide?.type === 'decide' ? (
              <View style={sum.quizCard}>
                <Text style={[sum.quizLabel, { color: '#FF7A2B' }]}>🤔 DECIDE</Text>
                <Text style={sum.quizQuestion}>{slide.question ?? slide.title}</Text>
                <View style={{ gap: 8, marginTop: 14 }}>
                  {slide.options?.map((opt, i) => {
                    const letter    = LETTERS[i];
                    const answered  = quizAnswers[summaryIdx];
                    const isCorrect = slide.correctAnswer === letter;
                    const showGreen = !!answered && isCorrect;
                    const showRed   = answered === letter && !isCorrect;
                    const dimmed    = !!answered && !isCorrect && answered !== letter;
                    return (
                      <Pressable key={i}
                        onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                        style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                      >
                        <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                          {showGreen ? <Check size={12} color="white" strokeWidth={3} /> :
                           showRed   ? <X    size={12} color="white" strokeWidth={3} /> :
                           <Text style={sum.quizLetterText}>{letter}</Text>}
                        </View>
                        <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!!quizAnswers[summaryIdx] && (
                  <View style={[sum.quizFeedback, quizAnswers[summaryIdx] === slide.correctAnswer ? sum.quizFeedbackOk : sum.quizFeedbackErr]}>
                    {quizAnswers[summaryIdx] === slide.correctAnswer ? (
                      <Text style={sum.quizFeedbackTitle}>🎉 ¡Buena decisión!</Text>
                    ) : (
                      <>
                        <Text style={sum.quizFeedbackTitle}>💡 Buena intención</Text>
                        <Text style={sum.quizFeedbackText}>{slide.definition || `La opción correcta era la ${slide.correctAnswer}.`}</Text>
                      </>
                    )}
                  </View>
                )}
              </View>
            ) : slide?.type === 'order_sequence' ? (
              // IIFE to define local shuffle vars inline
              (() => {
                const opts = (slide as BackendSlide).options ?? [];
                // Deterministic shuffle seeded on summaryIdx so it's stable across re-renders
                const shuffled: number[] = opts.map((_, i) => i);
                let seed = ((summaryIdx + 1) * 137 + 7) >>> 0;
                for (let k = shuffled.length - 1; k > 0; k--) {
                  seed = (seed * 1664525 + 1013904223) >>> 0;
                  const j = seed % (k + 1);
                  [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
                }
                const answered = quizAnswers[summaryIdx];
                return (
                  <Animated.View style={[sum.orderCard, wrongShakeStyle]}>
                    <Text style={sum.orderLabel}>🔀 ORDENA LA SECUENCIA</Text>
                    <Text style={sum.orderTitle}>{(slide as BackendSlide).title}</Text>
                    <Text style={sum.orderHint}>
                      {answered === 'correct'
                        ? '✅ ¡Secuencia correcta!'
                        : orderTaps.length === 0
                          ? 'Toca los pasos en el orden correcto.'
                          : `${orderTaps.length} / ${opts.length} seleccionados`}
                    </Text>
                    <View style={sum.orderItems}>
                      {shuffled.map((origIdx, displayPos) => {
                        const tapPos = orderTaps.indexOf(origIdx);
                        const isSelected = tapPos !== -1;
                        const isDone = answered === 'correct';
                        return (
                          <Pressable
                            key={displayPos}
                            onPress={() => {
                              if (isDone) return;
                              if (isSelected) {
                                // Deselect this and all after it
                                setOrderTaps(prev => prev.slice(0, tapPos));
                              } else {
                                setOrderTaps(prev => [...prev, origIdx]);
                              }
                            }}
                            style={[
                              sum.orderItem,
                              isSelected && (isDone ? sum.orderItemCorrect : sum.orderItemSelected),
                            ]}
                          >
                            <View style={[sum.orderNum, isSelected && (isDone ? sum.orderNumCorrect : sum.orderNumSelected)]}>
                              {isSelected
                                ? <Text style={sum.orderNumTxt}>{tapPos + 1}</Text>
                                : <Text style={sum.orderNumTxtMuted}>?</Text>}
                            </View>
                            <Text style={[sum.orderItemTxt, isSelected && sum.orderItemTxtSelected]}>
                              {opts[origIdx]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {answered === 'correct' && (
                      <View style={sum.orderSuccessRow}>
                        <Text style={sum.orderSuccessTxt}>¡Aprendiste el orden! 🎉</Text>
                      </View>
                    )}
                  </Animated.View>
                );
              })()
            ) : slide?.type === 'challenge' ? (
              slide.question && slide.options?.length ? (
                // Interactive version
                <View style={sum.challengeRefCard}>
                  <Text style={sum.challengeRefEmoji}>🤔</Text>
                  <Text style={sum.challengeRefLabel}>REFLEXIONA</Text>
                  {!!slide.definition && <Text style={sum.challengeRefQ}>{slide.definition}</Text>}
                  <View style={{ gap: 8, marginTop: 10, width: '100%' }}>
                    <Text style={sum.quizQuestion}>{slide.question}</Text>
                    {slide.options.map((opt, i) => {
                      const letter = LETTERS[i];
                      const answered = quizAnswers[summaryIdx];
                      const isCorrect = (slide as BackendSlide).correctAnswer === letter;
                      const showGreen = !!answered && isCorrect;
                      const showRed = answered === letter && !isCorrect;
                      const dimmed = !!answered && !isCorrect && answered !== letter;
                      return (
                        <Pressable key={i}
                          onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                          style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                        >
                          <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                            {showGreen ? <Check size={12} color="white" strokeWidth={3} /> :
                             showRed   ? <X    size={12} color="white" strokeWidth={3} /> :
                             <Text style={sum.quizLetterText}>{letter}</Text>}
                          </View>
                          <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                        </Pressable>
                      );
                    })}
                    {!!quizAnswers[summaryIdx] && !!slide.example && (
                      <View style={sum.challengeRefHintBox}>
                        <Text style={sum.challengeRefHintLbl}>Reflexión</Text>
                        <Text style={sum.challengeRefHintTxt}>{slide.example}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                // Passive version
                <View style={sum.challengeRefCard}>
                  <Text style={sum.challengeRefEmoji}>🤔</Text>
                  <Text style={sum.challengeRefLabel}>REFLEXIONA</Text>
                  <Text style={sum.challengeRefQ}>{slide.definition || slide.title}</Text>
                  {!!slide.example && (
                    <View style={sum.challengeRefHintBox}>
                      <Text style={sum.challengeRefHintLbl}>Pista</Text>
                      <Text style={sum.challengeRefHintTxt}>{slide.example}</Text>
                    </View>
                  )}
                </View>
              )
            ) : slide?.type === 'victory' ? ((() => {
              // Labels per spec: Dominado / Buen dominio / Vas avanzando / Necesita más práctica
              const masteryConfig = masteryLevel === 'mastered'
                ? { bg: 'rgba(5,150,105,0.12)', border: 'rgba(5,150,105,0.3)', color: '#065F46', label: '🏆 Dominado', sub: `${masteryPct ?? 100}% correcto` }
                : masteryLevel === 'good_mastery'
                ? { bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.3)', color: '#1E40AF', label: '📈 Buen dominio', sub: `${masteryPct ?? 0}% correcto` }
                : masteryLevel === 'in_progress'
                ? { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.3)', color: '#92400E', label: '🔄 Vas avanzando', sub: `${masteryPct ?? 0}% correcto` }
                : masteryLevel === 'needs_practice'
                ? { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', color: '#991B1B', label: '💪 Necesita más práctica', sub: `${masteryPct ?? 0}% correcto` }
                : null;

              // Reflection — based on slides actually ANSWERED wrong (not unanswered)
              const V_INTER_LOCAL = ['comprehension', 'mini_quiz', 'final_challenge', 'decide', 'order_sequence', 'common_error', 'application', 'challenge', 'wow_fact'];
              const wrongSlides = missionSlides
                .map((s, i) => ({ s: s as BackendSlide, i }))
                .filter(({ s, i }) =>
                  V_INTER_LOCAL.includes(s.type) &&
                  !!s.correctAnswer &&
                  !!quizAnswers[i] &&
                  quizAnswers[i] !== s.correctAnswer
                );
              const reflectionMsg: string | null = noInteractionsAttempted || wrongSlides.length === 0
                ? null
                : wrongSlides.length === 1
                ? `La pregunta "${(wrongSlides[0].s.question ?? '').slice(0, 50)}..." fue la más difícil. Repásala antes de seguir.`
                : `Repasa especialmente: "${(wrongSlides[0].s.question ?? '').slice(0, 40)}..."${wrongSlides.length > 1 ? ` y "${(wrongSlides[1].s.question ?? '').slice(0, 40)}..."` : ''}.`;

              // "Aprendiste" → "Conceptos trabajados" when performance is insufficient
              const victoryDefinition = (() => {
                if (!slide.definition) return null;
                if (noInteractionsAttempted) return null;
                const pct = masteryPct ?? 100;
                if (pct >= 70) return slide.definition;
                return slide.definition.replace(/^(✓\s*)?Aprendiste:?\s*/i, 'Conceptos trabajados: ');
              })();

              // Victory note: only first part of example (no cross-mission "Próximo desafío")
              const victoryNote = (() => {
                if (!slide.example) return null;
                if (noInteractionsAttempted) return null;
                return slide.example.split(' | ')[0].trim();
              })();
              // Skill path context
              const currentMissionIdx = skillPath?.missions?.findIndex(m => m.sessionId === currentSessionId) ?? -1;
              const currentSkillLabel = skillPath && currentMissionIdx >= 0
                ? (skillPath.missions[currentMissionIdx]?.skillLabel ?? null)
                : null;
              const nextMission = skillPath && currentMissionIdx >= 0 && currentMissionIdx < skillPath.missions.length - 1
                ? skillPath.missions[currentMissionIdx + 1]
                : null;
              const missionProgress = skillPath && skillPath.totalMissions > 1 && currentMissionIdx >= 0
                ? `Misión ${currentMissionIdx + 1} de ${skillPath.totalMissions}`
                : null;
              const loadNextMission = async () => {
                if (!nextMission) return;
                const nextSession = nextMission.session as Session | undefined;
                if (!nextSession) return;
                const newKey = Date.now().toString();
                await AsyncStorage.multiSet([
                  ['nemup_last_session', JSON.stringify(nextSession)],
                  ['nemup_session_key', newKey],
                  ['nemup_last_session_id', nextMission.sessionId],
                ]);
                // Keep skill path as-is (same path, next mission)
                // Reset game state and reload
                loadedSessionKeyRef.current = null; // force reload on next focus
                setSession(nextSession);
                setCurrentSessionId(nextMission.sessionId);
                setMasteryLevel(null);
                setMasteryPct(null);
                setEarnedXp(null);
                setPhase('lobby');
                setCompleted(new Set());
                setSummaryIdx(0);
                setQuizAnswers({});
                setQuizIdx(0);
                setSelected(null);
                setQuizStep('answering');
                setLives(MAX_LIVES);
                setXpEarned(0);
                setCorrectCount(0);
                setStreak(0);
                setMaxStreak(0);
                setQuizDone(false);
                setComboCount(0);
                setStreakMsg('');
                setMicroMsg('');
                setSummaryRewardText(null);
                setOrderTaps([]);
                setNemiMsg('');
                setMotivText(MOTIV_POOLS.start[0]);
                setCardIdx(0);
                setCardFlipped(false);
                setCardsDone(false);
                loadedSessionKeyRef.current = newKey;
              };
              // Override victory title to be consistent with actual performance
              const effectiveVictoryTitle = (() => {
                if (noInteractionsAttempted) return '¡Intento registrado!';
                if (vInterTotal === 0) return slide.title;
                const pct = masteryPct ?? 100;
                if (pct < 30) return '¡Misión completada!';
                return slide.title;
              })();

              return (
              <View style={sum.victoryCard}>
                <Text style={sum.victoryEmoji}>{slide.emoji}</Text>
                <Text style={sum.victoryTitle}>{effectiveVictoryTitle}</Text>
                {/* Mission progress indicator */}
                {!!missionProgress && (
                  <Text style={sum.missionProgress}>{missionProgress}</Text>
                )}
                {/* Skill dominance chip — only when evidence of learning exists */}
                {!!currentSkillLabel && !noInteractionsAttempted && (masteryPct ?? 0) >= 70 && (
                  <View style={sum.skillDominatedChip}>
                    <Text style={sum.skillDominatedText}>✓ Dominaste: {currentSkillLabel}</Text>
                  </View>
                )}
                {/* "Conceptos trabajados" / "Aprendiste" — suppressed when no interactions */}
                {!!victoryDefinition && <Text style={sum.victorySub}>{victoryDefinition}</Text>}

                {noInteractionsAttempted ? (
                  /* CASO 1: Sin respuestas — no hay evidencia de aprendizaje */
                  <View style={sum.noInteractionBlock}>
                    <Text style={sum.noInteractionText}>
                      Recorriste el contenido, pero no respondiste actividades suficientes para evaluar tu comprensión.
                    </Text>
                    <View style={sum.noInteractionStats}>
                      <View style={sum.victoryStat}>
                        <Text style={sum.victoryStatVal}>{slides.length}</Text>
                        <Text style={sum.victoryStatLbl}>pantallas</Text>
                      </View>
                      <View style={sum.victoryStat}>
                        <Text style={[sum.victoryStatVal, { color: Colors.muted }]}>0/{vInterTotal}</Text>
                        <Text style={sum.victoryStatLbl}>respondidas</Text>
                      </View>
                      <View style={sum.victoryStat}>
                        <Text style={[sum.victoryStatVal, { color: Colors.muted }]}>+0</Text>
                        <Text style={sum.victoryStatLbl}>XP</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  /* CASO 2-4: Hay respuestas — mostrar desempeño real */
                  <>
                    {/* Mastery badge */}
                    {!!masteryConfig && (
                      <View style={[sum.masteryBadge, { backgroundColor: masteryConfig.bg, borderColor: masteryConfig.border }]}>
                        <Text style={[sum.masteryBadgeText, { color: masteryConfig.color }]}>{masteryConfig.label}</Text>
                        <Text style={[sum.masteryBadgeSub, { color: masteryConfig.color }]}>{masteryConfig.sub}</Text>
                      </View>
                    )}
                    {/* Performance stats */}
                    <View style={sum.victoryStats}>
                      <View style={sum.victoryStatRow}>
                        <View style={sum.victoryStat}>
                          <Text style={sum.victoryStatVal}>{vConcepts}</Text>
                          <Text style={sum.victoryStatLbl}>conceptos</Text>
                        </View>
                        <View style={sum.victoryStat}>
                          <Text style={[sum.victoryStatVal, { color: '#059669' }]}>{vCorrect}/{vInterTotal}</Text>
                          <Text style={sum.victoryStatLbl}>correctas</Text>
                        </View>
                        <View style={sum.victoryStat}>
                          <Text style={[sum.victoryStatVal, { color: BRAND }]}>+{earnedXp ?? 0}</Text>
                          <Text style={sum.victoryStatLbl}>XP</Text>
                        </View>
                        <View style={sum.victoryStat}>
                          <Text style={[sum.victoryStatVal, { color: '#FF7A2B' }]}>+{(masteryPct ?? 0) >= 70 ? Math.round((session.gemReward ?? 10) * (masteryPct ?? 0) / 100) : 0}</Text>
                          <Text style={sum.victoryStatLbl}>💎</Text>
                        </View>
                      </View>
                    </View>
                    {/* "Lo usarás..." note — first part only, no cross-mission recommendations */}
                    {!!victoryNote && <Text style={sum.victoryNote}>{victoryNote}</Text>}
                    {/* Intelligent reflection — only for answered-wrong slides */}
                    {!!reflectionMsg && (
                      <View style={sum.reflectionBlock}>
                        <Text style={sum.reflectionText}>{reflectionMsg}</Text>
                      </View>
                    )}
                  </>
                )}
                {/* Next mission button — skill transition */}
                {!!nextMission && (
                  <View style={sum.nextMissionWrapper}>
                    <Text style={sum.nextMissionLabel}>Siguiente habilidad</Text>
                    <Pressable onPress={loadNextMission} style={sum.nextMissionBtn}>
                      <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sum.nextMissionGrad}>
                        <Text style={sum.nextMissionText}>
                          ⚡ {nextMission.skillLabel ?? 'Próxima misión'}
                        </Text>
                        <Text style={sum.nextMissionArrow}>Continuar →</Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                )}
                {/* Upcoming missions from path — only when this session belongs to the path */}
                {skillPath && skillPath.totalMissions > 1 && currentMissionIdx >= 0 && (
                  <View style={sum.upcomingBlock}>
                    {skillPath.missions.map((m, i) => {
                      const isCurrent = m.sessionId === currentSessionId;
                      const isPast = i < currentMissionIdx;
                      return (
                        <View key={i} style={[sum.upcomingRow, isCurrent && sum.upcomingRowCurrent]}>
                          <Text style={sum.upcomingDot}>{isPast ? '✓' : isCurrent ? '▶' : `${i + 1}`}</Text>
                          <Text style={[sum.upcomingLabel, isPast && sum.upcomingLabelDone, isCurrent && sum.upcomingLabelCurrent]} numberOfLines={1}>
                            {m.skillLabel ?? `Misión ${i + 1}`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
              );
            })()

            // ── Legacy screens ────────────────────────────────────
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
              <View style={[sum.wowCard, slide.question && { padding: SM ? 18 : 22 }]}>
                <Text style={sum.wowEmoji}>🤯</Text>
                <Text style={sum.wowLabel}>¿SABÍAS QUE?</Text>
                <Text style={sum.wowText}>{slide.definition}</Text>
                {slide.question && slide.options && (
                  <View style={{ gap: 8, marginTop: 20, alignSelf: 'stretch' }}>
                    <Text style={[sum.quizQuestion, { fontSize: SM ? 13 : 14 }]}>{slide.question}</Text>
                    {slide.options.map((opt, i) => {
                      const letter    = LETTERS[i];
                      const answered  = quizAnswers[summaryIdx];
                      const isCorrect = slide.correctAnswer === letter;
                      const showGreen = !!answered && isCorrect;
                      const showRed   = answered === letter && !isCorrect;
                      const dimmed    = !!answered && !isCorrect && answered !== letter;
                      return (
                        <Pressable key={i}
                          onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                          style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                        >
                          <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                            {showGreen ? <Check size={12} color="white" strokeWidth={3} /> :
                             showRed   ? <X    size={12} color="white" strokeWidth={3} /> :
                             <Text style={sum.quizLetterText}>{letter}</Text>}
                          </View>
                          <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                        </Pressable>
                      );
                    })}
                    {!!quizAnswers[summaryIdx] && (
                      <View style={[sum.quizFeedback, quizAnswers[summaryIdx] === slide.correctAnswer ? sum.quizFeedbackOk : sum.quizFeedbackErr]}>
                        <Text style={sum.quizFeedbackTitle}>
                          {quizAnswers[summaryIdx] === slide.correctAnswer ? '🤯 ¡Exacto!' : '💡 Buena intención'}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : slide?.type === 'example' ? (
              <View style={sum.scenarioCard}>
                <View style={sum.scenarioBand}>
                  <Text style={sum.scenarioEmoji}>{slide.emoji}</Text>
                  <Text style={sum.scenarioLabel}>📌 EJEMPLO PRÁCTICO</Text>
                </View>
                <View style={sum.scenarioBody}>
                  <Text style={sum.scenarioTitle}>{slide.title}</Text>
                  {!!slide.definition && <Text style={sum.scenarioDef}>{slide.definition}</Text>}
                  {!!slide.example && <Text style={sum.scenarioEx}>{slide.example}</Text>}
                </View>
              </View>
            ) : !slide?.title?.trim() && !slide?.definition?.trim() ? (
              <View style={sum.kpCard}>
                {(() => { console.warn(`[Session] Empty slide at index ${summaryIdx}: type=${slide?.type ?? 'unknown'}`); return null; })()}
                <Text style={sum.kpEmoji}>⚠️</Text>
                <Text style={sum.kpTitle}>Contenido no disponible</Text>
              </View>
            ) : (
              <View style={[sum.kpCard, { backgroundColor: SLIDE_STYLE[slide?.type ?? '']?.bg ?? 'rgba(91,61,245,0.08)', borderLeftColor: SLIDE_STYLE[slide?.type ?? '']?.accent ?? BRAND }]}>
                <Text style={sum.kpEmoji}>{slide?.emoji}</Text>
                <Text style={[sum.kpLabel, { color: SLIDE_STYLE[slide?.type ?? '']?.accent ?? BRAND }]}>{SLIDE_STYLE[slide?.type ?? '']?.label}</Text>
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

            {/* Summary mode micro-reward overlay */}
            {!!summaryRewardText && (
              <Animated.View style={[sum.summaryRewardOverlay, summaryRewardStyle2]} pointerEvents="none">
                <View style={sum.summaryRewardBadge}>
                  <Text style={sum.summaryRewardBadgeTxt}>{summaryRewardText}</Text>
                </View>
              </Animated.View>
            )}
          </Animated.View>

          {/* CTA */}
          <View style={[g.bottom, { paddingBottom: insets.bottom + 12 }]}>
            {((slide?.type === 'quiz' && !slideQuizAnswered) ||
              ((slide?.type === 'comprehension' || slide?.type === 'mini_quiz' || slide?.type === 'final_challenge' || slide?.type === 'decide' || slide?.type === 'order_sequence' || (slide?.type === 'common_error' && !!slide.question) || (slide?.type === 'wow_fact' && !!slide.question) || (slide?.type === 'application' && !!slide.question) || (slide?.type === 'challenge' && !!slide.question)) && !quizAnswers[summaryIdx])) ? (
              <View style={g.ctaBtnOff}>
                <Text style={g.ctaTextOff}>Elige una opción</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => isLast ? completeMode('summary') : goNext()}
                style={{ width: '100%' }}
              >
                <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={g.ctaBtn}>
                  <Text style={g.ctaText}>
                    {isLast && slide?.type === 'victory' ? (noInteractionsAttempted ? 'Cerrar misión' : '🏆 ¡Misión completada!') :
                     isLast ? '✅ Completar resumen' :
                     slide?.type === 'mission' ? '¡Comenzar! →' :
                     (slide?.type === 'challenge' && !(slide as BackendSlide).correctAnswer) ? '🤔 Lo pensé →' :
                     slide?.type === 'decide' ? '✅ Decidido →' :
                     slide?.type === 'motivation' ? '¡Seguimos! →' :
                     slide?.type === 'prediction' ? '🧠 Entendido →' :
                     'Siguiente →'}
                  </Text>
                </LinearGradient>
              </Pressable>
            )}
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
          <Animated.View style={[{ flex: 1 }, resultEntryStyle]}>
            <ScrollView contentContainerStyle={[qz.resultScroll, { paddingBottom: insets.bottom + 24 }]}>
              <Text style={qz.resultEmoji}>{acc >= 80 ? '🏆' : acc >= 50 ? '🎯' : '💪'}</Text>
              <Text style={qz.resultTitle}>{acc >= 80 ? '¡Increíble!' : acc >= 50 ? '¡Buen trabajo!' : 'Sigue practicando'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 20 }}>
                <AnimatedCounter to={correctCount} delay={0} style={qz.resultScore} />
                <Text style={[qz.resultScore, { color: Colors.muted, fontSize: 32, fontWeight: '600' }]}>/{questions.length}</Text>
              </View>
              <View style={qz.resultGrid}>
                {([
                  { e: '⚡', to: xpEarned, prefix: '+', suffix: '',  l: 'XP ganados', color: BRAND,        delay: 80  },
                  { e: '🔥', to: maxStreak, prefix: '',  suffix: '×', l: 'Racha máx.', color: Colors.rose,  delay: 240 },
                  { e: '🎯', to: acc,       prefix: '',  suffix: '%', l: 'Precisión',  color: Colors.teal,  delay: 400 },
                ] as const).map(({ e, to, prefix, suffix, l, color, delay }) => (
                  <View key={l} style={qz.resultCell}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                    <AnimatedCounter to={to} delay={delay} prefix={prefix} suffix={suffix} style={[qz.resultCellVal, { color }]} />
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
          </Animated.View>
        </SafeAreaView>
      );
    }

    const isLastQuestion = quizIdx >= questions.length - 1;

    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        {/* Floating XP badge (FASE 2) */}
        <Animated.View style={[{ position: 'absolute', zIndex: 100, alignSelf: 'center', top: SCREEN_H * 0.38 }, xpFloatStyle]} pointerEvents="none">
          <View style={qz.xpFloat}><Text style={qz.xpFloatText}>⚡ +{XP_PER_CORRECT} XP</Text></View>
        </Animated.View>

        {/* Streak badge (FASE 3) */}
        <Animated.View style={[{ position: 'absolute', zIndex: 100, alignSelf: 'center', top: SCREEN_H * 0.22 }, streakBadgeStyle]} pointerEvents="none">
          <View style={qz.streakBadge}><Text style={qz.streakBadgeText}>{streakMsg}</Text></View>
        </Animated.View>

        {/* Combo / micro reward badge (FASE 4) */}
        <Animated.View style={[{ position: 'absolute', zIndex: 100, alignSelf: 'center', top: SCREEN_H * 0.44 }, microRewardStyle]} pointerEvents="none">
          <View style={qz.microBadge}><Text style={qz.microBadgeText}>{microMsg}</Text></View>
        </Animated.View>

        {/* Nemi character (FASE 9) */}
        <Animated.View style={[{ position: 'absolute', zIndex: 99, right: 16, bottom: insets.bottom + 130 }, nemiStyle]} pointerEvents="none">
          <View style={qz.nemiWidget}>
            <Text style={qz.nemiLabel}>🧠 Nemi</Text>
            <Text style={qz.nemiText}>{nemiMsg}</Text>
          </View>
        </Animated.View>

        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Stats bar — Streak + Lives | Progress | XP */}
          <View style={qz.statsBar}>
            <Animated.View style={[qz.chip, heartShakeStyle]}>
              <Text style={{ fontSize: 14 }}>🔥</Text>
              <Text style={qz.chipVal}>{streak}</Text>
              <View style={{ flexDirection: 'row', gap: 3, marginLeft: 2 }}>
                {Array.from({ length: MAX_LIVES }).map((_, i) => (
                  <View key={i} style={[qz.heartDot, i < lives && qz.heartDotActive]} />
                ))}
              </View>
            </Animated.View>
            {/* Animated progress bar — glow on last question */}
            <View style={[qz.chip, { flex: 1.8, gap: 6 }, isLastQuestion && qz.chipLastQ]}>
              <View style={qz.progressTrack}>
                <Animated.View style={[qz.progressFill, progressFillStyle]} />
              </View>
              <Text style={qz.counter}>{quizIdx + 1}/{questions.length}</Text>
            </View>
            <View style={qz.chip}>
              <Text style={{ fontSize: 14 }}>⚡</Text>
              <Text style={qz.chipVal}>{xpEarned}</Text>
              <Text style={qz.chipLbl}>XP</Text>
            </View>
          </View>

          {/* Motiv message — second row */}
          <Animated.Text style={[qz.motivMsg, motivFadeStyle]}>{motivText}</Animated.Text>

          <ScrollView contentContainerStyle={[qz.scroll, { paddingBottom: 8 }]} showsVerticalScrollIndicator={false}>
            {/* Question card + options wrapped in TikTok transition (FASE 8) */}
            <Animated.View style={questionTransStyle}>
              <View style={qz.questionCard}>
                <View style={qz.questionMeta}>
                  <Text style={qz.questionChip}>🧠 Pregunta {quizIdx + 1}</Text>
                  {isLastQuestion && <Text style={qz.lastQChip}>🏁 Última</Text>}
                </View>
                <Text style={qz.questionText}>{question?.text}</Text>
              </View>

              {/* Options (FASE 5) */}
              <View style={{ gap: 8, marginBottom: 10 }}>
                {question?.options.map((opt, i) => {
                  const letter    = LETTERS[i] ?? String(i + 1);
                  const isCorrect = opt.id === question.correctOptionId;
                  const isWrong   = quizStep !== 'answering' && selected === opt.id && !isCorrect;
                  const showBrand = quizStep !== 'answering' && isCorrect;
                  const dimmed    = quizStep !== 'answering' && !isCorrect && !isWrong;
                  const baseAnim  = i < optAnimStyles.length ? optAnimStyles[i] : undefined;
                  return (
                    <Animated.View
                      key={opt.id}
                      style={
                        isWrong   ? [baseAnim, wrongShakeStyle] :
                        showBrand ? [baseAnim, correctGlowStyle] :
                        baseAnim
                      }
                    >
                      <Pressable
                        onPress={() => {
                          if (quizStep !== 'answering') return;
                          const sv = optScaleArr[i];
                          if (sv) {
                            sv.value = withSequence(
                              withTiming(0.97, { duration: 75 }),
                              withSpring(1.02, { damping: 12, stiffness: 420 }),
                              withSpring(1,    { damping: 18, stiffness: 300 }),
                            );
                          }
                          handleOption(opt.id);
                        }}
                        disabled={quizStep !== 'answering'}
                        style={[
                          qz.option,
                          showBrand && qz.optCorrect,
                          isWrong   && qz.optWrong,
                          { opacity: dimmed ? 0.32 : 1 },
                        ]}
                      >
                        <View style={[qz.optLetter, showBrand && qz.optLetterCorrect, isWrong && qz.optLetterRed]}>
                          {showBrand ? <Check size={13} color="white" strokeWidth={3} /> :
                           isWrong   ? <X    size={13} color="white" strokeWidth={3} /> :
                           <Text style={[qz.optLetterText, selected === opt.id && quizStep === 'answering' && { color: BRAND, fontWeight: '900' }]}>{letter}</Text>}
                        </View>
                        <Text style={[
                          qz.optText,
                          showBrand && { color: BRAND, fontWeight: '700' },
                          isWrong   && { color: Colors.muted },
                        ]}>
                          {opt.text}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            </Animated.View>

            {/* Feedback strip — compact */}
            {quizStep !== 'answering' && question?.explanation ? (
              <Animated.View style={[qz.feedback, quizStep === 'correct' ? qz.feedbackOk : qz.feedbackFail, feedbackStyle]}>
                <View style={qz.feedbackHeader}>
                  <Text style={qz.feedbackTitle}>
                    {quizStep === 'correct' ? '🎯 Correcto' : '💪 Casi'}
                  </Text>
                  {quizStep === 'correct' && (
                    <View style={qz.feedbackXP}>
                      <Text style={qz.feedbackXPText}>+{XP_PER_CORRECT} XP</Text>
                    </View>
                  )}
                </View>
                <Text style={qz.feedbackText} numberOfLines={2}>{question.explanation}</Text>
              </Animated.View>
            ) : null}
          </ScrollView>

          {/* CTA — always BRAND/NEON, dynamic text (FASE 10) */}
          <View style={[g.bottom, { paddingBottom: insets.bottom + 12 }]}>
            {quizStep !== 'answering' ? (
              <Pressable onPress={handleQuizNext} style={{ width: '100%' }}>
                <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={g.ctaBtn}>
                  <Text style={g.ctaText}>
                    {isLastQuestion
                      ? '🏆 Ver resultados'
                      : quizStep === 'correct'
                        ? '🚀 Continuar'
                        : '🔁 Intentar otra vez'}
                  </Text>
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
              <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={g.ctaBtn}>
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
              <ChevronLeft size={18} color={Colors.ink} strokeWidth={2.5} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={g.screenTitle}>🗂️ Tarjetas</Text>
              <Text style={sum.slideCounter}>{cardIdx + 1} / {flashcards.length}</Text>
            </View>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <X size={16} color={Colors.ink} strokeWidth={2.5} />
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 14, marginBottom: 4 }}>
            <View style={qz.progressTrack}>
              <Animated.View style={[qz.progressFill, progressFillStyle]} />
            </View>
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
                { label: '✅\nLo sabía',    colors: [BRAND, NEON] as [string,string] },
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
    const modeLabel = { summary: 'Misión', quiz: 'Quiz', flashcards: 'Tarjetas' }[celebSrc];
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
  xpPill:     { backgroundColor: '#F3EEFF', borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12 },
  xpPillText: { fontSize: SM ? 12 : 13, fontWeight: '800', color: '#6C4DFF' },
  hero:       { borderRadius: 28, paddingVertical: SM ? 18 : 22, paddingHorizontal: 24, marginBottom: 14, overflow: 'hidden', alignItems: 'center' },
  glow1:      { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,91,159,0.2)', top: -60, right: -60 },
  glow2:      { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(196,248,82,0.15)', bottom: -50, left: -40 },
  heroEmoji:  { fontSize: SM ? 52 : 64, marginBottom: 8 },
  heroTopic:  { fontSize: SM ? 20 : 24, fontWeight: '900', color: 'white', textAlign: 'center', letterSpacing: -0.5, lineHeight: SM ? 26 : 32, marginBottom: 14 },
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip:       { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  chipText:   { color: 'white', fontSize: 11, fontWeight: '600' },
  rewardsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  rewardCardPrimary: { flex: 1.4, backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, paddingVertical: SM ? 12 : 16, paddingHorizontal: 8, alignItems: 'center', gap: 2, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  rewardCardSmall:   { flex: 1, backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, paddingVertical: SM ? 10 : 12, paddingHorizontal: 6, alignItems: 'center', gap: 2, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  rewardCard: { flex: 1, backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, padding: SM ? 10 : 14, alignItems: 'center', gap: 2, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  rewardValPrimary: { fontSize: SM ? 24 : 28, fontWeight: '900', letterSpacing: -0.5 },
  rewardVal:  { fontSize: SM ? 16 : 20, fontWeight: '900', letterSpacing: -0.5 },
  rewardLbl:  { fontSize: 8, fontWeight: '700', color: Colors.muted, letterSpacing: 1 },
  missionCard:{ backgroundColor: 'white', borderRadius: 20, borderWidth: 1, borderColor: Colors.line, padding: 16, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  missionHead:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  missionTitle:{ fontSize: 14, fontWeight: '800', color: Colors.ink },
  missionCounter: { fontSize: 12, fontWeight: '700', color: Colors.muted },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  missionCheck:{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.line2, alignItems: 'center', justifyContent: 'center' },
  missionCheckDone:{ backgroundColor: BRAND, borderColor: BRAND },
  missionLabel:{ fontSize: 13, color: Colors.ink2, fontWeight: '600' },
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
  progressBarOuter: { width: 72, height: 3, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden', marginTop: 3 },
  progressBarFill:  { height: '100%', borderRadius: 2, backgroundColor: BRAND },
  slideArea:    { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },

  // Summary micro-reward overlay
  summaryRewardOverlay: { position: 'absolute', alignSelf: 'center', top: '30%', zIndex: 50 },
  summaryRewardBadge:   { backgroundColor: BRAND, borderRadius: 100, paddingVertical: 9, paddingHorizontal: 20, shadowColor: BRAND, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  summaryRewardBadgeTxt:{ fontSize: 15, fontWeight: '800', color: 'white' },

  // Concept card
  introCard:    { backgroundColor: 'white', borderRadius: 28, padding: SM ? 18 : 22, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  slideEmoji:   { fontSize: SM ? 38 : 44, marginBottom: 10 },
  introHeading: { fontSize: SM ? 20 : 23, fontWeight: '900', color: Colors.ink, letterSpacing: -0.4, lineHeight: SM ? 26 : 30, marginBottom: 8 },
  introDef:     { fontSize: SM ? 14 : 15, color: Colors.ink2, lineHeight: SM ? 21 : 23, fontWeight: '500', marginBottom: 2 },

  // Accent card (key_fact, important, remember, curiosity)
  kpCard:       { borderRadius: 28, borderLeftWidth: 4, padding: SM ? 16 : 20, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  kpEmoji:      { fontSize: SM ? 32 : 36, marginBottom: 6 },
  kpLabel:      { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  kpTitle:      { fontSize: SM ? 16 : 18, fontWeight: '900', color: Colors.ink, marginBottom: 6, letterSpacing: -0.3 },
  kpDef:        { fontSize: SM ? 13 : 14, color: Colors.ink2, lineHeight: SM ? 20 : 22, fontWeight: '500' },

  // Shared example block
  exampleBox:   { marginTop: SM ? 10 : 14, paddingTop: SM ? 10 : 12, borderTopWidth: 1, borderTopColor: Colors.line },
  exampleLabel: { fontSize: 10, fontWeight: '800', color: Colors.muted, letterSpacing: 0.6, marginBottom: 4, textTransform: 'uppercase' },
  exampleText:  { fontSize: SM ? 13 : 14, color: Colors.ink, lineHeight: SM ? 20 : 22, fontWeight: '600' },

  // Wow fact card
  wowCard:      { backgroundColor: 'white', borderRadius: 28, padding: SM ? 28 : 34, alignItems: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  wowEmoji:     { fontSize: SM ? 56 : 68, marginBottom: 16 },
  wowLabel:     { fontSize: 11, fontWeight: '900', color: '#FF4D6D', letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' },
  wowText:      { fontSize: SM ? 17 : 20, fontWeight: '700', color: Colors.ink, textAlign: 'center', lineHeight: SM ? 26 : 30, letterSpacing: -0.3 },

  // Quiz card
  quizCard:          { backgroundColor: 'white', borderRadius: 28, padding: SM ? 16 : 20, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  quizLabel:         { fontSize: 10, fontWeight: '900', color: BRAND, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' },
  quizQuestion:      { fontSize: SM ? 16 : 18, fontWeight: '800', color: Colors.ink, lineHeight: SM ? 24 : 27, letterSpacing: -0.2 },
  quizOption:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 2, borderColor: Colors.line, backgroundColor: Colors.bgSoft },
  quizOptCorrect:    { borderColor: BRAND, borderWidth: 2, backgroundColor: 'rgba(108,77,255,0.06)' },
  quizOptWrong:      { borderColor: '#DC2626', backgroundColor: 'rgba(220,38,38,0.06)' },
  quizLetter:        { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.line, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  quizLetterGreen:   { backgroundColor: BRAND },
  quizLetterRed:     { backgroundColor: '#DC2626' },
  quizLetterText:    { fontSize: 12, fontWeight: '800', color: Colors.ink },
  quizOptText:       { flex: 1, fontSize: SM ? 13 : 14, color: Colors.ink, fontWeight: '600', lineHeight: 20 },
  quizFeedback:      { marginTop: 12, borderRadius: 12, padding: 12 },
  quizFeedbackOk:    { backgroundColor: 'rgba(108,77,255,0.07)', borderWidth: 1, borderColor: 'rgba(108,77,255,0.2)' },
  quizFeedbackErr:   { backgroundColor: 'rgba(220,38,38,0.07)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.2)' },
  quizFeedbackTitle: { fontSize: 13, fontWeight: '800', color: Colors.ink, marginBottom: 4 },
  quizFeedbackText:  { fontSize: 12, color: Colors.ink2, lineHeight: 19 },

  // Prediction card
  predCard:     { backgroundColor: '#F0EDFF', borderRadius: 28, padding: SM ? 22 : 28, alignItems: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  predIcon:     { fontSize: SM ? 52 : 64, marginBottom: 12 },
  predLabel:    { fontSize: 10, fontWeight: '900', color: BRAND, letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' },
  predPrompt:   { fontSize: SM ? 18 : 21, fontWeight: '900', color: Colors.ink, textAlign: 'center', lineHeight: SM ? 26 : 30, letterSpacing: -0.4, marginBottom: 20 },
  predHintBox:  { backgroundColor: 'white', borderRadius: 14, padding: SM ? 12 : 14, width: '100%' },
  predHintLabel:{ fontSize: 9, fontWeight: '800', color: Colors.muted, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  predHint:     { fontSize: SM ? 13 : 14, color: Colors.ink2, lineHeight: SM ? 20 : 22, fontWeight: '500' },

  // Motivation card
  motivCard:    { backgroundColor: 'white', borderRadius: 28, padding: SM ? 32 : 40, alignItems: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  motivEmoji:   { fontSize: SM ? 64 : 80, marginBottom: 16 },
  motivMsg:     { fontSize: SM ? 22 : 26, fontWeight: '900', color: Colors.ink, textAlign: 'center', letterSpacing: -0.5, marginBottom: 8 },
  motivSub:     { fontSize: SM ? 13 : 15, color: Colors.muted, textAlign: 'center', lineHeight: SM ? 20 : 23, fontWeight: '500' },

  // Example / Scenario card
  scenarioCard:  { backgroundColor: 'white', borderRadius: 28, overflow: 'hidden', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  scenarioBand:  { backgroundColor: '#FFF7ED', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SM ? 16 : 20, paddingVertical: SM ? 12 : 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,122,43,0.12)' },
  scenarioEmoji: { fontSize: SM ? 26 : 30 },
  scenarioLabel: { fontSize: 10, fontWeight: '900', color: '#FF7A2B', letterSpacing: 1.2, textTransform: 'uppercase' },
  scenarioBody:  { padding: SM ? 16 : 20 },
  scenarioTitle: { fontSize: SM ? 16 : 18, fontWeight: '900', color: Colors.ink, marginBottom: 8, letterSpacing: -0.3 },
  scenarioDef:   { fontSize: SM ? 13 : 14, color: Colors.ink2, lineHeight: SM ? 20 : 22, fontWeight: '500', marginBottom: 10 },
  scenarioEx:    { fontSize: SM ? 13 : 14, color: Colors.ink, lineHeight: SM ? 20 : 22, fontWeight: '700' },

  // Mission hero card
  missionCard:      { borderRadius: 28, overflow: 'hidden', shadowColor: BRAND, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },
  missionGrad:      { borderRadius: 28, paddingVertical: SM ? 26 : 36, paddingHorizontal: 24, alignItems: 'center' },
  missionBadge:     { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100, paddingVertical: 5, paddingHorizontal: 16, marginBottom: 18 },
  missionBadgeText: { color: 'white', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  missionEmoji:     { fontSize: SM ? 56 : 68, marginBottom: 14 },
  missionTitle:     { fontSize: SM ? 22 : 26, fontWeight: '900', color: 'white', textAlign: 'center', letterSpacing: -0.5, lineHeight: SM ? 28 : 34, marginBottom: 10 },
  missionSub:       { fontSize: SM ? 13 : 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: SM ? 20 : 24, fontWeight: '500' },

  // Main concept card
  mainCard:       { backgroundColor: 'white', borderRadius: 28, overflow: 'hidden', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  mainCardHeader: { backgroundColor: 'rgba(91,61,245,0.07)', paddingHorizontal: SM ? 18 : 22, paddingVertical: SM ? 10 : 12 },
  mainCardLabel:  { fontSize: 10, fontWeight: '900', color: BRAND, letterSpacing: 1.5, textTransform: 'uppercase' },
  mainCardBody:   { paddingHorizontal: SM ? 18 : 22, paddingVertical: SM ? 14 : 18 },
  mainCardEmoji:  { fontSize: SM ? 36 : 44, marginBottom: 10 },
  mainCardTitle:  { fontSize: SM ? 20 : 24, fontWeight: '900', color: Colors.ink, letterSpacing: -0.4, lineHeight: SM ? 26 : 30, marginBottom: 8 },
  mainCardDef:    { fontSize: SM ? 14 : 15, color: Colors.ink2, lineHeight: SM ? 21 : 24, fontWeight: '500' },

  // Step-by-step renderer (main_concept procedural)
  stepsContainer: { gap: 8, marginTop: 4 },
  stepRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(91,61,245,0.05)', borderRadius: 12, padding: 10, borderLeftWidth: 3, borderLeftColor: BRAND },
  stepRowProblem: { backgroundColor: 'rgba(0,0,0,0.04)', borderLeftColor: '#888' },
  stepRowResult:  { backgroundColor: 'rgba(5,150,105,0.08)', borderLeftColor: '#059669' },
  stepBadge:      { backgroundColor: BRAND, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, minWidth: 54, alignItems: 'center' },
  stepBadgeProblem: { backgroundColor: '#888' },
  stepBadgeResult:{ backgroundColor: '#059669' },
  stepBadgeText:  { fontSize: 10, fontWeight: '900', color: 'white', letterSpacing: 0.5 },
  stepContent:    { flex: 1, fontSize: SM ? 13 : 14, color: Colors.ink2, lineHeight: 20, fontWeight: '500' },
  stepContentResult: { color: '#065F46', fontWeight: '700' },

  // Key relation card
  relationCard:       { backgroundColor: 'white', borderRadius: 28, padding: SM ? 20 : 24, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  relationLabel:      { fontSize: 10, fontWeight: '900', color: '#00C2A8', letterSpacing: 1.5, marginBottom: 16, textTransform: 'uppercase' },
  relationRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  relationChipA:      { flex: 1, backgroundColor: 'rgba(91,61,245,0.08)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(91,61,245,0.15)' },
  relationChipB:      { flex: 1, backgroundColor: 'rgba(124,90,255,0.08)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(124,90,255,0.15)' },
  relationChipText:   { fontSize: SM ? 13 : 14, fontWeight: '800', color: BRAND, letterSpacing: -0.2, textAlign: 'center' },
  relationArrow:      { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,194,168,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#00C2A8', flexShrink: 0 },
  relationArrowText:  { fontSize: 14, color: '#00C2A8', fontWeight: '900' },
  relationConnector:  { fontSize: SM ? 11 : 12, fontWeight: '700', color: '#00C2A8', textAlign: 'center', marginBottom: 10, fontStyle: 'italic' },
  relationDef:        { fontSize: SM ? 13 : 14, color: Colors.ink2, lineHeight: SM ? 20 : 22, fontWeight: '500', paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line },

  // Process flow card
  processCard:      { backgroundColor: 'white', borderRadius: 28, padding: SM ? 18 : 22, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  processLabel:     { fontSize: 10, fontWeight: '900', color: NEON, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
  processTitle:     { fontSize: SM ? 16 : 18, fontWeight: '900', color: Colors.ink, marginBottom: 4, letterSpacing: -0.3 },
  processDef:       { fontSize: SM ? 13 : 14, color: Colors.ink2, lineHeight: SM ? 20 : 22, fontWeight: '500', marginBottom: 14 },
  processSteps:     { gap: 10 },
  processStep:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  processNum:       { width: 26, height: 26, borderRadius: 13, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  processNumText:   { fontSize: 12, fontWeight: '900', color: 'white' },
  processStepText:  { flex: 1, fontSize: SM ? 13 : 14, color: Colors.ink, lineHeight: SM ? 20 : 22, fontWeight: '600', paddingTop: 3 },

  // Application card
  appCard:        { backgroundColor: 'white', borderRadius: 28, overflow: 'hidden', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  appBand:        { backgroundColor: '#F0FDF4', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SM ? 16 : 20, paddingVertical: SM ? 12 : 14, borderBottomWidth: 1, borderBottomColor: 'rgba(5,150,105,0.12)' },
  appEmoji:       { fontSize: SM ? 24 : 28 },
  appLabel:       { fontSize: 10, fontWeight: '900', color: '#059669', letterSpacing: 1.2, textTransform: 'uppercase' },
  appBody:        { padding: SM ? 16 : 20 },
  appTitle:       { fontSize: SM ? 16 : 18, fontWeight: '900', color: Colors.ink, marginBottom: 8, letterSpacing: -0.3 },
  appSit:         { fontSize: SM ? 13 : 14, color: Colors.ink2, lineHeight: SM ? 20 : 22, fontWeight: '500', marginBottom: 10 },
  appAnswerBox:   { backgroundColor: 'rgba(5,150,105,0.07)', borderRadius: 12, padding: SM ? 10 : 12, borderLeftWidth: 3, borderLeftColor: '#059669' },
  appAnswerLabel: { fontSize: 9, fontWeight: '800', color: '#059669', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  appAnswerText:  { fontSize: SM ? 13 : 14, color: '#065F46', lineHeight: SM ? 20 : 22, fontWeight: '700' },

  // Common error card
  errorCard:        { backgroundColor: 'white', borderRadius: 28, overflow: 'hidden', shadowColor: '#DC2626', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5, borderWidth: 1, borderColor: 'rgba(220,38,38,0.12)' },
  errorHeader:      { backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SM ? 16 : 20, paddingVertical: SM ? 12 : 14, borderBottomWidth: 1, borderBottomColor: 'rgba(220,38,38,0.15)' },
  errorIcon:        { fontSize: SM ? 22 : 26 },
  errorHeaderLabel: { fontSize: 11, fontWeight: '900', color: '#DC2626', letterSpacing: 1.5, textTransform: 'uppercase' },
  errorBody:        { padding: SM ? 14 : 18, gap: 10 },
  errorWrongBox:    { backgroundColor: 'rgba(220,38,38,0.05)', borderRadius: 12, padding: SM ? 10 : 12, borderLeftWidth: 3, borderLeftColor: '#DC2626' },
  errorWrongLabel:  { fontSize: 10, fontWeight: '900', color: '#DC2626', letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' },
  errorWrongText:   { fontSize: SM ? 13 : 14, color: '#991B1B', lineHeight: SM ? 20 : 22, fontWeight: '600' },
  errorRightBox:    { backgroundColor: 'rgba(5,150,105,0.05)', borderRadius: 12, padding: SM ? 10 : 12, borderLeftWidth: 3, borderLeftColor: '#059669' },
  errorRightLabel:  { fontSize: 10, fontWeight: '900', color: '#059669', letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' },
  errorRightText:   { fontSize: SM ? 13 : 14, color: '#065F46', lineHeight: SM ? 20 : 22, fontWeight: '600' },

  // Final challenge card
  challengeCard:        { backgroundColor: 'white', borderRadius: 28, overflow: 'hidden', shadowColor: '#FF7A2B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 20, elevation: 6 },
  challengeHeader:      { paddingVertical: SM ? 14 : 18, paddingHorizontal: SM ? 18 : 22, alignItems: 'center' },
  challengeTrophy:      { fontSize: SM ? 36 : 44, marginBottom: 4 },
  challengeHeaderLabel: { fontSize: 11, fontWeight: '900', color: 'white', letterSpacing: 2, textTransform: 'uppercase' },
  challengeBody:        { padding: SM ? 14 : 18, gap: 12 },
  challengeQuestion:    { fontSize: SM ? 15 : 17, fontWeight: '800', color: Colors.ink, lineHeight: SM ? 22 : 26, letterSpacing: -0.2 },

  // Victory card
  victoryCard:      { backgroundColor: 'white', borderRadius: 28, padding: SM ? 22 : 28, alignItems: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 24, elevation: 8 },
  victoryEmoji:     { fontSize: SM ? 54 : 68, marginBottom: 10 },
  victoryTitle:     { fontSize: SM ? 20 : 24, fontWeight: '900', color: Colors.ink, textAlign: 'center', letterSpacing: -0.5, lineHeight: SM ? 26 : 32, marginBottom: 6 },
  victorySub:       { fontSize: SM ? 12 : 14, color: Colors.ink2, textAlign: 'center', lineHeight: SM ? 18 : 22, fontWeight: '500', marginBottom: 14 },
  victoryStats:     { width: '100%', backgroundColor: Colors.bgSoft, borderRadius: 16, paddingVertical: SM ? 12 : 14, paddingHorizontal: 8, marginBottom: 10, borderWidth: 1, borderColor: Colors.line },
  victoryStatRow:   { flexDirection: 'row', justifyContent: 'space-around' },
  victoryStat:      { alignItems: 'center', gap: 2 },
  victoryStatVal:   { fontSize: SM ? 18 : 22, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5 },
  victoryStatLbl:   { fontSize: 9, fontWeight: '700', color: Colors.muted, letterSpacing: 0.3, textTransform: 'uppercase' },
  victoryNote:      { fontSize: SM ? 11 : 12, color: Colors.muted, textAlign: 'center', fontWeight: '600', marginTop: 2 },

  // Mastery badge
  masteryBadge:     { borderRadius: 100, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 18, marginBottom: 10, alignItems: 'center' },
  masteryBadgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  masteryBadgeSub:  { fontSize: 11, fontWeight: '600', marginTop: 2, opacity: 0.8 },
  reflectionBlock:  { backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', paddingVertical: 10, paddingHorizontal: 14, marginTop: 8, marginBottom: 4, alignSelf: 'stretch' },
  reflectionText:   { fontSize: 12, color: '#92400E', fontWeight: '600', lineHeight: 18 },
  noInteractionBlock: { width: '100%', backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', gap: 12 },
  noInteractionText:  { fontSize: 13, color: Colors.muted, fontWeight: '500', textAlign: 'center', lineHeight: 19 },
  noInteractionStats: { flexDirection: 'row', gap: 16, justifyContent: 'center' },

  // Skill dominance chip + mission progress
  missionProgress:    { fontSize: 11, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  skillDominatedChip: { backgroundColor: 'rgba(5,150,105,0.10)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1.5, borderColor: 'rgba(5,150,105,0.3)', marginBottom: 10 },
  skillDominatedText: { fontSize: 12, fontWeight: '800', color: '#065F46', letterSpacing: 0.2 },

  // Next mission button — skill transition
  nextMissionWrapper: { width: '100%', marginBottom: 12 },
  nextMissionLabel:   { fontSize: 10, fontWeight: '700', color: Colors.muted, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginBottom: 6 },
  nextMissionBtn:     { width: '100%', borderRadius: 16, overflow: 'hidden' },
  nextMissionGrad:    { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', gap: 2 },
  nextMissionText:    { fontSize: 16, fontWeight: '900', color: 'white', letterSpacing: -0.3 },
  nextMissionArrow:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5 },

  // Upcoming missions list
  upcomingBlock:        { width: '100%', backgroundColor: Colors.bgSoft, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.line, gap: 8 },
  upcomingRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  upcomingRowCurrent:   { opacity: 1 },
  upcomingDot:          { fontSize: 13, fontWeight: '800', color: Colors.muted, width: 20, textAlign: 'center' },
  upcomingLabel:        { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.muted },
  upcomingLabelDone:    { color: '#059669', fontWeight: '700' },
  upcomingLabelCurrent: { color: Colors.ink, fontWeight: '800' },

  // Chain diagram (key_relation)
  chainContainer:   { gap: 0, alignItems: 'stretch', marginVertical: 10 },
  chainNode:        { backgroundColor: '#F5F3FF', borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(91,61,245,0.28)', paddingVertical: SM ? 9 : 11, paddingHorizontal: 16 },
  chainNodeText:    { fontSize: SM ? 14 : 16, fontWeight: '800', color: BRAND, textAlign: 'center' },
  chainLink:        { alignItems: 'center', paddingVertical: 2 },
  chainLinkArrow:   { fontSize: SM ? 16 : 18, color: '#00C2A8', fontWeight: '900', lineHeight: SM ? 18 : 20 },
  chainLinkText:    { fontSize: SM ? 11 : 12, fontWeight: '700', color: '#00C2A8', fontStyle: 'italic', lineHeight: SM ? 14 : 16 },

  // Challenge reflection card
  challengeRefCard:    { backgroundColor: '#F5F3FF', borderRadius: 28, padding: SM ? 26 : 32, alignItems: 'center', shadowColor: NEON, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5 },
  challengeRefEmoji:   { fontSize: SM ? 52 : 64, marginBottom: 14 },
  challengeRefLabel:   { fontSize: 10, fontWeight: '900', color: NEON, letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' },
  challengeRefQ:       { fontSize: SM ? 17 : 21, fontWeight: '800', color: Colors.ink, textAlign: 'center', lineHeight: SM ? 25 : 30, letterSpacing: -0.3, marginBottom: 16 },
  challengeRefHintBox: { backgroundColor: 'white', borderRadius: 14, padding: SM ? 10 : 12, width: '100%' },
  challengeRefHintLbl: { fontSize: 9, fontWeight: '800', color: Colors.muted, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  challengeRefHintTxt: { fontSize: SM ? 13 : 14, color: Colors.ink2, lineHeight: SM ? 20 : 22, fontWeight: '500' },

  // Order sequence card
  orderCard:        { backgroundColor: 'white', borderRadius: 28, padding: SM ? 16 : 20, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 20, elevation: 5 },
  orderLabel:       { fontSize: 10, fontWeight: '900', color: '#7C5AFF', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
  orderTitle:       { fontSize: SM ? 15 : 17, fontWeight: '800', color: Colors.ink, lineHeight: SM ? 22 : 25, letterSpacing: -0.2, marginBottom: 6 },
  orderHint:        { fontSize: SM ? 12 : 13, color: Colors.muted, fontWeight: '600', marginBottom: 14 },
  orderItems:       { gap: 8, alignSelf: 'stretch' },
  orderItem:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SM ? 10 : 12, borderRadius: 14, borderWidth: 2, borderColor: Colors.line, backgroundColor: Colors.bgSoft },
  orderItemSelected:{ borderColor: BRAND, backgroundColor: 'rgba(91,61,245,0.06)' },
  orderItemCorrect: { borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.07)' },
  orderNum:         { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.line2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  orderNumSelected: { backgroundColor: BRAND },
  orderNumCorrect:  { backgroundColor: '#059669' },
  orderNumTxt:      { fontSize: 13, fontWeight: '900', color: 'white' },
  orderNumTxtMuted: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  orderItemTxt:     { flex: 1, fontSize: SM ? 13 : 14, color: Colors.ink2, fontWeight: '600', lineHeight: 19 },
  orderItemTxtSelected: { color: Colors.ink, fontWeight: '700' },
  orderSuccessRow:  { marginTop: 12, backgroundColor: 'rgba(5,150,105,0.08)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(5,150,105,0.2)', alignSelf: 'stretch', alignItems: 'center' },
  orderSuccessTxt:  { fontSize: 13, fontWeight: '800', color: '#065F46' },
});

// ── Quiz ───────────────────────────────────────────────────────────
const qz = StyleSheet.create({
  statsBar: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 6, gap: 7, alignItems: 'center' },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: Colors.line, paddingHorizontal: 10, paddingVertical: 7, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  chipVal:  { fontSize: 15, fontWeight: '900', color: Colors.ink },
  chipLbl:  { fontSize: 10, color: Colors.muted, fontWeight: '600' },
  counter:  { fontSize: 11, fontWeight: '700', color: Colors.muted, flexShrink: 0 },

  // Lives dots — displayed inside streak chip
  heartDot:       { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(0,0,0,0.12)' },
  heartDotActive: { backgroundColor: '#FF4D6D' },

  // Animated progress bar (replaces PillBar)
  progressTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.09)', overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 4, backgroundColor: BRAND },

  // Kept for style compatibility (no longer rendered)
  livesRow:  { flexDirection: 'row', gap: 4, paddingHorizontal: 16, marginBottom: 2 },
  comboRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  comboLabel:       { fontSize: 11, fontWeight: '800', color: Colors.ink2 },
  comboBlocks:      { flexDirection: 'row', gap: 4 },
  comboBlock:       { width: 24, height: 8, borderRadius: 4, backgroundColor: Colors.line2 },
  comboBlockFilled: { backgroundColor: '#FF7A2B' },

  motivMsg: { fontSize: 11, fontWeight: '700', color: Colors.muted, paddingHorizontal: 16, paddingBottom: 6, textAlign: 'center' },

  scroll:   { paddingHorizontal: 14, paddingTop: 4 },

  // Question card — reduced padding ~22% vs original
  questionCard: { backgroundColor: 'white', borderRadius: 20, paddingHorizontal: SM ? 13 : 15, paddingVertical: SM ? 11 : 12, marginBottom: 8, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 },
  questionMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  questionChip: { fontSize: 10, fontWeight: '800', color: BRAND, letterSpacing: 0.4, backgroundColor: 'rgba(91,61,245,0.08)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 100 },
  questionText: { fontSize: SM ? 15 : 17, fontWeight: '800', color: Colors.ink, lineHeight: SM ? 22 : 25, letterSpacing: -0.2 },

  option:           { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 2, borderColor: Colors.line, backgroundColor: 'white' },
  optCorrect:       { borderColor: BRAND, borderWidth: 2.5, backgroundColor: 'rgba(91,61,245,0.05)', shadowColor: BRAND, shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 },
  optWrong:         { borderColor: '#DC2626', borderWidth: 2, backgroundColor: 'rgba(220,38,38,0.04)' },
  optLetter:        { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optLetterCorrect: { backgroundColor: BRAND },
  optLetterRed:     { backgroundColor: '#DC2626' },
  optLetterText:    { fontSize: 13, fontWeight: '800', color: Colors.ink },
  optText:          { flex: 1, fontSize: 14, color: Colors.ink, fontWeight: '600', lineHeight: 20 },

  // Feedback — compact (max 2 visible lines)
  feedback:      { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 13, marginBottom: 8 },
  feedbackOk:    { borderLeftWidth: 3, borderLeftColor: BRAND, backgroundColor: 'rgba(91,61,245,0.05)' },
  feedbackFail:  { borderLeftWidth: 3, borderLeftColor: '#DC2626', backgroundColor: 'rgba(220,38,38,0.04)' },
  feedbackHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  feedbackTitle: { fontSize: 13, fontWeight: '900', color: Colors.ink },
  feedbackXP:    { backgroundColor: BRAND, borderRadius: 100, paddingVertical: 2, paddingHorizontal: 9 },
  feedbackXPText:{ fontSize: 11, fontWeight: '900', color: 'white' },
  feedbackText:  { fontSize: 12, color: Colors.ink2, lineHeight: 18 },

  // XP float — slightly larger for reward feel
  xpFloat:     { backgroundColor: BRAND, borderRadius: 100, paddingVertical: 10, paddingHorizontal: 22, shadowColor: BRAND, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 10 },
  xpFloatText: { color: LIME, fontWeight: '900', fontSize: 18, letterSpacing: 0.3 },

  streakBadge:    { backgroundColor: 'white', borderRadius: 100, paddingVertical: 10, paddingHorizontal: 22, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 6, borderWidth: 1, borderColor: Colors.line },
  streakBadgeText:{ fontSize: 15, fontWeight: '900', color: Colors.ink },

  // Combo / micro reward — enlarged for more prominence
  microBadge:    { backgroundColor: Colors.ink, borderRadius: 100, paddingVertical: 11, paddingHorizontal: 24, shadowColor: Colors.ink, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  microBadgeText:{ fontSize: 16, fontWeight: '900', color: LIME },

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

  // Nemi character widget
  nemiWidget: { backgroundColor: 'white', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, borderWidth: 1, borderColor: Colors.line, maxWidth: 180 },
  nemiLabel:  { fontSize: 10, fontWeight: '800', color: BRAND, marginBottom: 3, letterSpacing: 0.5 },
  nemiText:   { fontSize: 12, color: Colors.ink2, fontWeight: '600', lineHeight: 17 },

  // Last-question glow state
  chipLastQ: { borderColor: BRAND, shadowColor: BRAND, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  lastQChip: { fontSize: 10, fontWeight: '800', color: Colors.rose, backgroundColor: 'rgba(255,77,109,0.1)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 100, marginLeft: 6 },
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
