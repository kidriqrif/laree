/**
 * Demo or live. A build with Supabase settings is the live app: people sign in and data lives in
 * the database. A build without them is the demo on seeded data, as on GitHub Pages.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_PUBLISHABLE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

export const isLive: boolean = SUPABASE_URL !== '' && SUPABASE_PUBLISHABLE_KEY !== ''
