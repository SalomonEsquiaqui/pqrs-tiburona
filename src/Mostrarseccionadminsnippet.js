// REEMPLAZA la función mostrarSeccionAdmin en src/public/js/admin.js
// Busca estas líneas y reemplázalas:

function mostrarSeccionAdmin(id, btn) {
  document.querySelectorAll('section[id^="sec-"]').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
  document.getElementById(`sec-${id}`).style.display = 'block';
  if (btn) btn.classList.add('activo');

  // Cargar datos según la sección que se abre
  if (id === 'pines') cargarPines();
  if (id === 'usuarios') cargarUsuarios();
  if (id === 'soporte-team') cargarEquipoSoporte();
}