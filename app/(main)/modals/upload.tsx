import ScreenContainer from '@/components/ScreenContainer';
import { Colors } from '@/constants/Colors';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  BookOpen,
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Plus,
  Sparkles,
  Target,
  X,
  Zap,
} from 'lucide-react-native';
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

const BG = '#F7F8FC';
const BRAND = '#5B3DF5';
const BRAND2 = '#7C5AFF';

// ── Types ─────────────────────────────────────────────────────────
type UploadedFile = {
  uri: string;
  name: string;
  mimeType: string;
  sizeText: string;
  sizeBytes: number;
};

type SessionProgress = {
  stage: 'uploading' | 'transcribing' | 'extracting' | 'generating' | 'validating_grounding' | 'done';
  status: 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
};

type GeneratedQuestion = {
  id: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  sourceQuote: string;
  difficulty: string;
};

// ── Constants ─────────────────────────────────────────────────────
const BACKEND_BASE_URL = 'https://nemup-production.up.railway.app';

const RECENT_FILES: UploadedFile[] = [
  { uri: 'file:///ResumenHistoriaXXI.pdf', name: 'Resumen Historia XXI.pdf', mimeType: 'application/pdf', sizeText: '1.3 MB', sizeBytes: 1350000 },
  { uri: 'file:///FichaQuimica.png', name: 'Ficha Química.png', mimeType: 'image/png', sizeText: '780 KB', sizeBytes: 780000 },
];

// ── Utilities ──────────────────────────────────────────────────────
function getBackendBaseUrl() { return BACKEND_BASE_URL || 'http://localhost:3000'; }

const SUBJECT_EMOJI: Record<string, string> = {
  biología: '🧬', biologia: '🧬', matemática: '📐', matematica: '📐',
  historia: '📜', física: '⚗️', fisica: '⚗️', química: '🔬', quimica: '🔬',
  lenguaje: '📝', inglés: '🌐', ingles: '🌐',
};
function subjectEmoji(subject: string) {
  const key = subject?.toLowerCase() ?? '';
  return Object.entries(SUBJECT_EMOJI).find(([k]) => key.includes(k))?.[1] ?? '📘';
}
function difficultyLabel(d?: string) {
  const map: Record<string, string> = { adaptive: 'Adaptativa', easy: 'Fácil', hard: 'Difícil', medium: 'Media' };
  return d ? (map[d] ?? d.charAt(0).toUpperCase() + d.slice(1)) : 'Adaptativa';
}
function normalizeMime(name: string, mimeType: string) {
  if (!mimeType || mimeType === 'application/octet-stream') {
    if (name.toLowerCase().endsWith('.pdf')) return 'application/pdf';
    if (name.toLowerCase().match(/\.(jpg|jpeg|png|gif|heic|webp)$/i)) return 'image/jpeg';
  }
  return mimeType;
}

function parseSseEvents(rawChunk: string, handleEvent: (event: string, payload: any) => void) {
  const events = rawChunk.split(/\r?\n\r?\n/);
  const leftover = events.pop() ?? '';
  for (const eventText of events) {
    if (!eventText.trim()) continue;
    const lines = eventText.split(/\r?\n/);
    let eventName = 'message';
    let dataText = '';
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.replace('event:', '').trim();
      if (line.startsWith('data:')) dataText += line.replace('data:', '').trim();
    }
    if (dataText) {
      try { handleEvent(eventName, JSON.parse(dataText)); }
      catch (e) { console.warn('[SSE] parse error:', dataText, e); }
    }
  }
  return leftover;
}

