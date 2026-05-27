import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const { state } = useOnboarding();
  const insets = useSafeAreaInsets();

  const handleUploadDocument = () => {
    router.push('/modals/upload');
  };

  const handleSessionPress = (sessionTitle: string) => {
    // TODO: Start study session
    console.log('Starting session:', sessionTitle);
  };

  return (
    <SafeAreaView style={styles.container} edges={[ 'top', 'bottom' ]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.paper} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with greeting */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola, {state.data.name}</Text>
            <Text style={styles.streak}>Lleva {14} días seguidos 🔥</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>V</Text>
          </View>
        </View>

        {/* NEM Card */}
        <LinearGradient
          colors={['#5B3DF5', '#4C28D9', '#6E28D9', '#9F4CFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.nemCard}
        >
          <Text style={styles.nemLabel}>Tu NEM proyectado</Text>
          <View style={styles.nemContent}>
            <Text style={styles.nemValue}>6.2</Text>
            <Text style={styles.nemSubtitle}>Calculado con tus notas + desempeño en la app</Text>
          </View>
          <View style={styles.nemBadges}>
            <View style={styles.nemBadge}>
              <Text style={styles.nemBadgeText}>⬆ +0.7 este año</Text>
            </View>
            <View style={[styles.nemBadge, styles.nemBadgeGoal]}>
              <Text style={styles.nemBadgeTextGoal}>Meta: {state.data.goal}.0</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Main CTA - Upload Document */}
        <Pressable
          style={({ pressed }) => [styles.uploadCta, pressed && styles.uploadCtaPressed]}
          onPress={handleUploadDocument}
        >
          <View style={styles.uploadCtaContent}>
            <Text style={styles.uploadCtaIcon}>📄</Text>
            <View style={styles.uploadCtaText}>
              <Text style={styles.uploadCtaTitle}>Subir foto o PDF</Text>
              <Text style={styles.uploadCtaSubtitle}>Genera sesiones de estudio con IA</Text>
            </View>
          </View>
          <Text style={styles.uploadCtaArrow}>→</Text>
        </Pressable>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>⚡</Text>
            <Text style={styles.statValue}>2.480</Text>
            <Text style={styles.statLabel}>XP TOTAL</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>💎</Text>
            <Text style={styles.statValue}>340</Text>
            <Text style={styles.statLabel}>GEMAS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>🏆</Text>
            <Text style={styles.statValue}>#3</Text>
            <Text style={styles.statLabel}>EN TU LIGA</Text>
          </View>
        </View>

        {/* Suggested Sessions */}
        <View style={styles.sessionsSection}>
          <View style={styles.sessionsHeader}>
            <Text style={styles.sessionsTitle}>Sesiones sugeridas</Text>
            <Pressable>
              <Text style={styles.sessionsLink}>Ver todas →</Text>
            </Pressable>
          </View>

          {/* Math Session */}
          <Pressable
            style={({ pressed }) => [styles.sessionCard, styles.sessionCardMath, pressed && styles.sessionCardPressed]}
            onPress={() => handleSessionPress('Matemáticas - Funciones cuadráticas')}
          >
            <View style={styles.sessionIcon}>
              <Text style={styles.sessionIconText}>📐</Text>
            </View>
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionTitle}>Matemáticas</Text>
              <Text style={styles.sessionSubtitle}>Funciones cuadráticas • 10 min</Text>
            </View>
            <View style={styles.sessionXp}>
              <Text style={styles.sessionXpText}>+80 XP</Text>
            </View>
          </Pressable>

          {/* Biology Session */}
          <Pressable
            style={({ pressed }) => [styles.sessionCard, styles.sessionCardBio, pressed && styles.sessionCardPressed]}
            onPress={() => handleSessionPress('Biología - Mitosis y meiosis')}
          >
            <View style={styles.sessionIcon}>
              <Text style={styles.sessionIconText}>🧬</Text>
            </View>
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionTitle}>Biología</Text>
              <Text style={styles.sessionSubtitle}>Mitosis y meiosis • 8 min</Text>
            </View>
            <View style={styles.sessionXp}>
              <Text style={styles.sessionXpText}>+60 XP</Text>
            </View>
          </Pressable>

          {/* History Session */}
          <Pressable
            style={({ pressed }) => [styles.sessionCard, styles.sessionCardHistory, pressed && styles.sessionCardPressed]}
            onPress={() => handleSessionPress('Historia - Chile siglo XX')}
          >
            <View style={styles.sessionIcon}>
              <Text style={styles.sessionIconText}>📜</Text>
            </View>
            <View style={styles.sessionInfo}>
              <Text style={styles.sessionTitle}>Historia</Text>
              <Text style={styles.sessionSubtitle}>Chile siglo XX • 12 min</Text>
            </View>
            <View style={styles.sessionXp}>
              <Text style={styles.sessionXpText}>+90 XP</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 100, // Space for bottom navigation
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink,
    marginBottom: 2,
  },
  streak: {
    fontSize: 14,
    color: Colors.ink3,
    fontWeight: '500',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  nemCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  nemLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  nemContent: {
    marginBottom: 16,
  },
  nemValue: {
    fontSize: 56,
    fontWeight: '900',
    color: 'white',
    lineHeight: 60,
    marginBottom: 8,
  },
  nemSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 18,
  },
  nemBadges: {
    flexDirection: 'row',
    gap: 10,
  },
  nemBadge: {
    backgroundColor: 'rgba(196, 248, 82, 0.25)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(196, 248, 82, 0.4)',
  },
  nemBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.lime,
  },
  nemBadgeGoal: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  nemBadgeTextGoal: {
    fontSize: 12,
    fontWeight: '700',
    color: 'white',
  },
  uploadCta: {
    backgroundColor: Colors.brand,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  uploadCtaPressed: {
    opacity: 0.9,
  },
  uploadCtaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  uploadCtaIcon: {
    fontSize: 28,
  },
  uploadCtaText: {
    flex: 1,
  },
  uploadCtaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
    marginBottom: 2,
  },
  uploadCtaSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  uploadCtaArrow: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.bgSoft,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.ink,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.muted,
  },
  sessionsSection: {
    gap: 10,
  },
  sessionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  sessionsLink: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: 10,
  },
  sessionCardPressed: {
    opacity: 0.8,
    backgroundColor: Colors.bgSoft,
  },
  sessionCardMath: {
    backgroundColor: 'rgba(91, 61, 245, 0.08)',
    borderColor: 'rgba(91, 61, 245, 0.15)',
  },
  sessionCardBio: {
    backgroundColor: 'rgba(0, 194, 168, 0.08)',
    borderColor: 'rgba(0, 194, 168, 0.15)',
  },
  sessionCardHistory: {
    backgroundColor: 'rgba(255, 122, 43, 0.08)',
    borderColor: 'rgba(255, 122, 43, 0.15)',
  },
  sessionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.paper,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  sessionIconText: {
    fontSize: 22,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 2,
  },
  sessionSubtitle: {
    fontSize: 12,
    color: Colors.ink3,
  },
  sessionXp: {
    backgroundColor: Colors.ink,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexShrink: 0,
  },
  sessionXpText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'white',
  },
});
