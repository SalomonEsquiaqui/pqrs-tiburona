/* ================================================================
   mobile-nav.js — Barra de navegación inferior para móvil
   Incluir en los 3 dashboards ANTES del cierre </body>
   <script src="/js/mobile-nav.js"></script>
   ================================================================ */

(function () {
  if (window.innerWidth > 768) return; // solo en móvil

  // Detectar qué dashboard es
  const path = window.location.pathname;
  const isAdmin   = path.includes('admin');
  const isSoporte = path.includes('soporte');
  const isUsuario = path.includes('usuario');

  // Definir ítems según el rol
  let items = [];

  if (isAdmin) {
    items = [
      { emoji: '📋', label: 'PQRS',     fn: "mostrarSeccionAdmin('todas-pqrs', this)" },
      { emoji: '👥', label: 'Usuarios',  fn: "mostrarSeccionAdmin('usuarios', this)" },
      { emoji: '🛠',  label: 'Soporte',  fn: "mostrarSeccionAdmin('soporte-team', this)" },
      { emoji: '🔐', label: 'PINes',     fn: "mostrarSeccionAdmin('pines', this)" },
    ];
  } else if (isSoporte) {
    items = [
      { emoji: '📋', label: 'Asignadas', fn: "mostrarSeccionSoporte('asignadas', this)" },
      { emoji: '✅', label: 'Resueltas', fn: "mostrarSeccionSoporte('resueltas', this)" },
    ];
  } else if (isUsuario) {
    items = [
      { emoji: '📋', label: 'Mis PQRS',  fn: "mostrarSeccion('mis-pqrs', this)" },
      { emoji: '➕', label: 'Nueva',      fn: "mostrarSeccion('nueva-pqrs', this)" },
      { emoji: '🔍', label: 'Consultar', fn: "mostrarSeccion('buscar-pqrs', this)" },
    ];
  }

  if (!items.length) return;

  // Crear la barra
  const nav = document.createElement('nav');
  nav.className = 'nav-bottom-mobile';
  nav.innerHTML = items.map((item, i) => `
    <button
      class="nav-item ${i === 0 ? 'activo' : ''}"
      onclick="${item.fn}; activarNavItem(this)"
      style="position:relative;"
    >
      <span class="nav-emoji">${item.emoji}</span>
      <span class="nav-label">${item.label}</span>
    </button>
  `).join('');

  document.body.appendChild(nav);

  // Badge de notificaciones para soporte/admin (primer ítem)
  if (isSoporte) {
    const firstBtn = nav.querySelector('.nav-item');
    const badge = document.getElementById('badge-pendientes');
    if (badge && firstBtn) {
      const observer = new MutationObserver(() => {
        const val = badge.textContent.trim();
        let existing = firstBtn.querySelector('.notif-badge');
        if (val && val !== '0') {
          if (!existing) {
            existing = document.createElement('span');
            existing.className = 'notif-badge';
            firstBtn.appendChild(existing);
          }
          existing.textContent = val;
        } else if (existing) {
          existing.remove();
        }
      });
      observer.observe(badge, { childList: true, characterData: true, subtree: true });
    }
  }
})();

// Activa visualmente el botón tocado
function activarNavItem(el) {
  const nav = document.querySelector('.nav-bottom-mobile');
  if (!nav) return;
  nav.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
  el.classList.add('activo');
}