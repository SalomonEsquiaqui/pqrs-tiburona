// ===== PANEL ADMINISTRADOR =====
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let todasPqrs     = [];
let agenteSoporte = [];
let asignarPqrsId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const sesion = await verificarSesion(db);
  if (!sesion) return;

  const { data: perfil } = await db.from('users').select('nombre,rol').eq('id', sesion.user.id).single();
  if (!perfil || perfil.rol !== 'admin') { window.location.href = '/pages/index.html'; return; }

  document.getElementById('nombre-admin').textContent = perfil.nombre;

  await Promise.all([cargarTodasPqrs(), cargarUsuarios(), cargarSoporte()]);

  // Iniciar campana de notificaciones
  initNotifAdmin();

  document.getElementById('a-filtro-estado').addEventListener('change', filtrarAdmin);
  document.getElementById('a-filtro-tipo').addEventListener('change', filtrarAdmin);
  document.getElementById('a-buscar').addEventListener('input', async (e) => {
    const q = e.target.value.trim();
    if (!q) { renderAdminPqrs(todasPqrs); return; }
    try {
      const data = await apiFetch(`/pqrs/buscar?q=${encodeURIComponent(q)}`);
      renderAdminPqrs(data);
    } catch (_) { renderAdminPqrs(todasPqrs.filter(p => p.radicado.includes(q.toUpperCase()) || p.asunto.toLowerCase().includes(q.toLowerCase()))); }
  });

  // Realtime
  db.channel('admin-pqrs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pqrs' }, () => cargarTodasPqrs())
    .subscribe();
});

// ── CARGAR TODAS ─────────────────────────────────────────────────────────────
async function cargarTodasPqrs() {
  const { data } = await db
    .from('pqrs')
    .select('*, users!pqrs_usuario_id_fkey(nombre,email)')
    .order('created_at', { ascending: false });
  todasPqrs = data || [];
  actualizarStats();
  renderAdminPqrs(todasPqrs);
  // Verificar y notificar PQRS pendientes
  setTimeout(verificarPendientesAdmin, 100);
}

function actualizarStats() {
  document.getElementById('g-total').textContent      = todasPqrs.length;
  document.getElementById('g-pendientes').textContent = todasPqrs.filter(p => p.estado === 'pendiente').length;
  document.getElementById('g-en-proceso').textContent = todasPqrs.filter(p => ['asignado','en_proceso'].includes(p.estado)).length;
  document.getElementById('g-resueltos').textContent  = todasPqrs.filter(p => p.estado === 'resuelto').length;
}

function renderAdminPqrs(lista) {
  const tbody = document.getElementById('tabla-admin-pqrs');
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#aaa;">Sin solicitudes</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(p => {
    const estadoClass = p.estado.replace('_', '-');
    return `<tr>
      <td><code class="cod-radicado">${p.radicado}</code></td>
      <td>${p.users?.nombre || '—'}</td>
      <td><span class="badge badge-tipo-${p.tipo}">${p.tipo}</span></td>
      <td class="asunto-cell">${p.asunto}</td>
      <td>${p.area || '—'}</td>
      <td><span class="estado estado-${estadoClass}">${p.estado.replace('_',' ')}</span></td>
      <td>${formatFecha(p.created_at)}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-primario" onclick="abrirModalAsignar('${p.id}','${p.radicado}','${p.tipo}')">
          ${p.estado === 'pendiente' ? '📋 Asignar' : '🔄 Reasignar'}
        </button>
        <button class="btn btn-sm btn-verde" onclick="abrirModalVer('${p.id}')">👁</button>
      </td>
    </tr>`;
  }).join('');
}

function filtrarAdmin() {
  const estado = document.getElementById('a-filtro-estado').value;
  const tipo   = document.getElementById('a-filtro-tipo').value;
  let f = todasPqrs;
  if (estado) f = f.filter(p => p.estado === estado);
  if (tipo)   f = f.filter(p => p.tipo === tipo);
  renderAdminPqrs(f);
}

