/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The agent's login from AGENT_EMAIL and AGENT_PASSWORD, put in at build time (vite.config.ts). */
declare const __AGENT_EMAIL__: string;
declare const __AGENT_PASSWORD__: string;
