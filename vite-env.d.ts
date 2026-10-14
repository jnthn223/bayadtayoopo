/// <reference types="vite/client" />

interface ImportMetaEnv {

  readonly VITE_FIREBASE_API_KEY: string;

  readonly VITE_FIREBASE_AUTH_DOMAIN: string;

  readonly VITE_FIREBASE_PROJECT_ID: string;


  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;

  readonly VITE_FIREBASE_APP_ID: string;

  readonly VITE_KOFI_URL?: string;

  readonly VITE_SUPPORT_API_URL?: string;

  readonly VITE_PUBLIC_STATS_API_URL?: string;

}

interface ImportMeta {

  readonly env: ImportMetaEnv;

}
