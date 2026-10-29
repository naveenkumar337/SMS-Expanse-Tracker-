// src/services/supabase.js
// Supabase client configuration.
//
// Authentication is fully custom (see src/services/auth.js) — there is no
// Supabase-Auth session, so this client is only ever used as the `anon`
// role to call RPCs (signup_user/login_user/get_transactions/etc.) and the
// public receipts Storage bucket.

import { createClient } from '@supabase/supabase-js';
// Named imports from '@env' are always inlined by babel at build time by
// react-native-dotenv, regardless of whether the value comes from a local
// .env file or from CI/EAS-injected build environment variables. Accessing
// `process.env.X` directly (a plain MemberExpression) is only inlined when a
// matching key exists in an actual .env file, which caused SUPABASE_URL to
// resolve to `undefined` in cloud (EAS) builds where .env is gitignored and
// never uploaded — crashing the app on launch with "supabaseUrl is required".
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);