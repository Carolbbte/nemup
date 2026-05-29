import { Colors } from '@/constants/Colors';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle,
  FileText,
  ImageIcon,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
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

const { height: SCREEN_H } = Dimensions.get('window');
const SM    = SCREEN_H < 740;
const BG    = '#F8F9FC';
const BRAND = '#5B3DF5';
const NEON  = '#7C5AFF';
const LIME  = '#C4F852';

// ── Types ─────────────────────────────────────────────────────────
type UploadedFile = {
  uri: string; name: string; mimeType: string; sizeText: string; sizeBytes: number;
};
type SessionProgress = {
  stage: 'uploading' | 'transcribing' | 'extracting' | 'generating' | 'validating_grounding' | 'done';
  status: 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
};

// ── Constants ─────────────────────────────────────────────────────
const BACKEND_BASE_URL = 'https://nemup-production.up.railway.app';

const RECENT_FILES: UploadedFile[] = [
  { uri: 'file:///ResumenHistoriaXXI.pdf', name: 'Resumen Historia XXI.pdf', mimeType: 'application/pdf', sizeText: '1.3 MB', sizeBytes: 1350000 },
  { uri: 'file:///FichaQuimica.png',       name: 'Ficha Química.png',        mimeType: 'image/png',       sizeText: '780 KB', sizeBytes: 780000 },
];

const TIPS = [
  'Estudiar en intervalos cortos es más efectivo que horas seguidas.',
  'Las preguntas activan tu memoria mejor que releer apuntes.',
  'Tu cerebro consolida lo aprendido mientras duermes.',
  'Usar tus propios apuntes te da el doble de XP en cada sesión.',
  'La práctica espaciada reduce el tiempo total de estudio.',
];

const GEN_STAGES = [
  { emoji: '📚', label: 'Analizando contenido' },
  { emoji: '🧠', label: 'Identificando conceptos' },
  { emoji: '🎯', label: 'Seleccionando prioridades' },
  { emoji: '⚡', label: 'Creando actividades' },
  { emoji: '🚀', label: 'Preparando experiencia' },
] as const;

const GEN_MESSAGES = [
  '📚 Detectando conceptos importantes...',
  '🧠 Encontrando relaciones clave...',
  '✨ Creando ejemplos memorables...',
  '🎯 Diseñando actividades personalizadas...',
  '⚡ Ajustando la dificultad...',
  '🚀 ¡Casi listo!',
];

const CHECKLIST_ITEMS = [
  'Documento analizado',
  'Texto extraído',
  'Conceptos identificados',
  'Actividades creadas',
  'Sesión lista',
];

const STAGE_TO_CHECKLIST: Record<string, number> = {
  uploading: 0, transcribing: 1, extracting: 2, generating: 3,
  validating_grounding: 4, done: 4,
};

const BENEFITS = [
  { emoji: '📚', text: 'Resume contenido complejo' },
  { emoji: '🧠', text: 'Actividades personalizadas' },
  { emoji: '⚡', text: 'Aprende más rápido' },
] as const;

// ── Confetti ──────────────────────────────────────────────────────
const CONFETTI = [
  { left: '7%',  bg: LIME,      size: 9,  dur: 2800, delay: 0,    zigzag:  8 },
  { left: '15%', bg: '#FF5B9F', size: 7,  dur: 3200, delay: 400,  zigzag: -10, radius: 4 },
  { left: '28%', bg: '#5BC8FF', size: 10, dur: 2600, delay: 800,  zigzag:  12 },
  { left: '38%', bg: LIME,      size: 6,  dur: 3600, delay: 200,  zigzag: -8,  radius: 3 },
  { left: '50%', bg: '#FFB547', size: 9,  dur: 2900, delay: 600,  zigzag:  6  },
  { left: '62%', bg: '#5BC8FF', size: 7,  dur: 3100, delay: 1000, zigzag: -12, radius: 4 },
  { left: '72%', bg: '#FF5B9F', size: 8,  dur: 2700, delay: 300,  zigzag:  10, radius: 4 },
  { left: '82%', bg: LIME,      size: 6,  dur: 3400, delay: 700,  zigzag: -6,  radius: 3 },
  { left: '20%', bg: NEON,      size: 8,  dur: 3000, delay: 500,  zigzag:  8,  radius: 4 },
  { left: '45%', bg: '#FFB547', size: 7,  dur: 2500, delay: 900,  zigzag: -10 },
  { left: '88%', bg: LIME,      size: 9,  dur: 3300, delay: 100,  zigzag:  6  },
  { left: '58%', bg: '#5BC8FF', size: 6,  dur: 2800, delay: 1200, zigzag: -8,  radius: 3 },
] as const;
type ConfettiItem = (typeof CONFETTI)[number];

