/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcd.supabase.co. Empty for the demo build. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable (anon) key. Safe in the browser: row-level security guards the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
