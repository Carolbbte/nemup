import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type ScreenContainerProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
};

export default function ScreenContainer({
  children,
  style,
  edges = ['top', 'bottom'],
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView
      style={[
        {
          flex: 1,
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
          paddingLeft: edges.includes('left') ? insets.left : 0,
          paddingRight: edges.includes('right') ? insets.right : 0,
          backgroundColor: 'transparent',
        },
        style,
      ]}
    >
      {children}
    </SafeAreaView>
  );
}
