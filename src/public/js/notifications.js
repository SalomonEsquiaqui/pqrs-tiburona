// ===== SISTEMA DE NOTIFICACIONES — La Tiburona PQRS =====
// Usado por los 3 dashboards: usuario, soporte, admin

/* ── TOAST GLOBAL ─────────────────────────────────────────────────────────── */
function mostrarToast(titulo, msg, tipo = 'info', duracion = 5000) {
  const iconos = { info: 'ℹ️', urgente: '⚠️', exito: '✅', error: '❌' };
  const toast = document.createElement('div');
  toast.className = `toast-notif toast-${tipo}`;
  toast.innerHTML = `
    <span class="toast-notif-icon">${iconos[tipo] || 'ℹ️'}</span>
    <div class="toast-notif-body">
      <div class="toast-notif-title">${titulo}</div>
      <div class="toast-notif-msg">${msg}</div>
    </div>
    <button class="toast-notif-close" onclick="this.closest('.toast-notif').remove()">×</button>
  `;
  // Desplazar toasts existentes
  document.querySelectorAll('.toast-notif').forEach((t, i) => {
    t.style.transform = `translateY(${(i + 1) * -70}px)`;
  });
  document.body.appendChild(toast);
  if (duracion > 0) {
    setTimeout(() => {
      toast.classList.add('saliendo');
      setTimeout(() => toast.remove(), 300);
    }, duracion);
  }
  return toast;
}

/* ── ALMACENAMIENTO LOCAL DE NOTIFICACIONES ───────────────────────────────── */
const NOTIF_KEY = 'pqrs_notificaciones';

function cargarNotifStorage() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); }
  catch { return []; }
}

function guardarNotifStorage(lista) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(lista.slice(0, 50)));
}

function agregarNotificacion(notif) {
  const lista = cargarNotifStorage();
  lista.unshift({
    id: Date.now() + Math.random().toString(36).slice(2),
    leida: false,
    ts: new Date().toISOString(),
    ...notif
  });
  guardarNotifStorage(lista);
  return lista;
}

function marcarTodasLeidas() {
  const lista = cargarNotifStorage().map(n => ({ ...n, leida: true }));
  guardarNotifStorage(lista);
  return lista;
}

function contarNoLeidas(lista) {
  return lista.filter(n => !n.leida).length;
}

function tiempoRelativo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Ahora mismo';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

/* ── CONSTRUIR EL HTML DEL PANEL ─────────────────────────────────────────── */
function renderNotifPanel(lista, onClickItem) {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;

  const noLeidas = contarNoLeidas(lista);

  panel.innerHTML = `
    <div class="notif-panel-header">
      <h4>🔔 Notificaciones ${noLeidas > 0 ? `<span style="background:rgba(255,255,255,.25);border-radius:10px;padding:1px 7px;font-size:.7rem;">${noLeidas}</span>` : ''}</h4>
      <button onclick="marcarNotifLeidas()">Marcar todas leídas</button>
    </div>
    <div class="notif-list" id="notif-list-inner">
      ${lista.length === 0
        ? `<div class="notif-vacio"><span class="notif-vacio-icon">🔔</span>Sin notificaciones aún</div>`
        : lista.map(n => `
            <div class="notif-item ${n.leida ? '' : 'no-leida'} ${n.urgente ? 'notif-urgente' : ''}"
                 data-id="${n.id}" onclick="onClickNotif('${n.id}')">
              <div class="notif-icono">${n.icono || '🔔'}</div>
              <div class="notif-body">
                <div class="notif-titulo">${n.titulo}</div>
                <div class="notif-desc">${n.desc}</div>
                ${n.extra ? `<div class="notif-sla-badge">⏱ ${n.extra}</div>` : ''}
                <div class="notif-tiempo">${tiempoRelativo(n.ts)}</div>
              </div>
            </div>`).join('')
      }
    </div>
  `;

  actualizarBadgeCampana(noLeidas);
}

