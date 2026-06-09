import React from 'react';
import { Dimensions, Text, StyleSheet } from 'react-native';
import { palette, semantic } from '@/theme/colors';
import ScreenContainer from '@/components/ScreenContainer';

const { height: SCREEN_H } = Dimensions.get('window');
const SM = SCREEN_H < 740;

export default function PerfilScreen() {
  return (
    <ScreenContainer style={styles.container}>
      <Text style={styles.placeholder}>👤 Perfil</Text>
      <Text style={styles.text}>Configuración de usuario (próximamente)</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: semantic.background,
  },
  placeholder: {
    fontSize: SM ? 36 : 48,
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: semantic.textSecondary,
  },
});
