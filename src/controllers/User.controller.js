const { supabaseAdmin } = require('../config/supabase');

const listar = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Error interno.' });
  }
};

const cambiarRol = async (req, res) => {
  try {
    const { id } = req.params;
    const { rol } = req.body;
    const rolesValidos = ['usuario', 'soporte', 'admin'];
    if (!rolesValidos.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });

    const { error } = await supabaseAdmin.from('users').update({ rol }).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Rol actualizado.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno.' });
  }
};

module.exports = { listar, cambiarRol };