// ── USUARIOS ─────────────────────────────────────────────────────────────────
async function cargarUsuarios() {
  const { data } = await db.from('users').select('*').order('created_at', { ascending: false });
  const tbody = document.getElementById('tabla-usuarios');
  if (!data?.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#aaa;">Sin usuarios</td></tr>'; return; }
  tbody.innerHTML = data.map(u => `
    <tr>
      <td>${u.nombre}</td>
      <td>${u.email}</td>
      <td>${u.telefono || '—'}</td>
      <td><span class="badge badge-${u.rol}">${u.rol}</span></td>
      <td>
        <select onchange="cambiarRol('${u.id}',this.value)" style="padding:5px 8px;border:1px solid var(--gris-medio);border-radius:6px;font-size:0.8rem;">
          <option value="usuario" ${u.rol==='usuario'?'selected':''}>Usuario</option>
          <option value="soporte" ${u.rol==='soporte'?'selected':''}>Soporte</option>
          <option value="admin"   ${u.rol==='admin'?'selected':''}>Admin</option>
        </select>
      </td>
    </tr>`).join('');
}

async function cambiarRol(userId, nuevoRol) {
  try {
    await apiFetch(`/users/${userId}/rol`, { method: 'PATCH', body: JSON.stringify({ rol: nuevoRol }) });
    await cargarSoporte();
    await cargarUsuarios();
  } catch (err) { alert('Error al cambiar rol: ' + err.message); }
}

// ── SOPORTE ───────────────────────────────────────────────────────────────────
async function cargarSoporte() {
  const { data } = await db.from('users').select('*').eq('rol', 'soporte');
  agenteSoporte = data || [];

  const sel = document.getElementById('sel-soporte');
  if (sel) sel.innerHTML = agenteSoporte.length
    ? agenteSoporte.map(s => `<option value="${s.id}">${s.nombre} — ${s.email}</option>`).join('')
    : '<option value="">No hay agentes de soporte</option>';

  const container = document.getElementById('cards-soporte');
  if (!container) return;
  if (!agenteSoporte.length) {
    container.innerHTML = '<p style="color:#aaa;">No hay agentes. Asigna el rol "soporte" a un usuario.</p>';
    return;
  }
  container.innerHTML = agenteSoporte.map(s => `
    <div class="card card-agente">
      <div class="agente-avatar">${s.nombre.charAt(0).toUpperCase()}</div>
      <div>
        <strong style="color:var(--azul-oscuro);">${s.nombre}</strong>
        <small style="color:#888;display:block;">${s.email}</small>
      </div>
      <span class="badge badge-soporte">Soporte</span>
    </div>`).join('');
}

// ── MODAL ASIGNAR ─────────────────────────────────────────────────────────────
function abrirModalAsignar(id, radicado, tipo) {
  asignarPqrsId = id;
  document.getElementById('asignar-radicado').textContent = `${radicado} — Tipo: ${tipo}`;
  const horasSla = SLA_HORAS[tipo] || 48;
  document.getElementById('asignar-sla').textContent = `SLA: ${SLA_DIAS[tipo] || 6} días hábiles (${horasSla}h)`;
  ocultarMensaje('msg-asignar');
  document.getElementById('modal-asignar').classList.add('abierto');
}

async function confirmarAsignacion() {
  const soporteId = document.getElementById('sel-soporte').value;
  const prioridad = document.getElementById('sel-prioridad').value;
  if (!soporteId) { mostrarMensaje('msg-asignar', 'Selecciona un agente.', 'error'); return; }

  const pqrs = todasPqrs.find(p => p.id === asignarPqrsId);
  const sla  = SLA_HORAS[pqrs?.tipo] || 48;

  try {
    await apiFetch(`/pqrs/${asignarPqrsId}/asignar`, {
      method: 'POST',
      body: JSON.stringify({ soporte_id: soporteId, prioridad, sla_horas: sla })
    });
    mostrarMensaje('msg-asignar', '✅ Asignado correctamente.', 'exito');
    setTimeout(() => cerrarModal('modal-asignar'), 1500);
    await cargarTodasPqrs();
  } catch (err) {
    mostrarMensaje('msg-asignar', err.message, 'error');
  }
}

// ── MODAL VER DETALLE ─────────────────────────────────────────────────────────
async function abrirModalVer(id) {
  const { data: p }         = await db.from('pqrs').select('*, users!pqrs_usuario_id_fkey(nombre,email)').eq('id', id).single();
  const { data: respuestas } = await db.from('respuestas').select('*, users(nombre)').eq('pqrs_id', id).order('created_at');

  document.getElementById('ver-contenido').innerHTML = `
    <div class="detalle-header">
      <div><strong>Radicado</strong><br><code class="cod-radicado">${p.radicado}</code></div>
      <div><strong>Estado</strong><br><span class="estado estado-${p.estado.replace('_','-')}">${p.estado.replace('_',' ')}</span></div>
      <div><strong>Usuario</strong><br>${p.users?.nombre || '—'}</div>
    </div>
    <div class="detalle-campo"><strong>Asunto</strong><p>${p.asunto}</p></div>
    <div class="detalle-campo"><strong>Descripción</strong><p style="white-space:pre-wrap;">${p.descripcion}</p></div>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--gris-medio);">
    <h4 style="margin-bottom:10px;">💬 Respuestas (${respuestas?.length||0})</h4>
    ${respuestas?.length
      ? respuestas.map(r=>`<div class="respuesta-item"><div class="respuesta-header"><strong>${r.users?.nombre||'Soporte'}</strong><span>${formatFecha(r.created_at)}</span></div><p>${r.contenido}</p></div>`).join('')
      : '<p style="color:#bbb;font-size:0.85rem;">Sin respuestas aún.</p>'}
  `;
  document.getElementById('modal-ver').classList.add('abierto');
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function mostrarSeccionAdmin(id, btn) {
  document.querySelectorAll('section[id^="sec-"]').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
  document.getElementById(`sec-${id}`).style.display = 'block';
  if (btn) btn.classList.add('activo');

  // Cargar datos según la sección que se abre
  if (id === 'pines')        cargarPines();
  if (id === 'usuarios')     cargarUsuarios();
  if (id === 'soporte-team') cargarSoporte();
}


function cerrarModal(id) { document.getElementById(id)?.classList.remove('abierto'); }
function cerrarSesionLocal() { cerrarSesion(db); }


// ── NOTIFICACIONES ADMIN ──────────────────────────────────────────────────────

const NOTIF_ADMIN_KEY = 'pqrs_notif_admin';
let ultimoPendienteCount = -1;

function cargarNotifAdmin() {
  try { return JSON.parse(localStorage.getItem(NOTIF_ADMIN_KEY) || '[]'); }
  catch { return []; }
}
function guardarNotifAdmin(lista) {
  localStorage.setItem(NOTIF_ADMIN_KEY, JSON.stringify(lista.slice(0, 40)));
}
function agregarNotifAdmin(notif) {
  const lista = cargarNotifAdmin();
  lista.unshift({ id: Date.now(), leida: false, ts: new Date().toISOString(), ...notif });
  guardarNotifAdmin(lista);
  return lista;
}
function marcarLeidasAdmin() {
  const lista = cargarNotifAdmin().map(n => ({ ...n, leida: true }));
  guardarNotifAdmin(lista);
  renderNotifAdmin();
}
function clickNotifAdmin(id) {
  const lista = cargarNotifAdmin().map(n => n.id == id ? { ...n, leida: true } : n);
  guardarNotifAdmin(lista);
  renderNotifAdmin();
  // Navegar a gestión PQRS
  mostrarSeccionAdmin('todas-pqrs');
  document.getElementById('notif-panel')?.classList.remove('open');
  // Filtrar por pendientes
  const sel = document.getElementById('a-filtro-estado');
  if (sel) { sel.value = 'pendiente'; filtrarAdmin(); }
}

function renderNotifAdmin() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const lista = cargarNotifAdmin();
  const noLeidas = lista.filter(n => !n.leida).length;

  panel.innerHTML = `
    <div class="notif-panel-header">
      <h4>📋 Notificaciones ${noLeidas > 0 ? `<span style="background:rgba(255,255,255,.25);border-radius:10px;padding:1px 7px;font-size:.7rem;">${noLeidas}</span>` : ''}</h4>
      <button onclick="marcarLeidasAdmin()">Marcar leídas</button>
    </div>
    <div class="notif-list">
      ${lista.length === 0
        ? `<div class="notif-vacio"><span class="notif-vacio-icon">✅</span>Sin notificaciones</div>`
        : lista.map(n => `
            <div class="notif-item ${n.leida ? '' : 'no-leida'}" onclick="clickNotifAdmin('${n.id}')">
              <div class="notif-icono">${n.icono || '📋'}</div>
              <div class="notif-body">
                <div class="notif-titulo">${n.titulo}</div>
                <div class="notif-desc">${n.desc}</div>
                ${n.count ? `<div class="notif-sla-badge">📋 ${n.count} PQRS pendientes</div>` : ''}
                <div class="notif-tiempo">${tiempoRelAdmin(n.ts)}</div>
              </div>
            </div>`).join('')
      }
    </div>
  `;
  const dot = document.querySelector('.notif-dot');
  if (dot) dot.classList.toggle('visible', noLeidas > 0);
}

function tiempoRelAdmin(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora mismo';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs/24)}d`;
}

function toggleNotifAdmin() {
  const panel = document.getElementById('notif-panel');
  const btn   = document.querySelector('.notif-bell-btn');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  if (!isOpen) {
    const sidebarW = document.querySelector('.sidebar')?.offsetWidth || 228;
    const rect     = btn.getBoundingClientRect();
    const panelH   = 320;

    let top = rect.top + (rect.height / 2) - (panelH / 2);
    top = Math.max(12, Math.min(top, window.innerHeight - panelH - 12));

    panel.style.top  = `${top}px`;
    panel.style.left = `${sidebarW + 12}px`;
    renderNotifAdmin();
    dingDong();
  }
  panel.classList.toggle('open', !isOpen);
}

// Barra de disponibles
function actualizarBarraDisponibles(count) {
  let barra = document.getElementById('admin-notif-bar');
  if (!barra) {
    barra = document.createElement('div');
    barra.id = 'admin-notif-bar';
    barra.className = 'admin-notif-bar';
    barra.innerHTML = `
      <span class="admin-notif-bar-icon">📬</span>
      <div class="admin-notif-bar-text">
        <div class="admin-notif-bar-title" id="admin-notif-bar-title"></div>
        <div class="admin-notif-bar-sub" id="admin-notif-bar-sub"></div>
      </div>
      <button class="admin-notif-bar-btn" onclick="irAAsignar()">Asignar ahora</button>
    `;
    const statsGrid = document.querySelector('.stats-grid');
    if (statsGrid) statsGrid.parentNode.insertBefore(barra, statsGrid.nextSibling);
  }

  if (count > 0) {
    barra.classList.add('visible');
    document.getElementById('admin-notif-bar-title').textContent =
      `${count} PQRS ${count === 1 ? 'disponible' : 'disponibles'} para asignar`;
    document.getElementById('admin-notif-bar-sub').textContent =
      `Hay solicitudes pendientes sin agente asignado. Asígnalas para comenzar la atención.`;
  } else {
    barra.classList.remove('visible');
  }
}

function irAAsignar() {
  mostrarSeccionAdmin('todas-pqrs');
  const sel = document.getElementById('a-filtro-estado');
  if (sel) { sel.value = 'pendiente'; filtrarAdmin(); }
  document.getElementById('admin-notif-bar')?.classList.remove('visible');
}

// Detectar cambio en pendientes y notificar
function verificarPendientesAdmin() {
  const count = todasPqrs.filter(p => p.estado === 'pendiente').length;
  actualizarBarraDisponibles(count);

  if (ultimoPendienteCount !== -1 && count > ultimoPendienteCount) {
    const nuevas = count - ultimoPendienteCount;
    agregarNotifAdmin({
      titulo: `📬 ${nuevas} nueva${nuevas > 1 ? 's' : ''} PQRS pendiente${nuevas > 1 ? 's' : ''}`,
      desc: `Hay ${count} PQRS en total esperando ser asignadas a un agente de soporte.`,
      icono: '📬',
      count
    });
    renderNotifAdmin();
    mostrarToast(
      `${nuevas} nueva${nuevas > 1 ? 's' : ''} PQRS`,
      `${count} solicitudes pendientes por asignar`,
      'info'
    );
  } else if (ultimoPendienteCount === -1 && count > 0) {
    // Primera carga: notificar si hay pendientes
    agregarNotifAdmin({
      titulo: `📋 ${count} PQRS esperan asignación`,
      desc: `Al iniciar sesión hay ${count} PQRS pendientes sin agente asignado.`,
      icono: '📋',
      count
    });
    renderNotifAdmin();
  }
  ultimoPendienteCount = count;
}

// Inicializar campana admin
function initNotifAdmin() {
  const cont = document.querySelector('.sidebar-user');
  if (!cont || document.getElementById('notif-panel')) return;
  const wrap = document.createElement('div');
  wrap.className = 'notif-bell-wrap';
  wrap.style.cssText = 'margin-top:12px;';
  wrap.innerHTML = `
    <button class="notif-bell-btn" onclick="toggleNotifAdmin()" title="Notificaciones">
      🔔
      <span class="notif-dot" id="notif-dot"></span>
    </button>
    <div class="notif-panel" id="notif-panel"></div>
  `;
  const btnSalir = cont.querySelector('.btn-peligro');
  if (btnSalir) cont.insertBefore(wrap, btnSalir);
  else cont.appendChild(wrap);

  document.addEventListener('click', e => {
    const panel = document.getElementById('notif-panel');
    if (!wrap.contains(e.target)) panel?.classList.remove('open');
  });
}

// Toast helper para admin (usa el global de notifications.js si está disponible, sino define uno local)
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
  document.body.appendChild(toast);
  if (duracion > 0) setTimeout(() => { toast.classList.add('saliendo'); setTimeout(() => toast.remove(), 300); }, duracion);
}