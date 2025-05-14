// em src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
  {
    realtime: {
      // levels: 'debug' | 'info' | 'warn' | 'error'
      log_level: 'debug',
    },
  }
)
