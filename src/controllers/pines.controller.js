// src/controllers/pines.controller.js
const { supabaseAdmin } = require('../config/supabase');

// ── Generar PIN de 4 dígitos único ────────────────────────────────────────
async function generarPinUnico(rol) {
  let intentos = 0;
  while (intentos < 20) {
    // PIN aleatorio 1000–9999 (siempre 4 dígitos)
    const pin = String(Math.floor(1000 + Math.random() * 9000));

    const { data } = await supabaseAdmin
      .from('pines')
      .select('id')
      .eq('pin', pin)
      .eq('rol', rol)
      .maybeSingle();

    if (!data) return pin;   // no existe → es único
    intentos++;
  }
  throw new Error('No se pudo generar un PIN único. Intenta de nuevo.');
}

// ─── CREAR PIN ────────────────────────────────────────────────────────────
const crearPin = async (req, res) => {
  try {
    const { rol, descripcion } = req.body;

    if (!['soporte', 'admin'].includes(rol)) {
      return res.status(400).json({ error: 'Rol inválido. Solo "soporte" o "admin".' });
    }

    const pin = await generarPinUnico(rol);

    const { data, error } = await supabaseAdmin
      .from('pines')
      .insert({ pin, rol, descripcion: descripcion || null, activo: true, usado: false })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ message: 'PIN creado correctamente.', pin: data });

  } catch (err) {
    console.error('[crearPin]', err);
    return res.status(500).json({ error: err.message || 'Error interno.' });
  }
};

// ─── LISTAR PINES ─────────────────────────────────────────────────────────
const listarPines = async (req, res) => {
  try {
    const { rol } = req.query;  // filtro opcional: ?rol=soporte

    let query = supabaseAdmin
      .from('pines')
      .select('*')
      .order('created_at', { ascending: false });

    if (rol && ['soporte', 'admin'].includes(rol)) {
      query = query.eq('rol', rol);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json(data);

  } catch (err) {
    console.error('[listarPines]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
};

// ─── DESACTIVAR PIN ───────────────────────────────────────────────────────
const desactivarPin = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('pines')
      .update({ activo: false })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ message: 'PIN desactivado.' });

  } catch (err) {
    console.error('[desactivarPin]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
};

// ─── ELIMINAR PIN ─────────────────────────────────────────────────────────
const eliminarPin = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('pines')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ message: 'PIN eliminado.' });

  } catch (err) {
    console.error('[eliminarPin]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
};

module.exports = { crearPin, listarPines, desactivarPin, eliminarPin };