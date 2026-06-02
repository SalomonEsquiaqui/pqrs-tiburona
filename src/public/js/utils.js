// ===== UTILIDADES =====

function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function horasRestantes(fechaVenc) {
  return (new Date(fechaVenc) - Date.now()) / 3600000;
}

function formatTiempo(ms) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function generarRadicado() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `TIB-${ymd}-${rand}`;
}

function redirigirPorRol(rol) {
  const rutas = {
    admin:   '/pages/dashboard-admin.html',
    soporte: '/pages/dashboard-soporte.html',
    usuario: '/pages/dashboard-usuario.html'
  };
  const destino = rutas[rol] || '/pages/index.html';
  _transicionSalida(destino);
}

function _transicionSalida(url) {
  // Crear overlay de desvanecimiento
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:#0f172a', 'opacity:0',
    'transition:opacity 0.45s cubic-bezier(.4,0,.2,1)',
    'pointer-events:all'
  ].join(';');
  document.body.appendChild(overlay);

  // Forzar reflow para que la transición arranque
  overlay.getBoundingClientRect();
  overlay.style.opacity = '1';

  setTimeout(() => { window.location.href = url; }, 460);
}

async function cerrarSesion(db) {
  await db.auth.signOut();
  window.location.href = '/pages/index.html';
}

async function verificarSesion(db) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = '/pages/index.html'; return null; }
  return session;
}

// Muestra/oculta mensajes
function mostrarMensaje(id, texto, tipo = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `mensaje ${tipo}`;
  el.textContent = texto;
  if (tipo === 'exito') setTimeout(() => ocultarMensaje(id), 4500);
}
function ocultarMensaje(id) {
  const el = document.getElementById(id);
  if (el) { el.className = 'mensaje'; el.textContent = ''; }
}

// Llamada al backend con manejo de errores
async function apiFetch(url, options = {}) {
  const res = await fetch(API_BASE + url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

// ── ALERTA ANIMADA POST-PQRS ────────────────────────────────────────────────
function mostrarAlertaPqrs(tipo) {
  const dias = SLA_DIAS[tipo] || 7;
  const overlay = document.createElement('div');
  overlay.className = 'alerta-pqrs-overlay';
  overlay.innerHTML = `
    <div class="alerta-pqrs-card">
      <div class="alerta-pqrs-icon">
        <svg viewBox="0 0 60 60" fill="none">
          <circle cx="30" cy="30" r="28" stroke="var(--verde-claro)" stroke-width="4" stroke-dasharray="175" stroke-dashoffset="175" class="alerta-circulo"/>
          <polyline points="18,30 26,38 42,22" stroke="var(--verde-claro)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="50" stroke-dashoffset="50" class="alerta-check"/>
        </svg>
      </div>
      <h2 class="alerta-pqrs-titulo">¡PQRS Enviada! 🎉</h2>
      <p class="alerta-pqrs-texto">Tu solicitud fue registrada correctamente.<br>
        Recibirás una respuesta en <strong>${dias} días hábiles</strong>.</p>
      <div class="alerta-pqrs-contador">
        <span class="alerta-pqrs-num" id="alerta-counter">10</span>
        <span class="alerta-pqrs-seg">seg</span>
      </div>
      <div class="alerta-barra-wrap"><div class="alerta-barra-fill" id="alerta-barra"></div></div>
      <button class="btn btn-verde alerta-btn-cerrar" onclick="this.closest('.alerta-pqrs-overlay').remove()">
        Entendido ✓
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  let seg = 10;
  const counter = overlay.querySelector('#alerta-counter');
  const barra   = overlay.querySelector('#alerta-barra');
  const iv = setInterval(() => {
    seg--;
    counter.textContent = seg;
    barra.style.width = ((10 - seg) / 10 * 100) + '%';
    if (seg <= 0) { clearInterval(iv); overlay.remove(); }
  }, 1000);
}