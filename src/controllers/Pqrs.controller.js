const { supabaseAdmin } = require('../config/supabase');

// ─── CREAR PQRS ──────────────────────────────────────────────────────────────
const crear = async (req, res) => {
  try {
    const { radicado, usuario_id, tipo, asunto, descripcion, area } = req.body;

    if (!usuario_id || !tipo || !asunto || !descripcion) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    const { data, error } = await supabaseAdmin
      .from('pqrs')
      .insert({ radicado, usuario_id, tipo, asunto, descripcion, area: area || null, estado: 'pendiente' })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'PQRS creada.', pqrs: data });

  } catch (err) {
    console.error('[crear pqrs]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
};

// ─── LISTAR (admin ve todas, usuario solo las suyas) ─────────────────────────
const listar = async (req, res) => {
  try {
    const { usuario_id, rol } = req.query;
    let query = supabaseAdmin.from('pqrs').select('*, users!pqrs_usuario_id_fkey(nombre,email)').order('created_at', { ascending: false });
    if (rol === 'usuario') query = query.eq('usuario_id', usuario_id);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);

  } catch (err) {
    console.error('[listar pqrs]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
};

// ─── DETALLE ─────────────────────────────────────────────────────────────────
const detalle = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('pqrs')
      .select('*, users!pqrs_usuario_id_fkey(nombre,email)')
      .eq('id', id)
      .single();

    if (error) return res.status(404).json({ error: 'PQRS no encontrada.' });
    return res.json(data);

  } catch (err) {
    return res.status(500).json({ error: 'Error interno.' });
  }
};

// ─── ACTUALIZAR ESTADO ────────────────────────────────────────────────────────
const actualizarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const estadosValidos = ['pendiente', 'asignado', 'en_proceso', 'resuelto', 'cerrado'];
    if (!estadosValidos.includes(estado)) return res.status(400).json({ error: 'Estado inválido.' });

    const { error } = await supabaseAdmin.from('pqrs').update({ estado, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Estado actualizado.' });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno.' });
  }
};

// ─── ASIGNAR SOPORTE ──────────────────────────────────────────────────────────
const asignar = async (req, res) => {
  try {
    const { id } = req.params;
    const { soporte_id, prioridad, sla_horas } = req.body;

    const vencimiento = new Date(Date.now() + (sla_horas || 48) * 3600 * 1000).toISOString();

    // Upsert asignación
    const { error: aErr } = await supabaseAdmin
      .from('asignaciones')
      .upsert({ pqrs_id: id, soporte_id, prioridad, sla_horas, vencimiento, estado: 'activo' }, { onConflict: 'pqrs_id' });

    if (aErr) return res.status(400).json({ error: aErr.message });

    // Actualizar estado PQRS
    await supabaseAdmin.from('pqrs').update({ estado: 'asignado', soporte_id, updated_at: new Date().toISOString() }).eq('id', id);

    return res.json({ message: 'Asignado correctamente.' });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno.' });
  }
};

// ─── AGREGAR COMENTARIO/RESPUESTA ─────────────────────────────────────────────
const responder = async (req, res) => {
  try {
    const { id } = req.params;
    const { soporte_id, contenido, nuevo_estado } = req.body;

    if (!contenido) return res.status(400).json({ error: 'El contenido es obligatorio.' });

    const { error: rErr } = await supabaseAdmin
      .from('respuestas')
      .insert({ pqrs_id: id, soporte_id, contenido });

    if (rErr) return res.status(400).json({ error: rErr.message });

    if (nuevo_estado) {
      await supabaseAdmin.from('pqrs').update({ estado: nuevo_estado, updated_at: new Date().toISOString() }).eq('id', id);
      if (nuevo_estado === 'resuelto') {
        await supabaseAdmin.from('asignaciones').update({ estado: 'cerrado' }).eq('pqrs_id', id);
      }
    }

    return res.json({ message: 'Respuesta guardada.' });

  } catch (err) {
    return res.status(500).json({ error: 'Error interno.' });
  }
};

// ─── BUSCAR POR RADICADO O NOMBRE ────────────────────────────────────────────
const buscar = async (req, res) => {
  try {
    const { q, usuario_id } = req.query;
    if (!q) return res.json([]);

    let query = supabaseAdmin
      .from('pqrs')
      .select('*')
      .or(`radicado.ilike.%${q}%,asunto.ilike.%${q}%`);

    if (usuario_id) query = query.eq('usuario_id', usuario_id);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);

  } catch (err) {
    return res.status(500).json({ error: 'Error interno.' });
  }
};

module.exports = { crear, listar, detalle, actualizarEstado, asignar, responder, buscar };