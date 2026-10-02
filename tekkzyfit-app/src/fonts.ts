import { useFonts } from 'expo-font';
import { Oswald_600SemiBold } from '@expo-google-fonts/oswald';
import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { Syne_700Bold, Syne_800ExtraBold } from '@expo-google-fonts/syne';

export const font = {
  display: 'Syne_700Bold',
  displayX: 'Syne_800ExtraBold',
  sans: 'PlusJakartaSans_400Regular',
  sansMed: 'PlusJakartaSans_500Medium',
  sansSemi: 'PlusJakartaSans_600SemiBold',
  sansBold: 'PlusJakartaSans_700Bold',
  brand: 'Oswald_600SemiBold',
};

export function useAppFonts() {
  const [loaded, error] = useFonts({
    Syne_700Bold,
    Syne_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Oswald_600SemiBold,
  });
  return loaded || !!error;
}
