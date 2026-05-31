const { createClient } = require('@supabase/supabase-js');

// Cliente público (anon key) — operaciones del cliente
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Cliente admin (service_role key) — operaciones privilegiadas del backend
// Con service_role el RLS se bypasea automáticamente
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession:   false
    }
  }
);

module.exports = { supabase, supabaseAdmin };