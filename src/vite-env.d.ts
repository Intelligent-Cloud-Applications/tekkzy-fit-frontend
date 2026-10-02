/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string;
  readonly VITE_API_URL: string;
  readonly VITE_GYM_API_KEY?: string;
  readonly VITE_DEVICE_API_URL?: string;
  readonly VITE_DEVICE_PROVIDER: string;
  readonly VITE_PAYMENT_PROVIDER: string;
  readonly VITE_NOTIFICATION_PROVIDER: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
