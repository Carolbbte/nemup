/**
 * Experience Layer NEMUP — Beat de celebración
 * =================================================================
 * Componente TONTO a propósito: recibe el texto ya resuelto (ver
 * `celebracionCopy.ts`) y lo muestra — no conoce `avanzo` ni ninguna
 * lógica pedagógica. Siempre decide el estudiante, nunca la app:
 * Continuar o dejarlo, sin fricción ni regaño en ninguna de las dos.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, semantic } from '@/theme/colors';

interface CelebrationBeatProps {
  title: string;
  subtitle: string;
  onContinuar: () => void;
  onDejar: () => void;
}

export function CelebrationBeat({ title, subtitle, onContinuar, onDejar }: CelebrationBeatProps) {
  return (
    <View style={s.content}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle}>{subtitle}</Text>

      <View style={s.actions}>
        <Pressable style={s.continuarBtn} onPress={onContinuar}>
          <Text style={s.continuarText}>Continuar</Text>
        </Pressable>
        <Pressable style={s.dejarBtn} onPress={onDejar}>
          <Text style={s.dejarText}>Lo dejo para después</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  content:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  title:         { fontSize: 28, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', marginBottom: 10 },
  subtitle:      { fontSize: 15, color: semantic.textSecondary, textAlign: 'center', marginBottom: 36 },
  actions:       { width: '100%', gap: 12 },
  continuarBtn:  { height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.verdeXP },
  continuarText: { fontSize: 16, fontWeight: '800', color: palette.blanco },
  dejarBtn:      { height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  dejarText:     { fontSize: 15, fontWeight: '700', color: semantic.textSecondary },
});
