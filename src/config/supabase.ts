import { createClient } from '@supabase/supabase-js';
import { config } from './index';

// Backend uses service role key for full access
export const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export default supabase;
