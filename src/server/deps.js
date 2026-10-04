// Builds the production dependencies once per server instance. Server-only: never import from client code.
import { createClient } from '@supabase/supabase-js';
import { handle } from '../lib/api.js';
import { anthropicClient } from '../lib/anthropic.js';
import { loadMasterKeys } from '../lib/keyring.js';
import { RateLimiter, parseAdminEmails } from '../lib/security.js';
import { supabaseStores } from '../lib/supabase-stores.js';
import { Vault } from '../lib/vault.js';
import { supabaseAccounts } from './accounts.js';

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return v;
}

let cached;
export function getDeps() {
  if (cached) return cached;
  const sb = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const stores = supabaseStores(sb);
  cached = {
    vault: new Vault({ master: loadMasterKeys(process.env), keys: stores.keys, docs: stores.docs }),
    profiles: stores.profiles,
    accounts: supabaseAccounts(sb, { url: need('SUPABASE_URL'), anonKey: need('SUPABASE_ANON_KEY'), profiles: stores.profiles }),
    usage: stores.usage,
    // Optional: without an API key the app runs normally and document reading reports "not configured".
    ai: process.env.ANTHROPIC_API_KEY
      ? anthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5' })
      : { async complete() { throw Object.assign(new Error('Document reading is not configured on this server'), { code: 'not_available' }); } },
    admins: parseAdminEmails(process.env.ADMIN_EMAILS),
    // Oct 4: open sign-up (no admin approval). Set REQUIRE_APPROVAL=1 on Vercel to bring the approval step back.
    requireApproval: process.env.REQUIRE_APPROVAL === '1',
    appOrigin: need('APP_ORIGIN'),
    limiter: new RateLimiter(30, 60_000),
    loginLimiter: new RateLimiter(5, 10 * 60_000),
    verifyLimiter: new RateLimiter(8, 10 * 60_000),
    dailyReadCap: Number(process.env.DAILY_READ_CAP || 30),
  };
  return cached;
}
export { handle };
