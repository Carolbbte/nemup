import { palette, semantic } from '@/theme/colors';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const PRIMARY  = palette.morado;
const DISABLED = palette.grisClaro;

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'ghost';
};

export default function PrimaryButton({ label, onPress, disabled = false, variant = 'solid' }: Props) {
  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [s.ghost, pressed && { opacity: 0.7 }]}
      >
        <Text style={s.ghostText}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.wrap, disabled && s.wrapDisabled, pressed && !disabled && { opacity: 0.88 }]}
    >
      <View style={[s.inner, disabled && s.innerDisabled]}>
        <Text style={s.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap:          { width: '90%', alignSelf: 'center', borderRadius: 28, overflow: 'hidden' },
  wrapDisabled:  { opacity: 0.55 },
  inner:         { height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: PRIMARY, borderRadius: 28 },
  innerDisabled: { backgroundColor: DISABLED },
  label:         { fontSize: 16, fontWeight: '600', color: palette.blanco, letterSpacing: 0.2 },
  ghost:         { alignItems: 'center', paddingVertical: 10 },
  ghostText:     { fontSize: 14, color: semantic.textSecondary },
});
