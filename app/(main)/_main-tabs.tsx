import { Colors } from '@/constants/Colors';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.brand,
        tabBarInactiveTintColor: Colors.muted,
        tabBarStyle: {
          backgroundColor: Colors.paper,
          borderTopWidth: 1,
          borderTopColor: Colors.line,
          height: 70 + insets.bottom,
          paddingBottom: insets.bottom + 12,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: 20 }}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="ramos"
        options={{
          title: 'Ramos',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: 20 }}>📚</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="tutor"
        options={{
          title: 'Tutor',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: 20 }}>🤖</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="liga"
        options={{
          title: 'Liga',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: 20 }}>🏆</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: 20 }}>👤</Text>
          ),
        }}
      />
    </Tabs>
  );
}
