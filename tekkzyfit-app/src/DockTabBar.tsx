import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font } from './fonts';
import { Icon, TAB_ICONS } from './icons';
import { useTheme } from './theme';

export function DockTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const inset = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingTop: 6,
        paddingBottom: 8 + inset.bottom,
        backgroundColor: t.bg,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          height: 68,
          padding: 4,
          borderRadius: 999,
          overflow: 'hidden',
          backgroundColor: t.name === 'light' ? '#111111' : t.tab,
          borderWidth: 1,
          borderColor: t.name === 'light' ? 'transparent' : t.glow,
          elevation: 16,
          shadowColor: t.name === 'dark' ? t.accent : '#000',
          shadowOpacity: t.name === 'dark' ? 0.22 : 0.4,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = String(options.tabBarLabel ?? options.title ?? route.name);
          const onBlack = t.name === 'light';
          const color = focused ? '#ffffff' : onBlack ? 'rgba(255,255,255,0.88)' : t.muted;
          return (
            <Pressable
              key={route.key}
              android_ripple={{ color: 'transparent' }}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3 }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? t.accent : 'transparent',
                }}
              >
                <Icon name={TAB_ICONS[route.name] || 'users'} color={focused ? t.accentInk : color} size={20} />
              </View>
              <Text
                numberOfLines={1}
                style={{
                  width: '100%',
                  height: 12,
                  fontFamily: font.sansSemi,
                  fontSize: 8,
                  lineHeight: 12,
                  textAlign: 'center',
                  color: focused ? (onBlack ? '#ffffff' : t.text) : color,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
