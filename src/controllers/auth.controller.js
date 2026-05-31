const { supabase, supabaseAdmin } = require('../config/supabase');

// ─── REGISTRO ───────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { nombre, email, password, telefono, rol, pin } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
    }

    const rolFinal = ['admin', 'soporte'].includes(rol) ? rol : 'usuario';

    // ── Validar PIN si el rol requiere ─────────────────────────────────────
    if (rolFinal !== 'usuario') {
      if (!pin) {
        return res.status(403).json({ error: `Se requiere un PIN para el rol "${rolFinal}".` });
      }

      const { data: pinData, error: pinError } = await supabaseAdmin
        .from('pines')
        .select('*')
        .eq('rol', rolFinal)
        .eq('pin', pin)
        .eq('activo', true)
        .single();

      if (pinError || !pinData) {
        return res.status(403).json({ error: 'PIN incorrecto o inválido para este rol.' });
      }
    }

    // ── Crear usuario en Supabase Auth ─────────────────────────────────────
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,          // confirmamos sin email en local
      user_metadata: { nombre, telefono: telefono || '' }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // ── Insertar perfil en tabla users ──────────────────────────────────────
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id:       authData.user.id,
        nombre,
        email,
        telefono: telefono || '',
        rol:      rolFinal
      });

    if (profileError) {
      // Revertir usuario si falla el perfil
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: 'Error creando el perfil de usuario.' });
    }

    return res.json({
      message: 'Usuario registrado correctamente.',
      user: { id: authData.user.id, email, rol: rolFinal }
    });

  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// ─── LOGIN ───────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    // Obtener rol del perfil
    const { data: perfil } = await supabaseAdmin
      .from('users')
      .select('rol, nombre')
      .eq('id', data.user.id)
      .single();

    return res.json({
      message: 'Login exitoso.',
      session: data.session,
      user:    { ...data.user, rol: perfil?.rol || 'usuario', nombre: perfil?.nombre }
    });

  // Reemplaza el catch de register por este:
} catch (err) {
  console.error('[register] Error completo:', JSON.stringify(err, null, 2));
  console.error('[register] Message:', err.message);
  return res.status(500).json({ error: err.message || 'Error interno del servidor.' });
}
};

module.exports = { register, login };