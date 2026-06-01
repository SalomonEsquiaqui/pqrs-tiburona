const { supabase, supabaseAdmin } = require('../config/supabase');

// ─── REGISTRO ───────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { nombre, email, password, telefono, tipo_identificacion, numero_identificacion, rol, pin } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
    }
    if (!tipo_identificacion || !numero_identificacion) {
      return res.status(400).json({ error: 'El tipo y número de identificación son obligatorios.' });
    }

    // ── Validar unicidad: email ─────────────────────────────────────────────
    const { data: emailExiste } = await supabaseAdmin
      .from('users').select('id').eq('email', email).maybeSingle();
    if (emailExiste) {
      return res.status(409).json({ error: '❌ Este correo electrónico ya está registrado.' });
    }

    // ── Validar unicidad: teléfono ──────────────────────────────────────────
    if (telefono) {
      const { data: telExiste } = await supabaseAdmin
        .from('users').select('id').eq('telefono', telefono).maybeSingle();
      if (telExiste) {
        return res.status(409).json({ error: '❌ Este número de teléfono ya está registrado.' });
      }
    }

    // ── Validar unicidad: número de identificación ──────────────────────────
    const { data: idExiste } = await supabaseAdmin
      .from('users').select('id').eq('numero_identificacion', numero_identificacion).maybeSingle();
    if (idExiste) {
      return res.status(409).json({ error: '❌ Este número de identificación ya está registrado.' });
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
        id:                   authData.user.id,
        nombre,
        email,
        telefono:             telefono || '',
        tipo_identificacion,
        numero_identificacion,
        rol:                  rolFinal
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

// exports al final del archivo
// ─── RESET CONTRASEÑA (sin email, verificado por frontend) ──────────────────
const resetPassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'Datos incompletos.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres.' });
    }

    // Verificar que el usuario existe
    const { data: usuario } = await supabaseAdmin
      .from('users').select('id').eq('id', userId).maybeSingle();

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Cambiar contraseña usando el cliente admin de Supabase
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ message: 'Contraseña actualizada correctamente.' });

  } catch (err) {
    console.error('[resetPassword]', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// ─── VERIFICAR IDENTIDAD (para recuperar contraseña) ─────────────────────────
const verifyIdentity = async (req, res) => {
  try {
    const { metodo, valor } = req.body;

    if (!metodo || !valor) {
      return res.status(400).json({ error: 'Datos incompletos.' });
    }

    let query;

    if (metodo === 'email') {
      // Buscar por email exacto (case-insensitive)
      query = await supabaseAdmin
        .from('users')
        .select('id, email')
        .ilike('email', valor.trim())
        .maybeSingle();
    } else if (metodo === 'id') {
      // Buscar por número de identificación
      query = await supabaseAdmin
        .from('users')
        .select('id, numero_identificacion')
        .eq('numero_identificacion', valor.trim())
        .maybeSingle();
    } else {
      return res.status(400).json({ error: 'Método de verificación inválido.' });
    }

    const { data, error } = query;

    if (error) {
      console.error('[verifyIdentity] DB error:', error);
      return res.status(500).json({ error: 'Error al consultar la base de datos.' });
    }

    if (!data) {
      return res.status(404).json({ error: metodo === 'email'
        ? 'No encontramos ninguna cuenta con ese correo.'
        : 'No encontramos ninguna cuenta con ese número de identificación.'
      });
    }

    return res.json({ userId: data.id });

  } catch (err) {
    console.error('[verifyIdentity]', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = { register, login, resetPassword, verifyIdentity };