function ConfettiPiece({ item }: { item: ConfettiItem }) {
  const ty  = useSharedValue(0);
  const tx  = useSharedValue(0);
  const rot = useSharedValue(0);
  useEffect(() => {
    ty.value = withDelay(item.delay, withRepeat(
      withTiming(SCREEN_H + 40, { duration: item.dur, easing: Easing.linear }), -1, false,
    ));
    tx.value = withDelay(item.delay, withRepeat(
      withSequence(
        withTiming(item.zigzag,       { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
        withTiming(-item.zigzag,      { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
        withTiming(item.zigzag * 0.6, { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,                 { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    ));
    rot.value = withDelay(item.delay, withRepeat(
      withTiming(720, { duration: item.dur, easing: Easing.linear }), -1, false,
    ));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotateZ: rot.value + 'deg' }],
  }));
  return (
    <Animated.View style={[{
      position: 'absolute', top: -20, left: item.left as any,
      width: item.size, height: item.size, backgroundColor: item.bg,
      borderRadius: 'radius' in item ? (item as any).radius : 2,
    }, style]} />
  );
}

// ── Progress bar ──────────────────────────────────────────────────
function SlimProgress({ step }: { step: number }) {
  const fill = useSharedValue(((step + 1) / 3) * 100);
  useEffect(() => {
    fill.value = withTiming(((step + 1) / 3) * 100, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [step]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` as any }));
  return (
    <View style={{ flex: 1, height: 5, backgroundColor: Colors.line, borderRadius: 99, overflow: 'hidden', marginHorizontal: 10 }}>
      <Animated.View style={[{ height: '100%', borderRadius: 99, overflow: 'hidden' }, fillStyle]}>
        <LinearGradient colors={[BRAND, LIME]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

// ── File type badge ───────────────────────────────────────────────
function FileTypeBadge({ mimeType }: { mimeType: string }) {
  if (mimeType.includes('pdf'))
    return <View style={fti.pdf}><Text style={fti.pdfText}>PDF</Text></View>;
  if (mimeType.includes('image'))
    return <View style={fti.img}><ImageIcon size={20} color="#16A34A" strokeWidth={1.8} /></View>;
  return <View style={fti.doc}><FileText size={20} color="#2563EB" strokeWidth={1.8} /></View>;
}
const fti = StyleSheet.create({
  pdf:     { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  pdfText: { fontSize: 11, fontWeight: '800', color: '#DC2626' },
  img:     { width: 44, height: 44, borderRadius: 12, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  doc:     { width: 44, height: 44, borderRadius: 12, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
});

// ── Utilities ─────────────────────────────────────────────────────
function getBackendBaseUrl() { return BACKEND_BASE_URL || 'http://localhost:3000'; }

function normalizeMime(name: string, mime: string) {
  if (!mime || mime === 'application/octet-stream') {
    if (name.toLowerCase().endsWith('.pdf')) return 'application/pdf';
    if (name.toLowerCase().match(/\.(jpg|jpeg|png|gif|heic|webp)$/i)) return 'image/jpeg';
  }
  return mime;
}

function parseSseEvents(raw: string, handle: (event: string, payload: any) => void) {
  const events   = raw.split(/\r?\n\r?\n/);
  const leftover = events.pop() ?? '';
  for (const block of events) {
    if (!block.trim()) continue;
    let name = 'message', data = '';
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) name = line.replace('event:', '').trim();
      if (line.startsWith('data:'))  data += line.replace('data:', '').trim();
    }
    if (data) { try { handle(name, JSON.parse(data)); } catch (e) { console.warn('[SSE]', e); } }
  }
  return leftover;
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function UploadFlowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ── State ──────────────────────────────────────────────────────
  const [step, setStep]                       = useState(0);
  const [selectedFiles, setSelectedFiles]     = useState<UploadedFile[]>([]);
  const [uploadError, setUploadError]         = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [progressEvents, setProgressEvents]   = useState<SessionProgress[]>([]);
  const [sessionResult, setSessionResult]     = useState<any | null>(null);
  const [tipIdx, setTipIdx]                   = useState(0);
  const [stageIdx, setStageIdx]               = useState(0);
  const [msgIdx, setMsgIdx]                   = useState(0);
  const [simStats, setSimStats]               = useState({ concepts: 0, activities: 0, xp: 0 });

  // ── Refs ───────────────────────────────────────────────────────
  const sseBufferRef         = useRef('');
  const lastLenRef           = useRef(0);
  const xhrRef               = useRef<XMLHttpRequest | null>(null);
  const generationStartedRef = useRef(false);
  const autoNavRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentStageRef      = useRef(0);

  // ── Shared values (ALL unconditional) ─────────────────────────
  const stageOpacity = useSharedValue(1);
  const stageScale   = useSharedValue(1);
  const celebScale   = useSharedValue(0);
  const celebPulse   = useSharedValue(1);
  const ctaPulse     = useSharedValue(0);
  const s2Entry1     = useSharedValue(0);
  const s2Entry2     = useSharedValue(0);
  const s2Entry3     = useSharedValue(0);

  // ── Animated styles (ALL unconditional) ───────────────────────
  const stageAnimStyle = useAnimatedStyle(() => ({
    opacity: stageOpacity.value,
    transform: [{ scale: stageScale.value }],
  }));
  const celebScaleAnim = useAnimatedStyle(() => ({ transform: [{ scale: celebScale.value }] }));
  const celebPulseAnim = useAnimatedStyle(() => ({ transform: [{ scale: celebPulse.value }] }));
  const ctaPulseAnim   = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ctaPulse.value * 0.013 }],
    shadowOpacity: 0.22 + ctaPulse.value * 0.14,
  }));
  const s2Entry1Style = useAnimatedStyle(() => ({
    opacity: s2Entry1.value,
    transform: [{ translateY: (1 - s2Entry1.value) * 18 }],
  }));
  const s2Entry2Style = useAnimatedStyle(() => ({
    opacity: s2Entry2.value,
    transform: [{ translateY: (1 - s2Entry2.value) * 18 }],
  }));
  const s2Entry3Style = useAnimatedStyle(() => ({
    opacity: s2Entry3.value,
    transform: [{ translateY: (1 - s2Entry3.value) * 18 }],
  }));

  // ── Effects ────────────────────────────────────────────────────

  // Screen 2: entrance animations
  useEffect(() => {
    if (step !== 2) return;
    celebScale.value = withSpring(1, { damping: 11, stiffness: 180 });
    celebPulse.value = withDelay(700, withRepeat(
      withSequence(
        withTiming(1.08, { duration: 380 }),
        withTiming(1.00, { duration: 380 }),
        withDelay(3200, withTiming(1.00, { duration: 0 })),
      ), -1, false,
    ));
    ctaPulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1800 }), withTiming(0, { duration: 1800 })), -1, false,
    );
    s2Entry1.value = withSpring(1, { damping: 16, stiffness: 170 });
    s2Entry2.value = withDelay(200, withSpring(1, { damping: 16, stiffness: 170 }));
    s2Entry3.value = withDelay(400, withSpring(1, { damping: 16, stiffness: 170 }));
  }, [step]);

  // Screen 1: animated stage card cycling
  useEffect(() => {
    if (step !== 1) return;
    const interval = setInterval(() => {
      stageOpacity.value = withTiming(0, { duration: 240 }, (done) => {
        if (done) {
          currentStageRef.current = (currentStageRef.current + 1) % GEN_STAGES.length;
          runOnJS(setStageIdx)(currentStageRef.current);
          stageOpacity.value = withTiming(1, { duration: 340 });
          stageScale.value   = withSpring(1, { damping: 14, stiffness: 200 });
        }
      });
      stageScale.value = withTiming(0.88, { duration: 240 });
    }, 3500);
    return () => clearInterval(interval);
  }, [step]);

  // Screen 1: rotating messages
  useEffect(() => {
    if (step !== 1) return;
    const t = setInterval(() => setMsgIdx(i => (i + 1) % GEN_MESSAGES.length), 3200);
    return () => clearInterval(t);
  }, [step]);

  // Screen 1: tips rotation
  useEffect(() => {
    if (step !== 1) return;
    const t = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 4000);
    return () => clearInterval(t);
  }, [step]);

  // Screen 1: simulated stats counter
  useEffect(() => {
    if (step !== 1) { setSimStats({ concepts: 0, activities: 0, xp: 0 }); return; }
    const TARGETS = { concepts: 14, activities: 5, xp: 95 };
    let elapsed = 0;
    const TOTAL = 10000;
    const timer = setInterval(() => {
      elapsed += 250;
      const t    = Math.min(elapsed / TOTAL, 1);
      const ease = 1 - Math.pow(1 - t, 2);
      setSimStats({
        concepts:   Math.round(ease * TARGETS.concepts),
        activities: Math.round(ease * TARGETS.activities),
        xp:         Math.round(ease * TARGETS.xp),
      });
      if (t >= 1) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [step]);

  // Auto-navigate to step 2 when session result arrives
  useEffect(() => {
    if (sessionResult && step === 1) {
      autoNavRef.current = setTimeout(() => setStep(2), 800);
      return () => { if (autoNavRef.current) clearTimeout(autoNavRef.current); };
    }
  }, [sessionResult, step]);

  // ── Computed ───────────────────────────────────────────────────
  const { completedChecklistIdx, activeChecklistIdx } = useMemo(() => {
    if (progressEvents.length === 0) return { completedChecklistIdx: -1, activeChecklistIdx: 0 };
    let maxCompleted = -1;
    let maxActive    = 0;
    for (const e of progressEvents) {
      const idx = STAGE_TO_CHECKLIST[e.stage] ?? 0;
      if (e.status === 'complete')   maxCompleted = Math.max(maxCompleted, idx);
      if (e.status === 'processing') maxActive    = Math.max(maxActive, idx);
    }
    return { completedChecklistIdx: maxCompleted, activeChecklistIdx: Math.max(maxCompleted + 1, maxActive) };
  }, [progressEvents]);

  // ── File helpers ───────────────────────────────────────────────
  const addFiles = (incoming: UploadedFile[]) => {
    setSelectedFiles(prev => {
      const existing = new Set(prev.map(f => f.uri));
      return [...prev, ...incoming.filter(f => !existing.has(f.uri))];
    });
    setUploadError('');
  };
  const removeFile = (uri: string) => setSelectedFiles(prev => prev.filter(f => f.uri !== uri));

  // ── Handlers ──────────────────────────────────────────────────
  const pushProgress = useCallback((e: SessionProgress) => {
    setProgressEvents(prev => [...prev, e]);
  }, []);

  const handleFilePick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: true,
      });
      if (result.canceled || !result.assets?.length) return;
      addFiles(result.assets.map(a => ({
        uri: a.uri, name: a.name ?? 'archivo',
        mimeType: normalizeMime(a.name ?? '', a.mimeType ?? ''),
        sizeText: a.size ? `${(a.size / 1024).toFixed(1)} KB` : 'N/A',
        sizeBytes: a.size ?? 0,
      })));
    } catch (e) {
      setUploadError(`No se pudo seleccionar: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleCameraPick = async () => {
    try {
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: true,
        });
        if (!result.canceled && result.assets?.length) {
          addFiles(result.assets.map(a => ({
            uri: a.uri, name: a.fileName ?? `Foto-${Date.now()}.jpg`,
            mimeType: a.type ?? 'image/jpeg',
            sizeText: a.fileSize ? `${Math.round(a.fileSize / 1024)} KB` : 'N/A',
            sizeBytes: a.fileSize ?? 0,
          })));
        }
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        addFiles([{
          uri: a.uri, name: a.fileName ?? `Foto-${Date.now()}.jpg`,
          mimeType: a.type ?? 'image/jpeg',
          sizeText: a.fileSize ? `${Math.round(a.fileSize / 1024)} KB` : 'N/A',
          sizeBytes: a.fileSize ?? 0,
        }]);
      }
    } catch (e) {
      setUploadError(`Error cámara: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const startGeneration = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    setGenerationError(null);
    setProgressEvents([]);
    sseBufferRef.current = '';
    lastLenRef.current   = 0;
    try {
      const primary = selectedFiles[0];
      const formData = new FormData();
      formData.append('config', JSON.stringify({
        documentId: primary.name, format: ['quizzes', 'flashcards'],
        difficulty: 'adaptive', estimatedDuration: 18,
      }));
      formData.append('userId', 'demo-user');
      selectedFiles.forEach(f => formData.append('documents', { uri: f.uri, type: f.mimeType, name: f.name } as any));

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('POST', `${getBackendBaseUrl()}/sessions/generate`, true);
      xhr.setRequestHeader('Accept', 'text/event-stream');
      xhr.onprogress = () => {
        const incoming = xhr.responseText.substring(lastLenRef.current);
        lastLenRef.current = xhr.responseText.length;
        sseBufferRef.current = parseSseEvents(`${sseBufferRef.current}${incoming}`, (event, payload) => {
          if (event === 'progress') pushProgress(payload as SessionProgress);
          if (event === 'complete') setSessionResult(payload);
          if (event === 'error')    setGenerationError(payload?.message ?? 'Error inesperado.');
        });
      };
      xhr.onload  = () => { if (xhr.status >= 400) setGenerationError('No se pudo generar la sesión.'); };
      xhr.onerror = () => setGenerationError('Error de red. Intenta nuevamente.');
      xhr.send(formData);
    } catch (e) {
      setGenerationError(`Error: ${e instanceof Error ? e.message : 'Error desconocido'}`);
    }
  }, [pushProgress, selectedFiles]);

  useEffect(() => {
    if (step !== 1) { generationStartedRef.current = false; return; }
    if (generationStartedRef.current || selectedFiles.length === 0) return;
    generationStartedRef.current = true;
    startGeneration();
    return () => { xhrRef.current?.abort(); };
  }, [selectedFiles, startGeneration, step]);

  const hasFiles         = selectedFiles.length > 0;
  const completedSession = sessionResult?.session;

  const handleContinue = () => {
    if (!hasFiles) { setUploadError('Selecciona al menos un archivo para continuar.'); return; }
    setStep(1);
  };
  const handleClose = () => router.back();
  const handleBack  = () => { if (step > 0) setStep(step - 1); else router.back(); };
  const handleStart = () => {
    if (!completedSession) return;
    router.push({ pathname: '/modals/session' as any, params: { data: JSON.stringify(completedSession) } });
  };

  // ══════════════════════════════════════════════════════════════
  // SCREEN 2 — Tu sesión está lista
  // ══════════════════════════════════════════════════════════════
  if (step === 2) {
    const s = completedSession;
    const concepts: string[] = s?.summary?.slides?.slice(0, 3).map((sl: any) => sl.title) ?? [
      'Conceptos clave del tema',
      'Ideas principales identificadas',
      'Resumen del material estudiado',
    ];
    const statsRow = [
      { emoji: '📚', value: s?.summary?.slides?.length ?? 14, label: 'conceptos'  },
      { emoji: '🎯', value: s?.questions?.length ?? 5,        label: 'actividades' },
      { emoji: '⚡', value: s?.xpReward ?? 95,               label: 'XP'          },
      { emoji: '⏱',  value: `${s?.estimatedDuration ?? 18}m`, label: 'duración'   },
    ];

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        {/* Confetti */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {CONFETTI.map((item, i) => <ConfettiPiece key={i} item={item} />)}
        </View>

        {/* Header */}
        <View style={sh.header}>
          <Pressable onPress={handleBack} style={sh.iconBtn} hitSlop={10}>
            <ArrowLeft size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
          <SlimProgress step={step} />
          <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
            <X size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 110 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <Animated.View style={[s2.heroBlock, s2Entry1Style]}>
            <Animated.View style={celebScaleAnim}>
              <Animated.View style={celebPulseAnim}>
                <Text style={s2.heroEmoji}>🚀</Text>
              </Animated.View>
            </Animated.View>
            <Text style={s2.title}>Tu sesión está lista</Text>
            <Text style={s2.subtitle}>Todo está preparado para que aprendas más rápido.</Text>
          </Animated.View>

          {/* Stats row */}
          <Animated.View style={[s2.statsRow, s2Entry2Style]}>
            {statsRow.map(({ emoji, value, label }) => (
              <View key={label} style={s2.statCell}>
                <Text style={s2.statEmoji}>{emoji}</Text>
                <Text style={s2.statValue}>{value}</Text>
                <Text style={s2.statLabel}>{label}</Text>
              </View>
            ))}
          </Animated.View>

          {/* Concepts preview */}
          <Animated.View style={[s2.conceptsCard, s2Entry3Style]}>
            <Text style={s2.conceptsTitle}>🎯 En esta sesión aprenderás:</Text>
            {concepts.map((concept, i) => (
              <View key={i} style={s2.conceptRow}>
                <LinearGradient colors={[BRAND, NEON]} style={s2.conceptDot} />
                <Text style={s2.conceptText}>{concept}</Text>
              </View>
            ))}
          </Animated.View>
        </ScrollView>

        {/* CTA */}
        <View style={[sh.bottom, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={handleStart} style={{ width: '100%' }}>
            <Animated.View style={ctaPulseAnim}>
              <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sh.ctaBtn}>
                <Text style={sh.ctaText}>🚀 ¡Comenzar sesión!</Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>
          <Pressable hitSlop={12} style={{ marginTop: 12 }}>
            <Text style={s2.saveLink}>Guardar para después</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // SCREEN 1 — Construyendo tu sesión
  // ══════════════════════════════════════════════════════════════
  if (step === 1) {
    const stage = GEN_STAGES[stageIdx];
    const displayStats = completedSession ? {
      concepts:   completedSession.summary?.slides?.length ?? simStats.concepts,
      activities: completedSession.questions?.length        ?? simStats.activities,
      xp:         completedSession.xpReward                 ?? simStats.xp,
    } : simStats;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        <View style={sh.header}>
          <Pressable onPress={handleBack} style={sh.iconBtn} hitSlop={10}>
            <ArrowLeft size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
          <SlimProgress step={step} />
          <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
            <X size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Text style={s1.title}>🧠 Construyendo{'\n'}tu sesión personalizada</Text>

          {/* Animated stage card */}
          <Animated.View style={[s1.stageCard, stageAnimStyle]}>
            <LinearGradient
              colors={['rgba(91,61,245,0.06)', 'rgba(124,90,255,0.03)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={s1.stageEmoji}>{stage.emoji}</Text>
            <Text style={s1.stageLabel}>{stage.label}</Text>
          </Animated.View>

          {/* Dynamic message */}
          <Text style={s1.genMsg}>{GEN_MESSAGES[msgIdx]}</Text>

          {/* Checklist */}
          <View style={s1.checklistCard}>
            <Text style={s1.checklistTitle}>Progreso de generación</Text>
            {CHECKLIST_ITEMS.map((item, i) => {
              const isDone   = i <= completedChecklistIdx;
              const isActive = !isDone && i === activeChecklistIdx;
              return (
                <View key={i} style={s1.checkRow}>
                  <View style={[s1.checkIcon, isDone && s1.checkIconDone, isActive && s1.checkIconActive]}>
                    {isDone
                      ? <Text style={{ fontSize: 11, color: 'white', fontWeight: '900' }}>✓</Text>
                      : isActive
                        ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: BRAND }} />
                        : null}
                  </View>
                  <Text style={[s1.checkLabel, isDone && s1.checkLabelDone, isActive && s1.checkLabelActive]}>
                    {item}
                  </Text>
                  {isDone && <Text style={s1.checkBadge}>✅</Text>}
                </View>
              );
            })}
          </View>

          {/* Live stats */}
          <View style={s1.statsRow}>
            {[
              { emoji: '📚', value: displayStats.concepts,   label: 'Conceptos'   },
              { emoji: '🎯', value: displayStats.activities,  label: 'Actividades' },
              { emoji: '⚡', value: displayStats.xp,          label: 'XP estim.'  },
            ].map(({ emoji, value, label }) => (
              <View key={label} style={s1.statCell}>
                <Text style={s1.statEmoji}>{emoji}</Text>
                <Text style={s1.statValue}>{value}</Text>
                <Text style={s1.statLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Error */}
          {generationError && (
            <View style={s1.errorBanner}>
              <Text style={s1.errorTitle}>Algo salió mal</Text>
              <Text style={s1.errorMsg}>{generationError}</Text>
              <Pressable onPress={() => { setStep(0); setGenerationError(null); }} style={s1.retryBtn}>
                <Text style={s1.retryText}>Volver e intentar de nuevo</Text>
              </Pressable>
            </View>
          )}

          {/* Tip */}
          <View style={s1.tipCard}>
            <Text style={s1.tipText}>
              <Text style={s1.tipBold}>💡 Tip: </Text>
              {TIPS[tipIdx]}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // SCREEN 0 — Sube tus documentos
  // ══════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={sh.header}>
        <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
          <ArrowLeft size={16} color={Colors.ink} strokeWidth={2.5} />
        </Pressable>
        <SlimProgress step={step} />
        <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
          <X size={16} color={Colors.ink} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title block */}
        <Text style={s0.title}>Sube tus documentos</Text>
        <Text style={s0.tagline}>La IA transformará tus apuntes en ejercicios,{'\n'}resúmenes y desafíos personalizados.</Text>

        {/* Benefits */}
        <View style={s0.benefitsRow}>
          {BENEFITS.map(({ emoji, text }) => (
            <View key={emoji} style={s0.benefitCard}>
              <Text style={s0.benefitEmoji}>{emoji}</Text>
              <Text style={s0.benefitText}>{text}</Text>
            </View>
          ))}
        </View>

        {/* Drop zone */}
        <Pressable style={s0.dropZone} onPress={handleFilePick}>
          <View style={s0.dropIconRing}>
            <Text style={{ fontSize: 32 }}>📎</Text>
          </View>
          <Text style={s0.dropMain}>Arrastra tus archivos aquí</Text>
          <Text style={s0.dropSub}>PDFs, fotos o apuntes digitales</Text>
          <View style={{ width: '78%', marginTop: 18 }}>
            <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s0.chooseBtn}>
              <Text style={s0.chooseBtnText}>Elegir archivos</Text>
            </LinearGradient>
          </View>
        </Pressable>

        {/* Camera */}
        <Pressable style={s0.cameraRow} onPress={handleCameraPick}>
          <Text style={s0.cameraText}>📷 O toma una foto con la cámara</Text>
        </Pressable>

        {!!uploadError && <Text style={s0.error}>{uploadError}</Text>}

        {/* Selected files */}
        {hasFiles && (
          <View style={{ gap: 8, marginBottom: 8 }}>
            {selectedFiles.map(file => (
              <View key={file.uri} style={s0.fileRow}>
                <FileTypeBadge mimeType={file.mimeType} />
                <View style={{ flex: 1 }}>
                  <Text style={s0.fileName} numberOfLines={1}>{file.name}</Text>
                  <Text style={s0.fileMeta}>{file.sizeText}</Text>
                </View>
                <Pressable onPress={() => removeFile(file.uri)} hitSlop={8} style={s0.removeBtn}>
                  <X size={13} color={Colors.muted} strokeWidth={2.5} />
                </Pressable>
                <CheckCircle size={20} color={Colors.teal} strokeWidth={2} style={{ marginLeft: 6 }} />
              </View>
            ))}
          </View>
        )}

        {/* Recent files */}
        {!hasFiles && (
          <>
            <Text style={s0.recentLabel}>RECIENTES</Text>
            {RECENT_FILES.map(file => (
              <View key={file.name} style={s0.fileRow}>
                <FileTypeBadge mimeType={file.mimeType} />
                <View style={{ flex: 1 }}>
                  <Text style={s0.fileName} numberOfLines={1}>{file.name}</Text>
                  <Text style={s0.fileMeta}>{file.sizeText}</Text>
                </View>
                <Pressable onPress={() => addFiles([file])} style={s0.useBtn}>
                  <Text style={s0.useBtnText}>Usar</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {hasFiles && (
        <View style={[sh.bottom, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={handleContinue} style={{ width: '100%' }}>
            <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sh.ctaBtn}>
              <Text style={sh.ctaText}>Continuar →</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Shared ────────────────────────────────────────────────────────
const sh = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  bottom:  { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: BG },
  ctaBtn:  { paddingVertical: 17, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '800', color: 'white' },
});

// ── Screen 0 ──────────────────────────────────────────────────────
const s0 = StyleSheet.create({
  title:    { fontSize: SM ? 24 : 28, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5, marginBottom: 6 },
  tagline:  { fontSize: 14, color: Colors.ink3, lineHeight: 21, marginBottom: 18 },

  benefitsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  benefitCard: { flex: 1, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, paddingVertical: SM ? 12 : 14, paddingHorizontal: 8, alignItems: 'center', gap: 6, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  benefitEmoji:{ fontSize: SM ? 22 : 26 },
  benefitText: { fontSize: SM ? 10 : 11, fontWeight: '700', color: Colors.ink2, textAlign: 'center', lineHeight: 15 },

  dropZone:    { borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(91,61,245,0.25)', borderRadius: 22, paddingVertical: SM ? 26 : 32, paddingHorizontal: 20, alignItems: 'center', backgroundColor: 'rgba(91,61,245,0.02)', marginBottom: 12 },
  dropIconRing:{ width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(91,61,245,0.07)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  dropMain:    { fontSize: 15, fontWeight: '700', color: Colors.ink, marginBottom: 4, textAlign: 'center' },
  dropSub:     { fontSize: 13, color: Colors.muted, textAlign: 'center' },
  chooseBtn:   { paddingVertical: 13, borderRadius: 30, alignItems: 'center' },
  chooseBtnText:{ fontSize: 15, fontWeight: '800', color: 'white' },

  cameraRow:  { alignItems: 'center', paddingVertical: 8, marginBottom: 12 },
  cameraText: { fontSize: 13, color: BRAND, fontWeight: '700' },

  error:    { color: Colors.rose, fontSize: 12, fontWeight: '700', marginBottom: 10 },

  fileRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, padding: 12, gap: 12 },
  fileName: { fontSize: 13, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  fileMeta: { fontSize: 11, color: Colors.muted },
  removeBtn:{ width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },

  recentLabel:{ fontSize: 10, fontWeight: '700', color: Colors.muted, letterSpacing: 0.7, marginBottom: 10, marginTop: 4 },
  useBtn:    { backgroundColor: 'rgba(91,61,245,0.08)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  useBtnText:{ fontSize: 12, fontWeight: '700', color: BRAND },
});

// ── Screen 1 ──────────────────────────────────────────────────────
const s1 = StyleSheet.create({
  title:    { fontSize: SM ? 22 : 26, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5, lineHeight: SM ? 30 : 36, marginBottom: 18 },

  stageCard:  { borderRadius: 24, paddingVertical: SM ? 30 : 38, alignItems: 'center', overflow: 'hidden', shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 6, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(91,61,245,0.12)', backgroundColor: 'white' },
  stageEmoji: { fontSize: SM ? 60 : 74, marginBottom: 10 },
  stageLabel: { fontSize: SM ? 16 : 18, fontWeight: '800', color: Colors.ink, letterSpacing: -0.3 },

  genMsg:   { fontSize: 14, color: Colors.ink2, textAlign: 'center', fontWeight: '600', lineHeight: 21, marginBottom: 18 },

  checklistCard:  { backgroundColor: 'white', borderRadius: 20, borderWidth: 1, borderColor: Colors.line, padding: SM ? 14 : 18, marginBottom: 14, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  checklistTitle: { fontSize: 13, fontWeight: '800', color: Colors.ink, marginBottom: 12 },
  checkRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 5 },
  checkIcon:      { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: Colors.line2, alignItems: 'center', justifyContent: 'center' },
  checkIconDone:  { backgroundColor: '#059669', borderColor: '#059669' },
  checkIconActive:{ backgroundColor: 'rgba(91,61,245,0.07)', borderColor: BRAND },
  checkLabel:     { flex: 1, fontSize: 13, color: Colors.muted, fontWeight: '600' },
  checkLabelDone: { color: '#059669', fontWeight: '700' },
  checkLabelActive:{ color: Colors.ink, fontWeight: '700' },
  checkBadge:     { fontSize: 14 },

  statsRow:  { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCell:  { flex: 1, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, paddingVertical: SM ? 10 : 13, paddingHorizontal: 8, alignItems: 'center', gap: 3, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  statEmoji: { fontSize: SM ? 18 : 20 },
  statValue: { fontSize: SM ? 19 : 22, fontWeight: '900', color: BRAND, letterSpacing: -0.5 },
  statLabel: { fontSize: 9, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },

  errorBanner:{ backgroundColor: 'rgba(255,77,109,0.07)', borderColor: 'rgba(255,77,109,0.2)', borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 14 },
  errorTitle: { fontSize: 15, fontWeight: '800', color: Colors.rose, marginBottom: 6 },
  errorMsg:   { fontSize: 13, color: Colors.ink3, lineHeight: 19, marginBottom: 14 },
  retryBtn:   { backgroundColor: Colors.rose, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  retryText:  { fontSize: 14, fontWeight: '700', color: 'white' },

  tipCard:  { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(196,248,82,0.12)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(196,248,82,0.3)', padding: 14 },
  tipText:  { flex: 1, fontSize: 13, color: Colors.ink2, lineHeight: 19 },
  tipBold:  { fontWeight: '800', color: Colors.ink },
});

// ── Screen 2 ──────────────────────────────────────────────────────
const s2 = StyleSheet.create({
  heroBlock: { alignItems: 'center', marginVertical: 8, marginBottom: 20 },
  heroEmoji: { fontSize: SM ? 72 : 88, marginBottom: 10 },
  title:     { fontSize: SM ? 26 : 30, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5, textAlign: 'center', marginBottom: 8 },
  subtitle:  { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 21, paddingHorizontal: 12 },

  statsRow:  { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCell:  { flex: 1, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, paddingVertical: SM ? 10 : 13, paddingHorizontal: 6, alignItems: 'center', gap: 3, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statEmoji: { fontSize: SM ? 18 : 20 },
  statValue: { fontSize: SM ? 16 : 18, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5 },
  statLabel: { fontSize: 9, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },

  conceptsCard:  { backgroundColor: 'white', borderRadius: 20, borderWidth: 1, borderColor: Colors.line, padding: SM ? 16 : 20, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 3, marginBottom: 8 },
  conceptsTitle: { fontSize: 14, fontWeight: '800', color: Colors.ink, marginBottom: 14 },
  conceptRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 11 },
  conceptDot:    { width: 8, height: 8, borderRadius: 4 },
  conceptText:   { flex: 1, fontSize: 14, color: Colors.ink2, fontWeight: '600' },

  saveLink: { fontSize: 14, fontWeight: '600', color: Colors.muted, textAlign: 'center' },
});