function actualizarBadgeCampana(count) {
  const dot = document.querySelector('.notif-dot');
  const badgeNum = document.getElementById('notif-count');
  if (dot)      dot.classList.toggle('visible', count > 0);
  if (badgeNum) badgeNum.textContent = count > 0 ? count : '';
}

/* ── SONIDO DING-DONG CAMPANA ─────────────────────────────────────────────── */
function dingDong() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    function nota(freq, start, dur, vol = 0.18) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      // Reverb simple: segundo nodo con delay
      const delay = ctx.createDelay(0.4);
      const gainDelay = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      // Decay natural de campana
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      delay.delayTime.value = 0.18;
      gainDelay.gain.value  = 0.25;

      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.connect(delay);
      delay.connect(gainDelay);
      gainDelay.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + dur + 0.1);
    }

    const t = ctx.currentTime;
    // "Ding" — nota alta
    nota(880,  t,        1.2, 0.16);
    nota(1108, t + 0.02, 1.0, 0.08);  // armónico
    // "Dong" — nota baja, después de pausa
    nota(587,  t + 0.55, 1.4, 0.14);
    nota(740,  t + 0.57, 1.1, 0.07);  // armónico

    setTimeout(() => ctx.close(), 2500);
  } catch(e) { /* silencio si no hay AudioContext */ }
}

/* ── TOGGLE PANEL ─────────────────────────────────────────────────────────── */
function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const btn   = document.querySelector('.notif-bell-btn');
  if (!panel) return;

  const isOpen = panel.classList.contains('open');

  if (!isOpen) {
    const sidebarW = document.querySelector('.sidebar')?.offsetWidth || 228;
    const rect     = btn.getBoundingClientRect();
    const panelH   = 320;
    const gap      = 12;

    // Anclar verticalmente al botón, ajustar si se sale de pantalla
    let top = rect.top + (rect.height / 2) - (panelH / 2);
    top = Math.max(12, Math.min(top, window.innerHeight - panelH - 12));

    panel.style.top  = `${top}px`;
    panel.style.left = `${sidebarW + gap}px`;

    renderNotifPanel(cargarNotifStorage());
    dingDong();
  }

  panel.classList.toggle('open', !isOpen);
}

// Cerrar al clic fuera
document.addEventListener('click', e => {
  const wrap = document.querySelector('.notif-bell-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('notif-panel')?.classList.remove('open');
  }
});

/* ── MARCAR LEÍDAS ────────────────────────────────────────────────────────── */
function marcarNotifLeidas() {
  const lista = marcarTodasLeidas();
  renderNotifPanel(lista);
}

/* ── CLICK EN ÍTEM ────────────────────────────────────────────────────────── */
function onClickNotif(id) {
  const lista = cargarNotifStorage().map(n => n.id == id ? { ...n, leida: true } : n);
  guardarNotifStorage(lista);
  renderNotifPanel(lista);
  // Callback custom si existe
  if (typeof window.notifClickCallback === 'function') {
    const notif = lista.find(n => n.id == id);
    if (notif) window.notifClickCallback(notif);
  }
}

/* ── INYECTAR CAMPANA EN EL SIDEBAR ──────────────────────────────────────── */
function inyectarCampana(contenedorId) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  const wrap = document.createElement('div');
  wrap.className = 'notif-bell-wrap';
  wrap.style.cssText = 'margin-top:12px;position:relative;';
  wrap.innerHTML = `
    <button class="notif-bell-btn" onclick="toggleNotifPanel()" title="Notificaciones">
      🔔
      <span class="notif-dot" id="notif-dot"></span>
    </button>
    <div class="notif-panel" id="notif-panel"></div>
  `;
  cont.appendChild(wrap);
  // Inicializar badge
  actualizarBadgeCampana(contarNoLeidas(cargarNotifStorage()));
}