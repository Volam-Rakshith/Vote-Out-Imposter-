// Site configuration.
//
// To enable genuine online multiplayer (Multiple Devices mode), fill in the
// Supabase project URL and the PUBLIC anon key below (or set them on a copy of
// this file in your deployment pipeline). The anon key is designed to be
// shipped to browsers; all privileged operations run in the edge function with
// the service-role key, which is NEVER placed in client code.
//
// Everything else — One Mobile mode, rules, settings, audio, local stats —
// works fully offline with no configuration.
//
// Example:
//   supabaseUrl: 'https://abcdefgh.supabase.co',
//   supabaseAnonKey: 'eyJhbGciOi...',
//
// See docs/multiplayer-setup.md for the full walkthrough.

export const SITE_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};

export function isOnlineConfigured() {
  return Boolean(SITE_CONFIG.supabaseUrl && SITE_CONFIG.supabaseAnonKey);
}
