import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Colors } from '@/constants/Colors';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FIRST_SESSION_KEY = 'nemup_first_session_completed';
const BRAND = '#5B3DF5';

const TAB_ICONS: Record<string, string> = {
  home: '🏠',
  ramos: '📚',
  tutor: '🤖',
  liga: '🏆',
  perfil: '👤',
};

const TAB_LABELS: Record<string, string> = {
  home: 'Inicio',
  ramos: 'Ramos',
  tutor: 'Tutor',
  liga: 'Liga',
  perfil: 'Perfil',
};

const VISIBLE = new Set(['home', 'ramos', 'tutor', 'liga', 'perfil']);

// ── Floating tab bar ─────────────────────────────────────────────
function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index];

  // Disappear entirely for modal screens
  if (!VISIBLE.has(current.name)) return null;

  return (
    <View style={[tabStyles.wrapper, { paddingBottom: insets.bottom + 8 }]}>
      <View style={tabStyles.bar}>
        {state.routes.map((route, index) => {
          if (!VISIBLE.has(route.name)) return null;

          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              style={tabStyles.item}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={TAB_LABELS[route.name]}
            >
              <View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive]}>
                <Text style={tabStyles.icon}>{TAB_ICONS[route.name]}</Text>
              </View>
              <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>
                {TAB_LABELS[route.name]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  // Outer wrapper — matches app background so the "floating" bar
  // appears to float above the screen content.
  wrapper: {
    backgroundColor: '#F7F8FC',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowColor: '#0B0B1A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  iconWrap: {
    width: 48,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(91,61,245,0.1)',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  icon: { fontSize: 20 },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.muted,
    letterSpacing: 0.2,
  },
  labelActive: {
    color: BRAND,
    fontWeight: '700',
  },
});

// ── Main tab navigator ───────────────────────────────────────────
export default function MainTabs() {
  const router = useRouter();
  const checked = useRef(false);

  // Redirect to first-session if not yet completed
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    AsyncStorage.getItem(FIRST_SESSION_KEY).then(done => {
      if (done !== 'true') {
        router.replace('/modals/first-session' as any);
      }
    });
  }, []);

  return (
    <Tabs
      tabBar={props => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="ramos" />
      <Tabs.Screen name="tutor" />
      <Tabs.Screen name="liga" />
      <Tabs.Screen name="perfil" />
      <Tabs.Screen name="modals/upload" options={{ href: null }} />
      <Tabs.Screen name="modals/session" options={{ href: null }} />
      <Tabs.Screen name="modals/first-session" options={{ href: null }} />
    </Tabs>
  );
}
