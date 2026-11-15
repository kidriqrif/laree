/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcd.supabase.co. Empty for the demo build. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable (anon) key. Safe in the browser: row-level security guards the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Build id for error reports, e.g. the commit. Set by the host (Vercel: VERCEL_GIT_COMMIT_SHA). */
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
