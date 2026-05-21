import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import ScreenContainer from '@/components/ScreenContainer';

export default function RamosScreen() {
  return (
    <ScreenContainer style={styles.container}>
      <Text style={styles.placeholder}>📚 Ramos</Text>
      <Text style={styles.text}>Gestor de asignaturas (próximamente)</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.paper,
  },
  placeholder: {
    fontSize: 48,
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: Colors.ink3,
  },
});
