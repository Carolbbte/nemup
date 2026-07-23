import type { MissionRecord, MissionStatus } from '@/contexts/MissionsContext';
import { useMissions } from '@/contexts/MissionsContext';
import { palette, paletteExtras } from '@/theme/colors';
import { useRouter } from 'expo-router';
import { CheckCircle2, ChevronRight, Play, Plus, RotateCcw, Target, Trash2 } from 'lucide-react-native';
import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Lightweight subject → emoji map (mirrors session.tsx's SUBJECT_EMOJI).
const SUBJECT_EMOJI: [string, string][] = [
  ['biolog', '🧬'], ['matemát', '📐'], ['matemat', '📐'],
  ['histor', '🌎'], ['físic', '⚡'],   ['fisic', '⚡'],
  ['químic', '🧪'], ['quimic', '🧪'], ['lenguaj', '📝'],
  ['inglés', '🗣️'], ['ingles', '🗣️'], ['economí', '📈'],
  ['economi', '📈'], ['psicolog', '🧠'], ['geograf', '🗺️'],
  ['filosofí', '🤔'], ['filosof', '🤔'],
];
function subjectEmoji(subject: string): string {
  const s = (subject ?? '').toLowerCase();
  for (const [key, emoji] of SUBJECT_EMOJI) if (s.includes(key)) return emoji;
  return '📚';
}

function doneCount(m: MissionRecord): number {
  const p = m.progress;
  return (p.missionCompleted ? 1 : 0) + (p.quizCompleted ? 1 : 0) + (p.flashcardsCompleted ? 1 : 0);
}

// Compact relative-time label in Spanish: "Ahora", "Hace 5 min",
// "Hace 2 h", "Ayer", "Hace 3 días", or an absolute date for older items.
function formatRelative(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 0) return 'Ahora';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'Hace 1 semana' : `Hace ${weeks} semanas`;
  }
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const d = new Date(ts);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export default function MisionesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { missions, activateMission, removeMission } = useMissions();

  const open = useCallback(async (m: MissionRecord) => {
    const replay = m.status === 'completed';
    const ok = await activateMission(m.id, { replay });
    if (ok) router.push('/modals/session' as any);
  }, [activateMission, router]);

  const confirmDelete = useCallback((m: MissionRecord) => {
    Alert.alert(
      '¿Eliminar esta misión?',
      `"${m.title || m.topic}" se eliminará permanentemente. No podrás recuperarla.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => removeMission(m.id) },
      ],
    );
  }, [removeMission]);

  const inProgress = missions.filter(m => m.status === 'in_progress');
  const ready      = missions.filter(m => m.status === 'ready');
  const completed  = missions.filter(m => m.status === 'completed');

  const isEmpty = missions.length === 0;

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.crema} />
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>Tus misiones</Text>
        <Text style={s.subtitle}>Retoma donde lo dejaste o repasa lo que ya completaste.</Text>

        <Pressable style={s.newBtn} onPress={() => router.push('/modals/upload' as any)}>
          <View style={s.newIconWrap}>
            <Plus size={18} color={palette.blanco} strokeWidth={2.6} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.newTitle}>Nueva misión</Text>
            <Text style={s.newDesc}>Sube apuntes y genera una sesión</Text>
          </View>
          <ChevronRight size={18} color={palette.azul} strokeWidth={2.2} />
        </Pressable>

        {isEmpty && (
          <View style={s.emptyCard}>
            <Target size={30} color={palette.azul} strokeWidth={1.8} />
            <Text style={s.emptyTitle}>Aún no tienes misiones</Text>
            <Text style={s.emptyDesc}>Genera tu primera misión subiendo apuntes. Quedará guardada aquí para que la retomes cuando quieras.</Text>
          </View>
        )}

        <Section
          label="En curso"
          hint="Continúa donde lo dejaste"
          items={inProgress}
          onOpen={open}
          onDelete={confirmDelete}
        />
        <Section
          label="Por empezar"
          items={ready}
          onOpen={open}
          onDelete={confirmDelete}
        />
        <Section
          label="Completadas"
          hint="Vuelve a jugarlas para repasar"
          items={completed}
          onOpen={open}
          onDelete={confirmDelete}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, hint, items, onOpen, onDelete }: {
  label: string;
  hint?: string;
  items: MissionRecord[];
  onOpen: (m: MissionRecord) => void;
  onDelete: (m: MissionRecord) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{label}</Text>
        <Text style={s.sectionCount}>{items.length}</Text>
      </View>
      {hint && <Text style={s.sectionHint}>{hint}</Text>}
      {items.map(m => (
        <MissionCard key={m.id} mission={m} onOpen={onOpen} onDelete={onDelete} />
      ))}
    </View>
  );
}

const ACTION: Record<MissionStatus, { label: string; Icon: typeof Play }> = {
  ready:       { label: 'Empezar',   Icon: Play },
  in_progress: { label: 'Continuar', Icon: Play },
  completed:   { label: 'Repasar',   Icon: RotateCcw },
};

function MissionCard({ mission, onOpen, onDelete }: {
  mission: MissionRecord;
  onOpen: (m: MissionRecord) => void;
  onDelete: (m: MissionRecord) => void;
}) {
  const done = doneCount(mission);
  const { label, Icon } = ACTION[mission.status];
  const isDone = mission.status === 'completed';

  return (
    // Delete button is a SIBLING Pressable nested inside the card's own
    // Pressable, not a separate outer wrapper — RN's touch responder gives
    // the tap to the innermost Pressable that claims it, so tapping the
    // trash icon never also fires onOpen.
    <Pressable style={s.card} onPress={() => onOpen(mission)}>
      <View style={[s.emojiWrap, isDone && s.emojiWrapDone]}>
        <Text style={s.emoji}>{subjectEmoji(mission.subject)}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{mission.title || mission.topic}</Text>
        <Text style={s.cardSubject} numberOfLines={1}>
          {mission.subject}
          <Text style={s.cardTime}>{`  ·  ${formatRelative(mission.updatedAt)}`}</Text>
        </Text>

        {isDone ? (
          <View style={s.metaRow}>
            <CheckCircle2 size={13} color={palette.verdeXP} strokeWidth={2.4} />
            <Text style={[s.metaText, { color: palette.verdeXP }]}>Completada</Text>
          </View>
        ) : (
          <View style={s.progressRow}>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${(done / 3) * 100}%` }]} />
            </View>
            <Text style={s.progressText}>{done}/3</Text>
          </View>
        )}
      </View>

      <Pressable onPress={() => onDelete(mission)} style={s.deleteBtn} hitSlop={10}>
        <Trash2 size={16} color={palette.grisClaro} strokeWidth={2.2} />
      </Pressable>

      <View style={[s.actionPill, isDone && s.actionPillDone]}>
        <Icon size={15} color={isDone ? palette.azul : palette.blanco} strokeWidth={2.4} />
        <Text style={[s.actionLabel, isDone && s.actionLabelDone]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page:     { flex: 1, backgroundColor: palette.crema },
  content:  { paddingHorizontal: 20, paddingTop: 14 },
  title:    { fontFamily: 'Nunito', fontSize: 20, fontWeight: '800', color: palette.charcoal },
  subtitle: { fontFamily: 'Nunito', fontSize: 13, color: palette.grisMedio, marginTop: 4, marginBottom: 16 },

  newBtn:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.blanco, borderRadius: 18, borderWidth: 1, borderColor: palette.bordeClaro, padding: 14, marginBottom: 22 },
  newIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.azul, justifyContent: 'center', alignItems: 'center' },
  newTitle:    { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800', color: palette.charcoal },
  newDesc:     { fontFamily: 'Nunito', fontSize: 12, color: palette.grisMedio, marginTop: 1 },

  emptyCard:  { alignItems: 'center', backgroundColor: palette.blanco, borderRadius: 20, borderWidth: 1, borderColor: palette.bordeClaro, paddingVertical: 30, paddingHorizontal: 22, gap: 8 },
  emptyTitle: { fontFamily: 'Nunito', fontSize: 16, fontWeight: '800', color: palette.charcoal, marginTop: 6 },
  emptyDesc:  { fontFamily: 'Nunito', fontSize: 13, color: palette.grisMedio, textAlign: 'center', lineHeight: 19 },

  section:      { marginBottom: 22 },
  sectionHead:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontFamily: 'Nunito', fontSize: 12, fontWeight: '800', color: palette.grisMedio, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionCount: { fontFamily: 'Nunito', fontSize: 11, fontWeight: '800', color: palette.azul, backgroundColor: palette.azulClaro, minWidth: 20, textAlign: 'center', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  sectionHint:  { fontFamily: 'Nunito', fontSize: 12, color: palette.grisMedio, marginTop: 3, marginBottom: 4 },

  card:          { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.blanco, borderRadius: 18, borderWidth: 1, borderColor: palette.bordeClaro, padding: 14, marginTop: 10 },
  emojiWrap:     { width: 46, height: 46, borderRadius: 13, backgroundColor: palette.azulClaro, justifyContent: 'center', alignItems: 'center' },
  emojiWrapDone: { backgroundColor: paletteExtras.grisFondoDone },
  emoji:         { fontSize: 22 },

  cardTitle:   { fontFamily: 'Nunito', fontSize: 15, fontWeight: '800', color: palette.charcoal },
  cardSubject: { fontFamily: 'Nunito', fontSize: 12, color: palette.grisMedio, marginTop: 1, marginBottom: 7 },
  cardTime:    { fontFamily: 'Nunito', fontSize: 12, color: palette.grisClaro, fontWeight: '600' },

  progressRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: paletteExtras.trackClaro, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 3, backgroundColor: palette.azul },
  progressText:  { fontFamily: 'Nunito', fontSize: 11, fontWeight: '700', color: palette.grisMedio, minWidth: 24, textAlign: 'right' },

  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontFamily: 'Nunito', fontSize: 12, fontWeight: '700' },

  actionPill:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.azul, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  actionPillDone:  { backgroundColor: palette.azulClaro },

  // Subtle by design — a delete affordance shouldn't compete visually with
  // the primary "open this mission" action.
  deleteBtn: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  actionLabel:     { fontFamily: 'Nunito', fontSize: 13, fontWeight: '800', color: palette.blanco },
  actionLabelDone: { color: palette.azul },
});
