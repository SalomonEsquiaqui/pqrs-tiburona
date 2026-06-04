const { supabaseAdmin } = require('../config/supabase');

// Listar todos los reportes con info del autor
const listar = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('reportes')
      .select(`
        id, titulo, descripcion, area, foto_url, autor_id, created_at, updated_at,
        users!reportes_autor_id_fkey(nombre, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    const resultado = (data || []).map(r => ({
      id: r.id,
      titulo: r.titulo,
      descripcion: r.descripcion,
      area: r.area,
      foto_url: r.foto_url,
      autor_id: r.autor_id,
      autor_nombre: r.users?.nombre || '—',
      autor_avatar: r.users?.avatar_url || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return res.json(resultado);
  } catch (err) {
    return res.status(500).json({ error: 'Error interno.' });
  }
};

// Crear nuevo reporte
const crear = async (req, res) => {
  try {
    // Obtener sesión del header Authorization o de la cookie
    const authHeader = req.headers['x-user-id'] || req.headers['authorization'];
    const userId = authHeader || (req.body && req.body._userId);

    if (!userId) return res.status(401).json({ error: 'No autenticado.' });

    // Verificar que sea rol mantenimiento
    const { data: usuario } = await supabaseAdmin
      .from('users').select('rol').eq('id', userId).single();

    if (!usuario || usuario.rol !== 'mantenimiento') {
      return res.status(403).json({ error: 'Sin permisos.' });
    }

    const { titulo, descripcion, area, foto_url } = req.body;
    if (!titulo || !descripcion) return res.status(400).json({ error: 'Título y descripción son obligatorios.' });

    const { data, error } = await supabaseAdmin
      .from('reportes')
      .insert({ titulo, descripcion, area: area || null, foto_url: foto_url || null, autor_id: userId })
      .select().single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Error interno.' });
  }
};

// Editar reporte (solo dentro de 2 minutos)
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] || req.body._userId;

    if (!userId) return res.status(401).json({ error: 'No autenticado.' });

    const { data: reporte } = await supabaseAdmin
      .from('reportes').select('autor_id, created_at').eq('id', id).single();

    if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado.' });
    if (reporte.autor_id !== userId) return res.status(403).json({ error: 'No puedes editar este reporte.' });

    const limite = 2 * 60 * 1000;
    const diff = Date.now() - new Date(reporte.created_at).getTime();
    if (diff > limite) return res.status(403).json({ error: 'El tiempo de edición ha expirado (2 minutos).' });

    const { titulo, descripcion, area, foto_url } = req.body;
    const campos = {};
    if (titulo)       campos.titulo       = titulo;
    if (descripcion)  campos.descripcion  = descripcion;
    if (area !== undefined) campos.area   = area;
    if (foto_url !== undefined) campos.foto_url = foto_url;
    campos.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('reportes').update(campos).eq('id', id).select().single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Error interno.' });
  }
};

module.exports = { listar, crear, actualizar };
