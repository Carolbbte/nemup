import ScreenContainer from '@/components/ScreenContainer';
import { Colors } from '@/constants/Colors';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CheckCircle, ChevronRight, Upload, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
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
const SM = SCREEN_H < 740;

const BG    = '#F7F8FC';
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
  { uri: 'file:///FichaQuimica.png', name: 'Ficha Química.png', mimeType: 'image/png', sizeText: '780 KB', sizeBytes: 780000 },
];

const TIPS = [
  'Estudiar en intervalos cortos es más efectivo que horas seguidas.',
  'Las preguntas activan tu memoria mejor que releer apuntes.',
  'Tu cerebro consolida lo aprendido mientras duermes.',
  'Usar tus propios apuntes te da el doble de XP en cada sesión.',
  'La práctica espaciada reduce el tiempo total de estudio.',
];

// ── Confetti — mismo patrón que onboarding ────────────────────────
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
    <Animated.View
      style={[
        cf.piece, style,
        { left: item.left, width: item.size, height: item.size, backgroundColor: item.bg,
          borderRadius: 'radius' in item ? (item as any).radius : 2 },
      ]}
    />
  );
}

const cf = StyleSheet.create({
  piece: { position: 'absolute', top: -20 },
});

// ── Floating emoji (mascot area) ──────────────────────────────────
function FloatingEmoji({ emoji, style: posStyle, delay = 0 }: { emoji: string; style?: object; delay?: number }) {
  const ty = useSharedValue(0);
  useEffect(() => {
    ty.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(-9, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
        withTiming(0,  { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      ), -1, false,
    ));
  }, []);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute' }, posStyle, anim]}>
      <Text style={{ fontSize: 26 }}>{emoji}</Text>
    </Animated.View>
  );
}

