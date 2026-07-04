import ModeRow from '@/components/dashboard/ModeRow';
import SessionHeroCard from '@/components/dashboard/SessionHeroCard';
import { useDailySession } from '@/contexts/DailySessionContext';
import { palette } from '@/theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Swords } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type LastSession = {
  subject: string;
  topic: string;
  xpReward: number;
  estimatedDuration: number;
};

const CANON_ORDER = ['mision', 'quiz', 'tarjetas'] as const;

export default function MisionesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dailySession } = useDailySession();
  const [lastSession, setLastSession] = useState<LastSession | null>(null);
  const [hasDesafio, setHasDesafio] = useState(false);

  useFocusEffect(useCallback(() => {
    AsyncStorage.multiGet(['nemup_last_session', 'nemup_desafio_session']).then(([[, rawSession], [, rawDesafio]]) => {
      if (rawSession) {
        try {
          const p = JSON.parse(rawSession);
          setLastSession({ subject: p.subject, topic: p.topic, xpReward: p.xpReward, estimatedDuration: p.estimatedDuration });
        } catch {}
      }
      setHasDesafio(!!rawDesafio);
    });
  }, []));

  const { completedModes } = dailySession;
  const nextPending = CANON_ORDER.find(m => !completedModes[m]);

  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.crema} />
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>Tus misiones</Text>

        <SessionHeroCard
          hasSession={lastSession !== null}
          session={lastSession}
          onNavigate={() => router.push('/modals/session' as any)}
          onUpload={() => router.push('/modals/upload' as any)}
        />

        {lastSession !== null && (
          <View style={s.modesCard}>
            <Text style={s.modesTitle}>Progreso de hoy</Text>

            <Pressable onPress={() => router.push('/modals/session' as any)}>
              <ModeRow mode="mision" status={completedModes.mision ? 'done' : nextPending === 'mision' ? 'next' : 'pending'} />
            </Pressable>
            <Pressable onPress={() => router.push('/modals/session' as any)}>
              <ModeRow mode="quiz" status={completedModes.quiz ? 'done' : nextPending === 'quiz' ? 'next' : 'pending'} />
            </Pressable>
            <Pressable onPress={() => router.push('/modals/session' as any)}>
              <ModeRow mode="tarjetas" status={completedModes.tarjetas ? 'done' : nextPending === 'tarjetas' ? 'next' : 'pending'} />
            </Pressable>

            {hasDesafio && (
              <Pressable style={s.desafioRow} onPress={() => router.push('/modals/desafio' as any)}>
                <View style={s.desafioIconWrap}>
                  <Swords size={18} color={palette.azul} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.desafioLabel}>Desafío</Text>
                  <Text style={s.desafioDesc}>Bonus disponible — pon a prueba lo aprendido</Text>
                </View>
                <ChevronRight size={18} color={palette.azul} strokeWidth={2.2} />
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page:    { flex: 1, backgroundColor: palette.crema },
  content: { paddingHorizontal: 20, paddingTop: 14 },
  title:   { fontFamily: 'Nunito', fontSize: 20, fontWeight: '800', color: palette.charcoal, marginBottom: 14 },

  modesCard:  { backgroundColor: palette.blanco, borderRadius: 20, borderWidth: 1, borderColor: palette.bordeClaro, padding: 16, marginTop: 4 },
  modesTitle: { fontFamily: 'Nunito', fontSize: 11, fontWeight: '800', color: palette.grisMedio, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },

  desafioRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: palette.bordeClaro },
  desafioIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.azulClaro, justifyContent: 'center', alignItems: 'center' },
  desafioLabel:    { fontFamily: 'Nunito', fontSize: 14, fontWeight: '600', color: palette.charcoal, marginBottom: 1 },
  desafioDesc:     { fontFamily: 'Nunito', fontSize: 11, color: palette.grisMedio },
});
