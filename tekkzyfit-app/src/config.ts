export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://g87iwuddyc.execute-api.us-east-2.amazonaws.com/dev';
export const GYM_API_KEY = 'tekkzy-fit-dev-9f3c2a71';
/** Defaults are the beta test gym (Tekkzy Gym); release builds set the real gym via EXPO_PUBLIC_*. */
export const INSTITUTION = process.env.EXPO_PUBLIC_INSTITUTION || 'Tekkzyfit001';
export const UPDATE_HOST = process.env.EXPO_PUBLIC_UPDATE_HOST || 'https://tekkzyfitgym.tekkzy.com';
/** Beta shares tekkzyfitgym.tekkzy.com with old Fitness World 2.0 installs, so it reads its own folder. */
export const UPDATE_DIR = process.env.EXPO_PUBLIC_UPDATE_DIR || 'downloads';
/** Each gym has one machine: Fitnessworld001 (2.0) and Tekkzyfit001 run CardM, Fitnessworld002 runs Hikvision. */
export const DEVICE_KIND: 'ai806' | 'hikvision' =
  (process.env.EXPO_PUBLIC_DEVICE_KIND as 'ai806' | 'hikvision' | undefined)
  || (INSTITUTION === 'Fitnessworld002' ? 'hikvision' : 'ai806');

export const HOST_HINT_OCTETS = [
  227, 225, 92, 231, 253, 164, 80, 100, 101, 1, 2, 10, 20, 50, 110, 126, 200, 210, 220, 230, 240, 250,
];

export const TERMINAL_MARKS = [
  'biometric',
  'ai806',
  'getdevinfo',
  'enrollid',
  'opendoor',
  'password error',
  'uistr_ai_bio',
  'home.html',
];