// ── Slim gradient progress bar ────────────────────────────────────
function SlimProgress({ step }: { step: number }) {
  const fill = useSharedValue(((step + 1) / 3) * 100);
  useEffect(() => {
    fill.value = withTiming(((step + 1) / 3) * 100, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [step]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` as any }));
  return (
    <View style={prog.track}>
      <Animated.View style={[prog.fill, fillStyle]}>
        <LinearGradient colors={[BRAND, LIME]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}
const prog = StyleSheet.create({
  track: { flex: 1, height: 5, backgroundColor: Colors.line, borderRadius: 99, overflow: 'hidden', marginHorizontal: 10 },
  fill:  { height: '100%', borderRadius: 99, overflow: 'hidden' },
});

// ── File type icon ────────────────────────────────────────────────
function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.includes('pdf'))   return <View style={fti.pdf}><Text style={fti.pdfText}>PDF</Text></View>;
  if (mimeType.includes('image')) return <View style={fti.img}><Text style={{ fontSize: 20 }}>🖼️</Text></View>;
  return <View style={fti.doc}><Text style={{ fontSize: 20 }}>📄</Text></View>;
}
const fti = StyleSheet.create({
  pdf:     { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  pdfText: { fontSize: 11, fontWeight: '800', color: '#DC2626' },
  img:     { width: 44, height: 44, borderRadius: 12, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  doc:     { width: 44, height: 44, borderRadius: 12, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
});

// ── Utilities ─────────────────────────────────────────────────────
function getBackendBaseUrl() { return BACKEND_BASE_URL || 'http://localhost:3000'; }

const SUBJECT_EMOJI: Record<string, string> = {
  biología: '🧬', biologia: '🧬', matemática: '📐', matematica: '📐',
  historia: '📜', física: '⚗️', fisica: '⚗️', química: '🔬', quimica: '🔬',
  lenguaje: '📝', inglés: '🌐', ingles: '🌐',
};
function subjectEmoji(s: string) {
  const key = s?.toLowerCase() ?? '';
  return Object.entries(SUBJECT_EMOJI).find(([k]) => key.includes(k))?.[1] ?? '📘';
}
function difficultyLabel(d?: string) {
  const map: Record<string, string> = { adaptive: 'Adaptativa', easy: 'Fácil', hard: 'Difícil', medium: 'Media' };
  return d ? (map[d] ?? d.charAt(0).toUpperCase() + d.slice(1)) : 'Adaptativa';
}
function normalizeMime(name: string, mime: string) {
  if (!mime || mime === 'application/octet-stream') {
    if (name.toLowerCase().endsWith('.pdf')) return 'application/pdf';
    if (name.toLowerCase().match(/\.(jpg|jpeg|png|gif|heic|webp)$/i)) return 'image/jpeg';
  }
  return mime;
}
function parseSseEvents(raw: string, handle: (event: string, payload: any) => void) {
  const events = raw.split(/\r?\n\r?\n/);
  const leftover = events.pop() ?? '';
  for (const block of events) {
    if (!block.trim()) continue;
    let name = 'message', data = '';
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) name = line.replace('event:', '').trim();
      if (line.startsWith('data:')) data += line.replace('data:', '').trim();
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
  const [step, setStep] = useState(0);                             // 0=upload 1=generating 2=done
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
  const [uploadError, setUploadError]     = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [progressEvents, setProgressEvents]   = useState<SessionProgress[]>([]);
  const [sessionResult, setSessionResult]     = useState<any | null>(null);
  const [tipIdx, setTipIdx] = useState(0);

  const sseBufferRef         = useRef('');
  const lastLenRef           = useRef(0);
  const xhrRef               = useRef<XMLHttpRequest | null>(null);
  const generationStartedRef = useRef(false);
  const autoNavRef           = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Shared values (all unconditional) ─────────────────────────
  const celebScale = useSharedValue(0);
  const celebPulse = useSharedValue(1);
  const ctaPulse   = useSharedValue(0);

  const celebScaleAnim = useAnimatedStyle(() => ({ transform: [{ scale: celebScale.value }] }));
  const celebPulseAnim = useAnimatedStyle(() => ({ transform: [{ scale: celebPulse.value }] }));
  const ctaPulseAnim   = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ctaPulse.value * 0.014 }],
    shadowOpacity: 0.24 + ctaPulse.value * 0.16,
  }));

  // ── Effects ────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 2) return;
    celebScale.value = withSpring(1, { damping: 11, stiffness: 180 });
    celebPulse.value = withDelay(700, withRepeat(
      withSequence(
        withTiming(1.1,  { duration: 350 }),
        withTiming(1.0,  { duration: 350 }),
        withDelay(3400, withTiming(1.0, { duration: 0 })),
      ), -1, false,
    ));
    ctaPulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1800 }), withTiming(0, { duration: 1800 })), -1, false,
    );
  }, [step]);

  useEffect(() => {
    if (step !== 1) return;
    const t = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 4000);
    return () => clearInterval(t);
  }, [step]);

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
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: true });
        if (!result.canceled && result.assets?.length) {
          addFiles(result.assets.map(a => ({ uri: a.uri, name: a.fileName ?? `Foto-${Date.now()}.jpg`, mimeType: a.type ?? 'image/jpeg', sizeText: a.fileSize ? `${Math.round(a.fileSize / 1024)} KB` : 'N/A', sizeBytes: a.fileSize ?? 0 })));
        }
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        addFiles([{ uri: a.uri, name: a.fileName ?? `Foto-${Date.now()}.jpg`, mimeType: a.type ?? 'image/jpeg', sizeText: a.fileSize ? `${Math.round(a.fileSize / 1024)} KB` : 'N/A', sizeBytes: a.fileSize ?? 0 }]);
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
    lastLenRef.current = 0;
    try {
      const primary = selectedFiles[0];
      const formData = new FormData();
      formData.append('config', JSON.stringify({
        documentId: primary.name,
        format: ['quizzes', 'flashcards'],
        difficulty: 'adaptive',
        estimatedDuration: 18,
        subject: 'Biología',
        topic: 'Mitosis y meiosis',
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
          if (event === 'complete')  setSessionResult(payload);
          if (event === 'error')     setGenerationError(payload?.message ?? 'Error inesperado.');
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

  useEffect(() => {
    if (sessionResult && step === 1) {
      autoNavRef.current = setTimeout(() => setStep(2), 800);
      return () => { if (autoNavRef.current) clearTimeout(autoNavRef.current); };
    }
  }, [sessionResult, step]);

  const lastProgress    = progressEvents[progressEvents.length - 1];
  const progressPct     = lastProgress?.progress ?? 0;
  const progressMsg     = lastProgress?.message ?? 'Conectando con el servidor…';
  const completedSession = sessionResult?.session;
  const hasFiles = selectedFiles.length > 0;

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
  // PANTALLA 2 — ¡Tu sesión está lista!
  // ══════════════════════════════════════════════════════════════
  if (step === 2) {
    const s = completedSession;
    return (
      <ScreenContainer style={s2.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        {/* Confetti overlay */}
        <View style={s2.confettiLayer} pointerEvents="none">
          {CONFETTI.map((item, i) => <ConfettiPiece key={i} item={item} />)}
        </View>

        {/* Header */}
        <View style={shared.header}>
          <Pressable onPress={handleBack} style={shared.iconBtn} hitSlop={10}>
            <Text style={shared.iconBtnText}>←</Text>
          </Pressable>
          <SlimProgress step={step} />
          <Pressable onPress={handleClose} style={shared.iconBtn} hitSlop={10}>
            <X size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s2.scroll, { paddingBottom: insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Celebration emoji */}
          <View style={s2.celebWrap}>
            <Animated.View style={celebScaleAnim}>
              <Animated.Text style={[s2.celebEmoji, celebPulseAnim]}>🎉</Animated.Text>
            </Animated.View>
          </View>

          <Text style={s2.title}>¡Tu sesión está lista!</Text>
          <Text style={s2.subtitle}>La IA creó una sesión personalizada para ti.</Text>

          {/* Stats card */}
          <View style={s2.card}>
            {[
              { emoji: '📝', label: `${s?.questions?.length ?? 0} actividades creadas` },
              { emoji: '🃏', label: `${s?.flashcards?.length ?? 0} flashcards` },
              { emoji: '⏱️', label: `Duración estimada: ${s?.estimatedDuration ?? 18} min` },
              { emoji: '⚡', label: `+${s?.xpReward ?? 0} XP al completar` },
            ].map(({ emoji, label }) => (
              <View key={label} style={s2.statRow}>
                <Text style={s2.statEmoji}>{emoji}</Text>
                <Text style={s2.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* CTA */}
        <View style={[s2.actions, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable onPress={handleStart} style={{ width: '100%' }}>
            <Animated.View style={ctaPulseAnim}>
              <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s2.ctaBtn}>
                <Text style={s2.ctaText}>Ver mi sesión</Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>
          <Pressable hitSlop={12} style={{ marginTop: 14 }}>
            <Text style={s2.saveLink}>Guardar para después</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // PANTALLA 1 — La IA está trabajando…
  // ══════════════════════════════════════════════════════════════
  if (step === 1) {
    return (
      <SafeAreaView style={s1.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        <View style={shared.header}>
          <Pressable onPress={handleBack} style={shared.iconBtn} hitSlop={10}>
            <Text style={shared.iconBtnText}>←</Text>
          </Pressable>
          <SlimProgress step={step} />
          <Pressable onPress={handleClose} style={shared.iconBtn} hitSlop={10}>
            <X size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[s1.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s1.title}>La IA está trabajando…</Text>
          <Text style={s1.subtitle}>
            Analizando tus documentos{'\n'}para crear la mejor sesión.
          </Text>

          {/* Mascot area */}
          <View style={s1.mascotCard}>
            <View style={s1.mascotInner}>
              {/* Floating icons */}
              <FloatingEmoji emoji="📄" style={{ top: 10, left: 10 }}  delay={0}   />
              <FloatingEmoji emoji="💡" style={{ top: 10, right: 10 }} delay={400} />
              <FloatingEmoji emoji="📊" style={{ bottom: 10, right: 30 }} delay={800} />

              {/* Main emoji */}
              <Text style={s1.mascotEmoji}>🤖</Text>
            </View>
          </View>

          {/* Progress card */}
          <View style={s1.progressCard}>
            <View style={s1.progressHeader}>
              <Text style={s1.progressTitle}>Progreso del análisis</Text>
              <Text style={s1.progressPct}>{progressPct}%</Text>
            </View>
            <View style={s1.progressTrack}>
              <View style={[s1.progressFill, { width: `${progressPct}%` }]}>
                <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
              </View>
            </View>
            <Text style={s1.progressMsg} numberOfLines={1}>{progressMsg}</Text>
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
            <Text style={s1.tipIcon}>💡</Text>
            <Text style={s1.tipText}>
              <Text style={s1.tipBold}>Tip: </Text>
              {TIPS[tipIdx]}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // PANTALLA 0 — Sube tus documentos
  // ══════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={s0.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={shared.header}>
        <Pressable onPress={handleClose} style={shared.iconBtn} hitSlop={10}>
          <Text style={shared.iconBtnText}>←</Text>
        </Pressable>
        <SlimProgress step={step} />
        <Pressable onPress={handleClose} style={shared.iconBtn} hitSlop={10}>
          <X size={16} color={Colors.ink} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s0.scroll, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s0.title}>Sube tus documentos</Text>
        <Text style={s0.subtitle}>Puedes subir varios archivos.</Text>

        {/* Drop zone */}
        <Pressable style={s0.dropZone} onPress={handleFilePick}>
          <View style={s0.dropIconWrap}>
            <Upload size={36} color={BRAND} strokeWidth={1.8} />
          </View>
          <Text style={s0.dropMainText}>Arrastra tus archivos aquí</Text>
          <Text style={s0.dropSubText}>o toca para buscar</Text>
          <Pressable onPress={handleFilePick} style={s0.chooseBtnWrap}>
            <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s0.chooseBtn}>
              <Text style={s0.chooseBtnText}>Elegir archivos</Text>
            </LinearGradient>
          </Pressable>
        </Pressable>

        {/* Camera option */}
        <Pressable style={s0.cameraLink} onPress={handleCameraPick}>
          <Text style={s0.cameraLinkText}>O toma una foto con la cámara</Text>
        </Pressable>

        {uploadError ? <Text style={s0.error}>{uploadError}</Text> : null}

        {/* Selected files list */}
        {hasFiles && (
          <View style={s0.fileList}>
            {selectedFiles.map(file => (
              <View key={file.uri} style={s0.fileRow}>
                <FileTypeIcon mimeType={file.mimeType} />
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
                <FileTypeIcon mimeType={file.mimeType} />
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

      {/* Bottom CTA — aparece solo cuando hay archivos */}
      {hasFiles && (
        <View style={[s0.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={handleContinue} style={{ width: '100%' }}>
            <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s0.continueBtn}>
              <Text style={s0.continueBtnText}>Continuar</Text>
              <ChevronRight size={18} color="white" strokeWidth={2.5} />
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Shared header styles ──────────────────────────────────────────
const shared = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  iconBtnText: { fontSize: 17, color: Colors.ink, fontWeight: '700' },
});

// ── Screen 0 styles ───────────────────────────────────────────────
const s0 = StyleSheet.create({
  page:  { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 20, paddingTop: 4 },
  title: { fontSize: SM ? 24 : 28, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 15, color: Colors.ink3, marginBottom: 24, lineHeight: 22 },

  dropZone: { borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(91,61,245,0.3)', borderRadius: 22, paddingVertical: 32, paddingHorizontal: 20, alignItems: 'center', backgroundColor: 'rgba(91,61,245,0.03)', marginBottom: 14 },
  dropIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(91,61,245,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  dropMainText: { fontSize: 15, fontWeight: '700', color: Colors.ink, marginBottom: 4, textAlign: 'center' },
  dropSubText:  { fontSize: 13, color: Colors.muted, marginBottom: 18, textAlign: 'center' },
  chooseBtnWrap: { width: '80%' },
  chooseBtn: { paddingVertical: 13, borderRadius: 30, alignItems: 'center' },
  chooseBtnText: { fontSize: 15, fontWeight: '800', color: 'white' },

  cameraLink: { alignItems: 'center', paddingVertical: 8, marginBottom: 10 },
  cameraLinkText: { fontSize: 13, color: BRAND, fontWeight: '700' },

  error: { color: Colors.rose, fontSize: 12, fontWeight: '700', marginBottom: 10 },

  fileList: { marginTop: 4, gap: 8, marginBottom: 8 },
  fileRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, padding: 12, gap: 12 },
  fileName: { fontSize: 13, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  fileMeta: { fontSize: 11, color: Colors.muted },
  removeBtn: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },

  recentLabel: { fontSize: 10, fontWeight: '700', color: Colors.muted, letterSpacing: 0.7, marginBottom: 10, marginTop: 6 },
  useBtn:    { backgroundColor: 'rgba(91,61,245,0.08)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  useBtnText: { fontSize: 12, fontWeight: '700', color: BRAND },

  bottomBar:   { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: BG },
  continueBtn: { paddingVertical: 16, borderRadius: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  continueBtnText: { fontSize: 16, fontWeight: '800', color: 'white' },
});

// ── Screen 1 styles ───────────────────────────────────────────────
const s1 = StyleSheet.create({
  page:   { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 20, paddingTop: 4 },
  title:  { fontSize: SM ? 22 : 26, fontWeight: '900', color: Colors.ink, letterSpacing: -0.4, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.ink3, lineHeight: 22, textAlign: 'center', marginBottom: 28 },

  mascotCard:  { backgroundColor: 'rgba(91,61,245,0.05)', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(91,61,245,0.1)', marginBottom: 20, overflow: 'hidden', height: SM ? 190 : 220 },
  mascotInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mascotEmoji: { fontSize: 80 },

  progressCard: { backgroundColor: 'white', borderRadius: 20, borderWidth: 1, borderColor: Colors.line, padding: 18, marginBottom: 16, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressTitle: { fontSize: 14, fontWeight: '800', color: Colors.ink },
  progressPct:   { fontSize: 16, fontWeight: '900', color: BRAND },
  progressTrack: { height: 10, backgroundColor: Colors.bgSoft, borderRadius: 99, overflow: 'hidden', marginBottom: 10 },
  progressFill:  { height: '100%', borderRadius: 99, overflow: 'hidden' },
  progressMsg:   { fontSize: 12, color: Colors.muted, fontStyle: 'italic' },

  errorBanner: { backgroundColor: 'rgba(255,77,109,0.07)', borderColor: 'rgba(255,77,109,0.2)', borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 16 },
  errorTitle:  { fontSize: 15, fontWeight: '800', color: Colors.rose, marginBottom: 6 },
  errorMsg:    { fontSize: 13, color: Colors.ink3, lineHeight: 19, marginBottom: 14 },
  retryBtn:    { backgroundColor: Colors.rose, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  retryText:   { fontSize: 14, fontWeight: '700', color: 'white' },

  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(196,248,82,0.12)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(196,248,82,0.3)', padding: 14 },
  tipIcon: { fontSize: 18, marginTop: 1 },
  tipText: { flex: 1, fontSize: 13, color: Colors.ink2, lineHeight: 19 },
  tipBold: { fontWeight: '800', color: Colors.ink },
});

// ── Screen 2 styles ───────────────────────────────────────────────
const s2 = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  confettiLayer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  scroll: { paddingHorizontal: 24, paddingTop: 8, alignItems: 'center', zIndex: 1 },

  celebWrap:  { alignItems: 'center', marginBottom: 18, marginTop: 8 },
  celebEmoji: { fontSize: 90 },

  title:    { fontSize: SM ? 26 : 30, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.ink3, textAlign: 'center', lineHeight: 21, marginBottom: 24 },

  card: { width: '100%', backgroundColor: 'white', borderRadius: 22, borderWidth: 1, borderColor: Colors.line, padding: 20, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 3 },
  statRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.line },
  statEmoji: { fontSize: 22, width: 28 },
  statLabel: { fontSize: 14, fontWeight: '600', color: Colors.ink2, flex: 1 },

  actions: { paddingHorizontal: 24, paddingTop: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: BG, zIndex: 2 },
  ctaBtn:  { paddingVertical: 16, borderRadius: 30, alignItems: 'center', width: '100%' },
  ctaText: { fontSize: 17, fontWeight: '800', color: 'white' },
  saveLink: { fontSize: 14, fontWeight: '600', color: Colors.muted },
});