// ── Slim progress bar ─────────────────────────────────────────────
function SlimProgress({ step }: { step: number }) {
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming((step / 3) * 100, { duration: 400, easing: Easing.out(Easing.cubic) });
  }, [step]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` as any }));
  return (
    <View style={prog.track}>
      <Animated.View style={[prog.fill, fillStyle]} />
    </View>
  );
}
const prog = StyleSheet.create({
  track: { flex: 1, height: 3, backgroundColor: Colors.line, borderRadius: 99, overflow: 'hidden', marginHorizontal: 12 },
  fill: { height: '100%', backgroundColor: BRAND, borderRadius: 99 },
});

// ── FadeIn card ───────────────────────────────────────────────────
function FadeInCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const op = useSharedValue(0);
  const ty = useSharedValue(12);
  const anim = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }));
  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 300 }));
    ty.value = withDelay(delay, withTiming(0, { duration: 300 }));
  }, []);
  return <Animated.View style={anim}>{children}</Animated.View>;
}

// ── Pulsing dots loader ───────────────────────────────────────────
function PulsingDots() {
  const d1 = useSharedValue(0.3);
  const d2 = useSharedValue(0.3);
  const d3 = useSharedValue(0.3);
  useEffect(() => {
    const p = (sv: any, delay: number) =>
      (sv.value = withDelay(delay, withRepeat(
        withSequence(withTiming(1, { duration: 500 }), withTiming(0.3, { duration: 500 })), -1, false,
      )));
    p(d1, 0); p(d2, 180); p(d3, 360);
  }, []);
  const a1 = useAnimatedStyle(() => ({ opacity: d1.value }));
  const a2 = useAnimatedStyle(() => ({ opacity: d2.value }));
  const a3 = useAnimatedStyle(() => ({ opacity: d3.value }));
  return (
    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
      <Animated.View style={[pd.dot, a1]} />
      <Animated.View style={[pd.dot, a2]} />
      <Animated.View style={[pd.dot, a3]} />
    </View>
  );
}
const pd = StyleSheet.create({ dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND } });

// ── Main component ─────────────────────────────────────────────────
export default function UploadFlowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ── State ──
  const [step, setStep] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
  const [uploadError, setUploadError] = useState('');
  const [sessionType, setSessionType] = useState('practice');
  const [sessionTypeExpanded, setSessionTypeExpanded] = useState(false);
  const [duration, setDuration] = useState(18);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [progressEvents, setProgressEvents] = useState<SessionProgress[]>([]);
  const [transcriptChunks, setTranscriptChunks] = useState<string[]>([]);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [sessionResult, setSessionResult] = useState<any | null>(null);
  const sseBufferRef = useRef('');
  const lastResponseLengthRef = useRef(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const generationStartedRef = useRef(false);
  const autoNavRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Shared values (all unconditional) ──
  const checkScale = useSharedValue(0);
  const checkPulse = useSharedValue(1);
  const ctaPulse = useSharedValue(0);
  const laserY = useSharedValue(0);

  const checkScaleAnim = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  const checkPulseAnim = useAnimatedStyle(() => ({
    transform: [{ scale: checkPulse.value }],
    shadowOpacity: 0.3 + checkPulse.value * 0.25,
  }));
  const ctaPulseAnim = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ctaPulse.value * 0.012 }],
    shadowOpacity: 0.22 + ctaPulse.value * 0.18,
  }));
  const laserAnim = useAnimatedStyle(() => ({ top: 18 + laserY.value * 152 }));

  useEffect(() => {
    if (step !== 1) { laserY.value = 0; return; }
    laserY.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
  }, [step]);

  useEffect(() => {
    if (step !== 3) return;
    checkScale.value = withSpring(1, { damping: 12, stiffness: 200 });
    checkPulse.value = withDelay(800, withRepeat(
      withSequence(withTiming(1.08, { duration: 400 }), withTiming(1.0, { duration: 400 }), withDelay(3200, withTiming(1.0, { duration: 0 }))),
      -1, false,
    ));
    ctaPulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 2000 }), withTiming(0, { duration: 2000 })), -1, false,
    );
  }, [step]);

  // ── File helpers ──
  const addFiles = (incoming: UploadedFile[]) => {
    setSelectedFiles(prev => {
      const existingUris = new Set(prev.map(f => f.uri));
      const deduped = incoming.filter(f => !existingUris.has(f.uri));
      return [...prev, ...deduped];
    });
    setUploadError('');
  };
  const removeFile = (uri: string) => setSelectedFiles(prev => prev.filter(f => f.uri !== uri));

  // ── Handlers ──
  const pushProgressEvent = useCallback((event: SessionProgress) => {
    setProgressEvents(prev => [...prev, event]);
  }, []);

  const handleDocumentPick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const picked: UploadedFile[] = result.assets.map(asset => ({
        uri: asset.uri,
        name: asset.name ?? 'archivo',
        mimeType: normalizeMime(asset.name ?? '', asset.mimeType ?? ''),
        sizeText: asset.size ? `${(asset.size / 1024).toFixed(1)} KB` : 'N/A',
        sizeBytes: asset.size ?? 0,
      }));
      addFiles(picked);
    } catch (error) {
      setUploadError(`No se pudo seleccionar el archivo: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleCameraPick = async () => {
    try {
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          allowsMultipleSelection: true,
        });
        if (!result.canceled && result.assets?.length) {
          addFiles(result.assets.map(a => ({
            uri: a.uri,
            name: a.fileName ?? `Foto-${Date.now()}.jpg`,
            mimeType: a.type ?? 'image/jpeg',
            sizeText: a.fileSize ? `${Math.round(a.fileSize / 1024)} KB` : 'N/A',
            sizeBytes: a.fileSize ?? 0,
          })));
        }
        return;
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara para tomar una foto.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        addFiles([{
          uri: a.uri,
          name: a.fileName ?? `Foto-${Date.now()}.jpg`,
          mimeType: a.type ?? 'image/jpeg',
          sizeText: a.fileSize ? `${Math.round(a.fileSize / 1024)} KB` : 'N/A',
          sizeBytes: a.fileSize ?? 0,
        }]);
      }
    } catch (error) {
      setUploadError(`No se pudo usar la cámara: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleUseRecent = (file: UploadedFile) => addFiles([file]);

  const startSseGeneration = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    setGenerationError(null);
    setProgressEvents([]);
    setTranscriptChunks([]);
    setGeneratedQuestions([]);
    sseBufferRef.current = '';
    lastResponseLengthRef.current = 0;
    try {
      const primary = selectedFiles[0];
      const formData = new FormData();
      formData.append('config', JSON.stringify({
        documentId: primary.name,
        format: sessionType === 'practice' ? ['quizzes', 'flashcards'] : sessionType === 'exam' ? ['quizzes', 'summary'] : ['summary', 'flashcards'],
        difficulty: sessionType === 'review' ? 'easy' : sessionType === 'exam' ? 'hard' : 'adaptive',
        estimatedDuration: duration,
        subject: 'Biología',
        topic: 'Mitosis y meiosis',
      }));
      formData.append('userId', 'demo-user');
      selectedFiles.forEach(f => {
        formData.append('documents', { uri: f.uri, type: f.mimeType, name: f.name } as any);
      });
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('POST', `${getBackendBaseUrl()}/sessions/generate`, true);
      xhr.setRequestHeader('Accept', 'text/event-stream');
      xhr.onprogress = () => {
        const incoming = xhr.responseText.substring(lastResponseLengthRef.current);
        lastResponseLengthRef.current = xhr.responseText.length;
        const unprocessed = `${sseBufferRef.current}${incoming}`;
        sseBufferRef.current = parseSseEvents(unprocessed, (event, payload) => {
          if (event === 'progress') pushProgressEvent(payload as SessionProgress);
          if (event === 'transcript_chunk') setTranscriptChunks(prev => [...prev, payload.text]);
          if (event === 'question_generated') setGeneratedQuestions(prev => [...prev, payload.question]);
          if (event === 'complete') setSessionResult(payload);
          if (event === 'error') setGenerationError(payload?.message ?? 'Error inesperado.');
        });
      };
      xhr.onload = () => { if (xhr.status >= 400) setGenerationError('No se pudo generar la sesión. Verifica tu conexión.'); };
      xhr.onerror = () => setGenerationError('Error de red durante la generación. Intenta nuevamente.');
      xhr.send(formData);
    } catch (error) {
      setGenerationError(`Error al procesar el archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }, [duration, pushProgressEvent, selectedFiles, sessionType]);

  useEffect(() => {
    if (step !== 2) { generationStartedRef.current = false; return; }
    if (generationStartedRef.current || selectedFiles.length === 0) return;
    generationStartedRef.current = true;
    startSseGeneration();
    return () => { xhrRef.current?.abort(); };
  }, [selectedFiles, startSseGeneration, step]);

  useEffect(() => {
    if (sessionResult && step === 2) {
      autoNavRef.current = setTimeout(() => setStep(3), 800);
      return () => { if (autoNavRef.current) clearTimeout(autoNavRef.current); };
    }
  }, [sessionResult, step]);

  const completedSession = sessionResult?.session;

  const handleContinue = () => {
    if (step === 0 && selectedFiles.length === 0) { setUploadError('Selecciona al menos un archivo o toma una foto para continuar.'); return; }
    if (step < 3) setStep(step + 1);
  };
  const handleBack = () => { if (step > 0) setStep(step - 1); };
  const handleStartSession = () => {
    if (!completedSession) return;
    router.push({ pathname: '/modals/session' as any, params: { data: JSON.stringify(completedSession) } });
  };

  // ─────────────────────────────────────────────────────────────────
  // PANTALLA 4 — Sesión lista
  // ─────────────────────────────────────────────────────────────────
  if (step === 3) {
    const s = completedSession;
    return (
      <ScreenContainer style={s4.page}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.paper} />
        <View style={s4.header}>
          <Pressable onPress={handleBack} style={s4.backBtn} hitSlop={10}>
            <Text style={s4.backBtnText}>←</Text>
          </Pressable>
          <Text style={s4.headerTitle}>Sesión lista</Text>
          <View style={{ width: 38 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s4.scroll} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={['#1A1033', '#2A1060', '#1C0B56']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s4.hero}>
            <Animated.View style={[s4.checkWrap, checkScaleAnim]}>
              <Animated.View style={[s4.checkCircle, checkPulseAnim]}>
                <Text style={s4.checkText}>✓</Text>
              </Animated.View>
            </Animated.View>
            <Text style={s4.xpHero}>Esta sesión vale 2× XP</Text>
            <Text style={s4.heroSub}>¡Generación completa! Creado desde tus apuntes.</Text>
          </LinearGradient>
          <View style={s4.card}>
            <View style={s4.subjectRow}>
              <View style={s4.subjectIcon}>
                <Text style={{ fontSize: 24 }}>{subjectEmoji(s?.subject ?? '')}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s4.subjectName}>{s?.subject ?? 'Sesión generada'}</Text>
                <Text style={s4.topicText} numberOfLines={1}>{(s?.topic ?? '').toUpperCase()}</Text>
              </View>
              <View style={s4.diffBadge}>
                <Text style={s4.diffText}>{difficultyLabel(s?.difficulty)}</Text>
              </View>
            </View>
            <View style={s4.divider} />
            <View style={s4.statsGrid}>
              <View style={s4.statCell}>
                <Text style={s4.statVal}>{s?.questions?.length ?? 0}</Text>
                <Text style={s4.statLbl}>PREGUNTAS</Text>
              </View>
              <View style={s4.statCell}>
                <Text style={s4.statVal}>{s?.estimatedDuration ?? duration} min</Text>
                <Text style={s4.statLbl}>DURACIÓN</Text>
              </View>
              <View style={s4.statCell}>
                <Text style={s4.statVal}>+{s?.xpReward ?? 0} XP</Text>
                <Text style={s4.statLbl}>RECOMPENSA</Text>
              </View>
              <View style={s4.statCell}>
                <Text style={s4.statVal}>+{s?.gemReward ?? 10}</Text>
                <Text style={s4.statLbl}>GEMAS</Text>
              </View>
            </View>
            <View style={s4.divider} />
            {[
              { icon: '❓', label: 'Preguntas', count: s?.questions?.length ?? 0 },
              { icon: '🃏', label: 'Flashcards', count: s?.flashcards?.length ?? 0 },
              { icon: '📋', label: 'Resumen', count: s?.summary?.sections?.length ?? 1 },
            ].map(({ icon, label, count }) => (
              <View key={label} style={s4.contentRow}>
                <Text style={s4.contentIcon}>{icon}</Text>
                <Text style={s4.contentLabel}>{label}</Text>
                <View style={s4.contentCount}><Text style={s4.contentCountText}>{count}</Text></View>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={[s4.actions, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={handleStartSession} style={{ width: '100%' }}>
            <Animated.View style={[s4.ctaShadow, ctaPulseAnim]}>
              <View style={s4.ctaOverflow}>
                <LinearGradient colors={[BRAND, BRAND2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s4.ctaGrad}>
                  <Zap size={18} color="white" strokeWidth={2.5} />
                  <Text style={s4.ctaText}>Empezar sesión ahora</Text>
                </LinearGradient>
              </View>
            </Animated.View>
          </Pressable>
          <View style={s4.textLinks}>
            <Pressable hitSlop={10}><Text style={s4.textLink}>Agendar después</Text></Pressable>
            <Text style={s4.textLinkDot}>·</Text>
            <Pressable hitSlop={10}><Text style={s4.textLink}>Compartir</Text></Pressable>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // PANTALLA 3 — Creando tu sesión
  // ─────────────────────────────────────────────────────────────────
  if (step === 2) {
    const transcript = transcriptChunks.join(' ');
    return (
      <SafeAreaView style={s3.page} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={s3.header}>
          <Text style={s3.headerTitle}>Creando tu sesión...</Text>
          <PulsingDots />
        </View>
        {generationError ? (
          <View style={s3.errorWrap}>
            <View style={s3.errorBanner}>
              <Text style={s3.errorTitle}>Algo salió mal</Text>
              <Text style={s3.errorMsg}>{generationError}</Text>
              <Pressable onPress={() => { setStep(1); setGenerationError(null); }} style={s3.retryBtn}>
                <Text style={s3.retryText}>Volver e intentar de nuevo</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={s3.body}>
            <View style={s3.half}>
              <Text style={s3.sectionLabel}>TUS APUNTES</Text>
              <ScrollView style={s3.transcriptScroll} contentContainerStyle={s3.transcriptContent} showsVerticalScrollIndicator={false}>
                {transcript ? (
                  <Text style={s3.transcriptText}>
                    {transcript}
                    {!sessionResult && <Text style={s3.cursor}>|</Text>}
                  </Text>
                ) : (
                  <Text style={s3.transcriptPlaceholder}>Leyendo tu material...</Text>
                )}
              </ScrollView>
            </View>
            <View style={s3.divider} />
            <View style={s3.half}>
              <Text style={s3.sectionLabel}>PREGUNTAS GENERADAS</Text>
              <ScrollView style={s3.questionsScroll} showsVerticalScrollIndicator={false}>
                {generatedQuestions.length === 0 && !sessionResult && (
                  <Text style={s3.transcriptPlaceholder}>Las preguntas aparecerán aquí...</Text>
                )}
                {generatedQuestions.map((q, i) => (
                  <FadeInCard key={q.id} delay={i * 60}>
                    <View style={s3.questionCard}>
                      <Text style={s3.questionText} numberOfLines={3}>{q.text}</Text>
                      {q.sourceQuote ? (
                        <View style={s3.sourceChip}>
                          <BookOpen size={10} color={BRAND} strokeWidth={2} />
                          <Text style={s3.sourceText} numberOfLines={1}>{q.sourceQuote}</Text>
                        </View>
                      ) : null}
                    </View>
                  </FadeInCard>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // PANTALLAS 1 y 2
  // ─────────────────────────────────────────────────────────────────
  const hasFiles = selectedFiles.length > 0;
  const previewFile = selectedFiles[0] ?? null;

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <View style={styles.pageHeader}>
        <Pressable onPress={step === 0 ? () => router.back() : handleBack} style={styles.closeBtn} hitSlop={8}>
          <Text style={styles.closeBtnText}>{step === 0 ? '✕' : '←'}</Text>
        </Pressable>
        <SlimProgress step={step} />
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── PANTALLA 1 ── */}
        {step === 0 && (
          <View>
            <View style={styles.titleWrap}>
              <Text style={styles.titleText}>¿Qué vamos a estudiar hoy?</Text>
              <Text style={styles.titleSub}>
                {hasFiles
                  ? `${selectedFiles.length} archivo${selectedFiles.length > 1 ? 's' : ''} seleccionado${selectedFiles.length > 1 ? 's' : ''}`
                  : 'Toma una foto o sube tu archivo.'}
              </Text>
            </View>

            {/* ── Lista de archivos seleccionados ── */}
            {hasFiles && (
              <View style={styles.fileList}>
                {selectedFiles.map((file, idx) => (
                  <View key={file.uri} style={styles.fileRow}>
                    <Image source={{ uri: file.uri }} style={styles.fileThumb} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                      <Text style={styles.fileMeta}>
                        {file.mimeType.includes('pdf') ? 'PDF' : 'Imagen'} · {file.sizeText}
                      </Text>
                    </View>
                    <Pressable onPress={() => removeFile(file.uri)} style={styles.removeBtn} hitSlop={8}>
                      <X size={14} color={Colors.muted} strokeWidth={2.5} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* ── Opciones de carga ── */}
            {/* Siempre visibles; cuando hay archivos se muestran como "Añadir más" */}
            <View style={styles.optionsRow}>
              {/* Foto rápida — primario */}
              <Pressable style={styles.optionCardPrimary} onPress={handleCameraPick}>
                <LinearGradient colors={[BRAND, BRAND2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.optionCardGrad}>
                  <Camera size={26} color="white" strokeWidth={2} />
                  <Text style={styles.optionCardTitlePrimary}>
                    {hasFiles ? 'Añadir foto' : 'Foto rápida'}
                  </Text>
                  <Text style={styles.optionCardSubPrimary}>
                    {hasFiles ? 'Otra foto de tus apuntes' : 'Escanea tu cuaderno'}
                  </Text>
                </LinearGradient>
              </Pressable>

              {/* Subir archivo — secundario, igual de visible */}
              <Pressable style={styles.optionCardSecondary} onPress={handleDocumentPick}>
                <FileText size={26} color={BRAND} strokeWidth={1.8} />
                <Text style={styles.optionCardTitleSecondary}>
                  {hasFiles ? 'Añadir archivo' : 'Subir archivo'}
                </Text>
                <Text style={styles.optionCardSubSecondary}>
                  {hasFiles ? 'PDF o imagen adicional' : 'PDF · Imagen · JPG'}
                </Text>
              </Pressable>
            </View>

            {uploadError ? <Text style={styles.uploadError}>{uploadError}</Text> : null}

            {/* Recientes */}
            <Text style={styles.recentLabel}>RECIENTES</Text>
            {RECENT_FILES.map(file => {
              const alreadyAdded = selectedFiles.some(f => f.uri === file.uri);
              return (
                <View key={file.name} style={styles.recentItem}>
                  <Image source={{ uri: file.uri }} style={styles.recentThumb} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentName} numberOfLines={1}>{file.name}</Text>
                    <Text style={styles.recentMeta}>{file.sizeText} · {file.mimeType.includes('pdf') ? 'PDF' : 'Imagen'}</Text>
                  </View>
                  {alreadyAdded ? (
                    <View style={styles.addedBadge}>
                      <CheckCircle size={14} color={Colors.teal} strokeWidth={2} />
                      <Text style={styles.addedText}>Añadido</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => handleUseRecent(file)} style={styles.useBtn}>
                      <Text style={styles.useBtnText}>Usar</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── PANTALLA 2 ── */}
        {step === 1 && (
          <View>
            <View style={styles.titleWrap}>
              <Text style={styles.titleText}>Revisa tu sesión</Text>
              <Text style={styles.titleSub}>
                {selectedFiles.length > 1
                  ? `${selectedFiles.length} archivos combinados`
                  : 'Así quedó tu material.'}
              </Text>
            </View>

            {/* Preview real + viewfinder */}
            <View style={s2.previewWrap}>
              {previewFile ? (
                <Image source={{ uri: previewFile.uri }} style={s2.previewImg} contentFit="cover" />
              ) : (
                <View style={s2.previewFallback}>
                  <FileText size={40} color={Colors.muted} strokeWidth={1.5} />
                </View>
              )}
              <View style={[s2.corner, s2.cTL]} />
              <View style={[s2.corner, s2.cTR]} />
              <View style={[s2.corner, s2.cBL]} />
              <View style={[s2.corner, s2.cBR]} />
              <Animated.View style={[s2.laser, laserAnim]} />
              <View style={s2.readyBadge}>
                <View style={s2.readyDot} />
                <Text style={s2.readyText}>Listo</Text>
              </View>
              {/* Badge de múltiples archivos */}
              {selectedFiles.length > 1 && (
                <View style={s2.multiFileBadge}>
                  <Text style={s2.multiFileText}>+{selectedFiles.length - 1} más</Text>
                </View>
              )}
            </View>

            {/* Chips horizontales */}
            <View style={s2.chipsRow}>
              <View style={s2.chip}>
                <FileText size={11} color={Colors.ink3} strokeWidth={2} />
                <Text style={s2.chipText}>
                  {selectedFiles.length > 1 ? `${selectedFiles.length} archivos` : '5 págs'}
                </Text>
              </View>
              <Text style={s2.chipSep}>·</Text>
              <View style={s2.chip}>
                <Target size={11} color={Colors.ink3} strokeWidth={2} />
                <Text style={s2.chipText}>Biología</Text>
              </View>
              <Text style={s2.chipSep}>·</Text>
              <View style={s2.chip}>
                <CheckCircle size={11} color={Colors.teal} strokeWidth={2} />
                <Text style={[s2.chipText, { color: Colors.teal }]}>Listo para usar</Text>
              </View>
            </View>

            {/* Conceptos detectados */}
            <View style={s2.conceptsSection}>
              <Text style={s2.sectionLabel}>ESTO ES LO QUE DETECTAMOS</Text>
              <View style={s2.conceptsRow}>
                {['Mitosis', 'Cromosomas', 'División celular', 'Interfase', 'Citocinesis'].map(c => (
                  <View key={c} style={s2.conceptChip}>
                    <Text style={s2.conceptText}>{c}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Tipo de sesión */}
            <View style={s2.sessionSection}>
              <Text style={s2.sectionLabel}>TIPO DE SESIÓN</Text>
              <Pressable
                style={[s2.sessionCard, sessionType === 'practice' && s2.sessionCardActive]}
                onPress={() => setSessionType('practice')}
              >
                <Sparkles size={22} color={sessionType === 'practice' ? BRAND : Colors.muted} strokeWidth={1.5} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[s2.sessionTitle, sessionType === 'practice' && { color: BRAND }]}>Adaptativa</Text>
                  <Text style={s2.sessionDesc}>La IA ajusta la dificultad automáticamente</Text>
                </View>
                {sessionType === 'practice' && (
                  <View style={s2.recommendedBadge}>
                    <Text style={s2.recommendedText}>Recomendada</Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={s2.personalizeBtn} onPress={() => setSessionTypeExpanded(e => !e)}>
                <Text style={s2.personalizeBtnText}>Personalizar</Text>
                <ChevronDown size={13} color={BRAND} strokeWidth={2}
                  style={{ transform: [{ rotate: sessionTypeExpanded ? '180deg' : '0deg' }] }} />
              </Pressable>
              {sessionTypeExpanded && (
                <View style={s2.altOptions}>
                  {[
                    { id: 'review', label: 'Revisión', desc: 'Repaso rápido de conceptos clave', icon: BookOpen },
                    { id: 'exam', label: 'Simulacro', desc: 'Experiencia tipo prueba real', icon: Target },
                  ].map(({ id, label, desc, icon: Icon }) => (
                    <Pressable
                      key={id}
                      style={[s2.altCard, sessionType === id && s2.sessionCardActive]}
                      onPress={() => { setSessionType(id); setSessionTypeExpanded(false); }}
                    >
                      <Icon size={18} color={sessionType === id ? BRAND : Colors.muted} strokeWidth={1.5} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[s2.altTitle, sessionType === id && { color: BRAND }]}>{label}</Text>
                        <Text style={s2.sessionDesc}>{desc}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Duración */}
            <View style={s2.durationCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} color={Colors.ink3} strokeWidth={2} />
                  <Text style={s2.durationLabel}>Duración estimada</Text>
                </View>
                <View style={s2.durationBadge}>
                  <Text style={s2.durationVal}>{duration} min</Text>
                </View>
              </View>
              <View style={s2.sliderTrack}>
                <View style={[s2.sliderFill, { width: `${Math.min(duration / 40, 1) * 100}%` }]} />
                <View style={[s2.sliderThumb, { left: `${Math.min(duration / 40, 1) * 100}%` as any }]} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={s2.durationRange}>5 min</Text>
                <Text style={s2.durationRange}>40 min</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky bottom */}
      <View style={[styles.stickyBottom, { paddingBottom: insets.bottom + 12 }]}>
        {step > 0 && (
          <Pressable hitSlop={12} onPress={handleBack}>
            <Text style={styles.backLink}>Volver</Text>
          </Pressable>
        )}
        {(step === 1 || hasFiles) && (
          <Pressable
            style={[styles.continueBtn, { flex: step === 1 ? 1 : undefined, marginLeft: step === 1 ? 0 : 'auto' as any }]}
            onPress={handleContinue}
          >
            <LinearGradient colors={[BRAND, BRAND2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.continueBtnGrad}>
              <Text style={styles.continueBtnText}>Continuar</Text>
              <ChevronRight size={16} color="white" strokeWidth={2.5} />
            </LinearGradient>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Shared styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  pageHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  closeBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  closeBtnText: { fontSize: 16, color: Colors.ink, fontWeight: '700' },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  titleWrap: { paddingTop: 4, paddingBottom: 20 },
  titleText: { fontSize: SM ? 22 : 26, fontWeight: '800', color: Colors.ink, letterSpacing: -0.4, marginBottom: 5 },
  titleSub: { fontSize: 14, color: Colors.ink3, lineHeight: 20 },

  // File list (selected)
  fileList: { marginBottom: 14, gap: 8 },
  fileRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, padding: 12, gap: 12 },
  fileThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.bgSoft },
  fileName: { fontSize: 13, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  fileMeta: { fontSize: 11, color: Colors.muted },
  removeBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },

  // Two-column option cards
  optionsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  optionCardPrimary: { flex: 1, borderRadius: 20, overflow: 'hidden', shadowColor: BRAND, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 6 },
  optionCardGrad: { paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  optionCardTitlePrimary: { fontSize: 14, fontWeight: '800', color: 'white', textAlign: 'center' },
  optionCardSubPrimary: { fontSize: 11, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 15 },
  optionCardSecondary: { flex: 1, borderRadius: 20, backgroundColor: 'white', borderWidth: 1.5, borderColor: Colors.line2, paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', gap: 8, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  optionCardTitleSecondary: { fontSize: 14, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  optionCardSubSecondary: { fontSize: 11, color: Colors.ink3, textAlign: 'center', lineHeight: 15 },

  uploadError: { color: Colors.rose, fontSize: 12, fontWeight: '700', marginBottom: 12 },

  // Recent files
  recentLabel: { fontSize: 10, fontWeight: '700', color: Colors.muted, letterSpacing: 0.7, marginBottom: 10, marginTop: 4 },
  recentItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, padding: 12, marginBottom: 8, gap: 12 },
  recentThumb: { width: 44, height: 44, borderRadius: 9, backgroundColor: Colors.bgSoft },
  recentName: { fontSize: 13, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  recentMeta: { fontSize: 11, color: Colors.muted },
  useBtn: { backgroundColor: 'rgba(91,61,245,0.08)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  useBtnText: { fontSize: 12, fontWeight: '700', color: BRAND },
  addedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addedText: { fontSize: 12, fontWeight: '600', color: Colors.teal },

  // Sticky bottom
  stickyBottom: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: BG, flexDirection: 'row', alignItems: 'center', gap: 16 },
  backLink: { fontSize: 14, fontWeight: '600', color: Colors.ink3 },
  continueBtn: { borderRadius: 18, overflow: 'hidden', shadowColor: BRAND, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 8 },
  continueBtnGrad: { paddingVertical: 15, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 6 },
  continueBtnText: { fontSize: 15, fontWeight: '800', color: 'white' },
});

// ── Pantalla 2 styles ─────────────────────────────────────────────
const s2 = StyleSheet.create({
  previewWrap: { height: 210, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1A1A2E', marginBottom: 14, position: 'relative' },
  previewImg: { position: 'absolute', inset: 0 } as any,
  previewFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 22, height: 22, borderWidth: 3, borderColor: Colors.lime, borderRadius: 4 },
  cTL: { top: 10, left: 10, borderRightWidth: 0, borderBottomWidth: 0 },
  cTR: { top: 10, right: 10, borderLeftWidth: 0, borderBottomWidth: 0 },
  cBL: { bottom: 10, left: 10, borderRightWidth: 0, borderTopWidth: 0 },
  cBR: { bottom: 10, right: 10, borderLeftWidth: 0, borderTopWidth: 0 },
  laser: { position: 'absolute', left: 10, right: 10, height: 2, backgroundColor: Colors.lime, shadowColor: Colors.lime, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 5 },
  readyBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,194,168,0.85)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 5 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'white' },
  readyText: { color: 'white', fontSize: 11, fontWeight: '700' },
  multiFileBadge: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 20 },
  multiFileText: { color: 'white', fontSize: 11, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText: { fontSize: 12, color: Colors.ink3, fontWeight: '600' },
  chipSep: { fontSize: 14, color: Colors.line2 },
  conceptsSection: { marginBottom: 20 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: Colors.muted, letterSpacing: 0.7, marginBottom: 10 },
  conceptsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  conceptChip: { backgroundColor: Colors.brandSoft, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  conceptText: { fontSize: 12, fontWeight: '700', color: BRAND },
  sessionSection: { marginBottom: 16 },
  sessionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, padding: 16, marginBottom: 8, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  sessionCardActive: { borderColor: BRAND, backgroundColor: 'rgba(91,61,245,0.04)' },
  sessionTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink, marginBottom: 3 },
  sessionDesc: { fontSize: 12, color: Colors.ink3, lineHeight: 17 },
  recommendedBadge: { backgroundColor: 'rgba(91,61,245,0.1)', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 },
  recommendedText: { fontSize: 10, fontWeight: '700', color: BRAND },
  personalizeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4, alignSelf: 'flex-start' },
  personalizeBtnText: { fontSize: 13, fontWeight: '700', color: BRAND },
  altOptions: { gap: 8, marginTop: 4 },
  altCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: Colors.line, padding: 14 },
  altTitle: { fontSize: 13, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  durationCard: { backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, padding: 16, marginBottom: 8 },
  durationLabel: { fontSize: 13, fontWeight: '700', color: Colors.ink2 },
  durationBadge: { backgroundColor: Colors.brandSoft, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 12 },
  durationVal: { fontSize: 14, fontWeight: '800', color: BRAND },
  durationRange: { fontSize: 10, color: Colors.muted, fontWeight: '600' },
  sliderTrack: { height: 8, borderRadius: 999, backgroundColor: Colors.bgSoft, overflow: 'hidden', marginBottom: 8 },
  sliderFill: { height: '100%', borderRadius: 999, backgroundColor: BRAND },
  sliderThumb: { position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: BRAND, backgroundColor: 'white', top: -6 },
});

// ── Pantalla 3 styles ─────────────────────────────────────────────
const s3 = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.line },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.ink },
  body: { flex: 1 },
  half: { flex: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  divider: { height: 1, backgroundColor: Colors.line, marginHorizontal: 20 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: Colors.muted, letterSpacing: 0.7, marginBottom: 10 },
  transcriptScroll: { flex: 1 },
  transcriptContent: { paddingBottom: 8 },
  transcriptText: { fontSize: 13, color: Colors.ink2, lineHeight: 20 },
  transcriptPlaceholder: { fontSize: 13, color: Colors.muted, fontStyle: 'italic', lineHeight: 20 },
  cursor: { color: BRAND, fontWeight: '900' },
  questionsScroll: { flex: 1 },
  questionCard: { backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: Colors.line, padding: 12, marginBottom: 8 },
  questionText: { fontSize: 13, fontWeight: '600', color: Colors.ink, lineHeight: 19, marginBottom: 6 },
  sourceChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sourceText: { fontSize: 10, color: BRAND, flex: 1, fontStyle: 'italic' },
  errorWrap: { flex: 1, padding: 20, justifyContent: 'center' },
  errorBanner: { backgroundColor: 'rgba(255,77,109,0.07)', borderColor: 'rgba(255,77,109,0.2)', borderWidth: 1, borderRadius: 20, padding: 20 },
  errorTitle: { fontSize: 16, fontWeight: '800', color: Colors.rose, marginBottom: 8 },
  errorMsg: { fontSize: 13, color: Colors.ink3, lineHeight: 19, marginBottom: 16 },
  retryBtn: { backgroundColor: Colors.rose, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  retryText: { fontSize: 14, fontWeight: '700', color: 'white' },
});

// ── Pantalla 4 styles ─────────────────────────────────────────────
const s4 = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.line },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 18, color: Colors.ink, fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.ink },
  scroll: { padding: 16, paddingBottom: 8 },
  hero: { borderRadius: 24, paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center', marginBottom: 16 },
  checkWrap: { marginBottom: 20 },
  checkCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.lime, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.lime, shadowOffset: { width: 0, height: 0 }, shadowRadius: 20, elevation: 8 },
  checkText: { fontSize: 36, color: Colors.ink, fontWeight: '900' },
  xpHero: { fontSize: 24, fontWeight: '900', color: Colors.lime, textAlign: 'center', letterSpacing: -0.5, marginBottom: 10 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  card: { backgroundColor: Colors.paper, borderRadius: 20, borderWidth: 1, borderColor: Colors.line, padding: 18, shadowColor: Colors.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3, marginBottom: 8 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  subjectIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#DBFCE7', alignItems: 'center', justifyContent: 'center' },
  subjectName: { fontSize: 16, fontWeight: '800', color: Colors.ink, marginBottom: 2 },
  topicText: { fontSize: 11, color: Colors.muted, fontWeight: '600', letterSpacing: 0.3 },
  diffBadge: { backgroundColor: Colors.bgSoft, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.line },
  diffText: { fontSize: 11, fontWeight: '700', color: Colors.ink2 },
  divider: { height: 1, backgroundColor: Colors.line, marginVertical: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '50%', alignItems: 'center', paddingVertical: 12 },
  statVal: { fontSize: 17, fontWeight: '900', color: Colors.ink, marginBottom: 3 },
  statLbl: { fontSize: 9, fontWeight: '700', color: Colors.muted, letterSpacing: 0.6 },
  contentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  contentIcon: { fontSize: 18, width: 24 },
  contentLabel: { flex: 1, fontSize: 14, color: Colors.ink2, fontWeight: '500' },
  contentCount: { backgroundColor: Colors.bgSoft, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 10 },
  contentCountText: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  actions: { padding: 16, gap: 0, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: Colors.paper },
  ctaShadow: { borderRadius: 18, shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowRadius: 16, elevation: 10 },
  ctaOverflow: { borderRadius: 18, overflow: 'hidden' },
  ctaGrad: { paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: 'white', fontWeight: '800', fontSize: 17, letterSpacing: -0.2 },
  textLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14 },
  textLink: { fontSize: 13, color: Colors.muted, fontWeight: '600' },
  textLinkDot: { fontSize: 16, color: Colors.line2 },
});
