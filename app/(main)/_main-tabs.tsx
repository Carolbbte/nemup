import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { palette } from '@/theme/colors';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Target, User } from 'lucide-react-native';

const FIRST_SESSION_KEY = 'nemup_first_session_completed';
const BRAND = palette.azul;

type TabName = 'home' | 'misiones' | 'perfil';

const TAB_ICONS: Record<TabName, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  home:     Home,
  misiones: Target,
  perfil:   User,
};

const TAB_LABELS: Record<string, string> = {
  home:     'Inicio',
  misiones: 'Misiones',
  perfil:   'Perfil',
};

const VISIBLE  = new Set(['home', 'misiones', 'perfil']);
const HIDE_BAR = new Set(['modals/first-session', 'modals/upload', 'modals/session', 'modals/desafio', 'session-complete']);

// ── Floating tab bar ─────────────────────────────────────────────
function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets  = useSafeAreaInsets();
  const current = state.routes[state.index];

  if (HIDE_BAR.has(current.name)) return null;

  return (
    <View style={[tabStyles.wrapper, { paddingBottom: insets.bottom + 8 }]}>
      <View style={tabStyles.bar}>
        {state.routes.map((route, index) => {
          if (!VISIBLE.has(route.name)) return null;

          const focused = state.index === index;
          const Icon    = TAB_ICONS[route.name as TabName];

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
                {Icon && (
                  <Icon
                    size={22}
                    color={BRAND}
                    strokeWidth={focused ? 2.2 : 1.8}
                  />
                )}
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
  wrapper: {
    backgroundColor: palette.crema,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: palette.blanco,
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: palette.bordeClaro,
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
    backgroundColor: palette.azulClaro,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND,
    letterSpacing: 0.2,
  },
  labelActive: {
    fontWeight: '700',
  },
});

// ── Main tab navigator ───────────────────────────────────────────
export default function MainTabs() {
  const router  = useRouter();
  const checked = useRef(false);

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
      <Tabs.Screen name="misiones" />
      <Tabs.Screen name="perfil" />
      <Tabs.Screen name="modals/upload"        options={{ href: null }} />
      <Tabs.Screen name="modals/session"       options={{ href: null }} />
      <Tabs.Screen name="modals/first-session" options={{ href: null }} />
      <Tabs.Screen name="modals/desafio"       options={{ href: null }} />
      <Tabs.Screen name="session-complete"     options={{ href: null }} />
    </Tabs>
  );
}
