/**
 * Demo or live. A build with Supabase settings is the live app: people sign in and data lives in
 * the database. A build without them is the demo on seeded data, as on GitHub Pages.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_PUBLISHABLE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

/**
 * True when both settings are present. vite.config.ts works it out and writes it in as a literal.
 * Where the choice decides what a bundle carries (the seed data, the role switcher), read
 * `__LIVE__` in place: only a literal at the spot lets the bundler drop the rest.
 */
export const isLive: boolean = __LIVE__
