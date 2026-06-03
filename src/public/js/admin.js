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
  // Respetar filtro activo al recargar (no resetear a "todos")
  const estadoActivo = document.getElementById('a-filtro-estado')?.value;
  const tipoActivo   = document.getElementById('a-filtro-tipo')?.value;
  if (estadoActivo || tipoActivo) {
    filtrarAdmin();
  } else {
    renderAdminPqrs(todasPqrs);
  }
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
  if (window.innerWidth <= 768) {
    _renderAdminCardsMobile(lista);
  } else {
    _renderAdminTablaDesktop(lista);
  }
}

function _renderAdminTablaDesktop(lista) {
  const tbody = document.getElementById('tabla-admin-pqrs');
  const tablaWrap = tbody.closest('.tabla-wrap');
  tablaWrap.style.display = '';
  const cards = document.getElementById('cards-mobile-admin');
  if (cards) cards.style.display = 'none';

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
      <td style="display:flex;gap:6px;align-items:center;">
        ${['resuelto','cerrado'].includes(p.estado)
          ? `<button class="btn btn-sm" disabled style="opacity:0.4;cursor:not-allowed;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;min-width:110px;width:110px;justify-content:center;text-align:center;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Resuelto</button>`
          : `<button class="btn btn-sm btn-primario" style="min-width:110px;width:110px;justify-content:center;text-align:center;" onclick="abrirModalAsignar('${p.id}','${p.radicado}','${p.tipo}')">
              ${p.estado === 'pendiente' ? '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span> Asignar' : '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span> Reasignar'}
             </button>`
        }
        <button class="btn btn-sm btn-verde" onclick="abrirModalVer('${p.id}')"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span></button>
      </td>
    </tr>`;
  }).join('');
}

function _renderAdminCardsMobile(lista) {
  const tbody = document.getElementById('tabla-admin-pqrs');
  const tablaWrap = tbody.closest('.tabla-wrap');
  tablaWrap.style.display = 'none';

  let cardsWrap = document.getElementById('cards-mobile-admin');
  if (!cardsWrap) {
    cardsWrap = document.createElement('div');
    cardsWrap.id = 'cards-mobile-admin';
    cardsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    tablaWrap.parentNode.insertBefore(cardsWrap, tablaWrap);
  }
  cardsWrap.style.display = 'flex';

  const colores = {pendiente:'#f97316',asignado:'#3b82f6',en_proceso:'#8b5cf6',resuelto:'#059669',cerrado:'#94a3b8'};
  const iconos  = {peticion:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></span>',queja:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>',reclamo:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>',sugerencia:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg></span>',felicitacion:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'};

  if (!lista.length) {
    cardsWrap.innerHTML = `
      <div style="text-align:center;padding:40px 20px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;">
        <span style="font-size:2rem;display:block;margin-bottom:10px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.19 15.1 19.79 19.79 0 0 1 2.12 22 2 2 0 0 1 .88 17.84l.06-.07A19.79 19.79 0 0 0 4.6 9.63 6 6 0 1 1 18 8c0 1-.25 2.5-1.5 3.5"/></svg></span></span>
        <p style="color:#94a3b8;font-size:0.9rem;">Sin solicitudes registradas.</p>
      </div>`;
    return;
  }

  cardsWrap.innerHTML = lista.map(p => {
    const color = colores[p.estado] || '#e2e8f0';
    return `
    <div style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(15,23,42,.08);border:1px solid #e2e8f0;border-left:4px solid ${color};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:8px;">
        <div style="min-width:0;">
          <code style="font-size:0.7rem;background:#f1f5f9;padding:2px 7px;border-radius:5px;color:#475569;font-weight:700;">${p.radicado}</code>
          <p style="font-weight:700;color:#0f172a;font-size:0.9rem;margin-top:5px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${p.asunto}</p>
        </div>
        <span style="background:${color}18;color:${color};border:1px solid ${color}40;padding:3px 10px;border-radius:99px;font-size:0.68rem;font-weight:700;white-space:nowrap;flex-shrink:0;">${p.estado.replace('_',' ')}</span>
      </div>
      <div style="font-size:0.78rem;color:#64748b;margin-bottom:2px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span> ${p.users?.nombre||'—'} &nbsp;·&nbsp; ${iconos[p.tipo]||'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span>'} ${p.tipo}</div>
      <div style="font-size:0.75rem;color:#94a3b8;margin-bottom:12px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span> ${formatFecha(p.created_at)} &nbsp;·&nbsp; <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span> ${p.area||'—'}</div>
      <div style="display:flex;gap:8px;">
        ${['resuelto','cerrado'].includes(p.estado)
          ? `<button class="btn btn-sm" disabled style="flex:1;opacity:0.4;cursor:not-allowed;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;min-height:42px;justify-content:center;text-align:center;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Resuelto</button>`
          : `<button class="btn btn-sm btn-primario" style="flex:1;justify-content:center;text-align:center;min-height:42px;"
              onclick="abrirModalAsignar('${p.id}','${p.radicado}','${p.tipo}')">
              ${p.estado==='pendiente'?'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span> Asignar':'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span> Reasignar'}
             </button>`
        }
        <button class="btn btn-sm btn-verde" style="min-height:42px;padding:0 16px;"
          onclick="abrirModalVer('${p.id}')"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span></button>
      </div>
    </div>`;
  }).join('');
}

window.addEventListener('resize', () => { renderAdminPqrs(todasPqrs); });

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

  if (window.innerWidth <= 768) {
    _renderUsuariosMobile(data || []);
    return;
  }

  // ── Desktop: tabla normal ──
  const tablaWrap = tbody.closest('.tabla-wrap');
  tablaWrap.style.display = '';
  const cards = document.getElementById('cards-mobile-usuarios');
  if (cards) cards.style.display = 'none';

  if (!data?.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;">Sin usuarios</td></tr>'; return; }
  tbody.innerHTML = data.map(u => {
    const iniciales = (u.nombre || 'U').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
    const avatarCell = u.avatar_url
      ? `<img src="${u.avatar_url}" alt="${u.nombre}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"><span style="display:none;width:34px;height:34px;border-radius:50%;background:var(--azul-suave);color:var(--azul-rey);font-size:0.72rem;font-weight:700;align-items:center;justify-content:center;flex-shrink:0;">${iniciales}</span>`
      : `<span style="display:inline-flex;width:34px;height:34px;border-radius:50%;background:var(--azul-suave);color:var(--azul-rey);font-size:0.72rem;font-weight:700;align-items:center;justify-content:center;flex-shrink:0;">${iniciales}</span>`;
    const uJson = encodeURIComponent(JSON.stringify({ id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono, rol: u.rol, avatar_url: u.avatar_url || '', created_at: u.created_at, numero_identificacion: u.numero_identificacion || '' }));
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:10px;">${avatarCell}<span style="font-weight:500;">${u.nombre}</span></div></td>
      <td style="font-size:0.83rem;color:#64748b;">${u.email}</td>
      <td style="font-size:0.83rem;">${u.telefono || '—'}</td>
      <td><span class="badge badge-${u.rol}">${u.rol}</span></td>
      <td>
        ${u.rol === 'admin'
          ? `<span style="font-size:0.78rem;color:#94a3b8;background:#f1f5f9;padding:4px 10px;border-radius:6px;border:1px solid #e2e8f0;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> Admin (no editable)</span>`
          : `<select onchange="cambiarRol('${u.id}',this.value)" style="padding:5px 8px;border:1px solid var(--gris-medio);border-radius:6px;font-size:0.8rem;">
               <option value="usuario" ${u.rol==='usuario'?'selected':''}>Usuario</option>
               <option value="soporte" ${u.rol==='soporte'?'selected':''}>Soporte</option>
               <option value="admin">Administrador</option>
             </select>`
        }
      </td>
      <td>
        <button onclick="verInfoUsuario('${uJson}')"
          style="background:rgba(99,102,241,0.07);color:#6366f1;border:1px solid rgba(99,102,241,0.22);padding:5px 11px;border-radius:7px;font-size:0.75rem;cursor:pointer;font-weight:600;white-space:nowrap;">
          <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span> Info
        </button>
      </td>
    </tr>`;
  }).join('');
}

function _renderUsuariosMobile(data) {
  const tbody = document.getElementById('tabla-usuarios');
  const tablaWrap = tbody.closest('.tabla-wrap');
  tablaWrap.style.display = 'none';

  let cardsWrap = document.getElementById('cards-mobile-usuarios');
  if (!cardsWrap) {
    cardsWrap = document.createElement('div');
    cardsWrap.id = 'cards-mobile-usuarios';
    cardsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    tablaWrap.parentNode.insertBefore(cardsWrap, tablaWrap);
  }
  cardsWrap.style.display = 'flex';

  const rolColor = {usuario:'#3b82f6', soporte:'#8b5cf6', admin:'#059669'};

  if (!data.length) {
    cardsWrap.innerHTML = `<div style="text-align:center;padding:30px;background:#fff;border-radius:14px;color:#94a3b8;">Sin usuarios registrados</div>`;
    return;
  }

  cardsWrap.innerHTML = data.map(u => {
    const color = rolColor[u.rol] || '#64748b';
    const iniciales = (u.nombre || 'U').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
    const avatarHTML = u.avatar_url
      ? `<img src="${u.avatar_url}" alt="${u.nombre}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid ${color}40;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;width:42px;height:42px;border-radius:50%;background:${color}18;color:${color};font-size:0.8rem;font-weight:700;align-items:center;justify-content:center;flex-shrink:0;">${iniciales}</span>`
      : `<span style="display:inline-flex;width:42px;height:42px;border-radius:50%;background:${color}18;color:${color};font-size:0.8rem;font-weight:700;align-items:center;justify-content:center;flex-shrink:0;">${iniciales}</span>`;
    const uJson = encodeURIComponent(JSON.stringify({ id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono, rol: u.rol, avatar_url: u.avatar_url || '', created_at: u.created_at, numero_identificacion: u.numero_identificacion || '' }));
    return `
    <div style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(15,23,42,.08);border:1px solid #e2e8f0;border-left:4px solid ${color};">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        ${avatarHTML}
        <div style="min-width:0;flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong style="font-size:0.92rem;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.nombre}</strong>
            <span style="background:${color}18;color:${color};border:1px solid ${color}40;padding:3px 10px;border-radius:99px;font-size:0.68rem;font-weight:700;flex-shrink:0;">${u.rol}</span>
          </div>
          <p style="font-size:0.8rem;color:#64748b;margin:2px 0 0;">✉️ ${u.email}</p>
        </div>
      </div>
      <p style="font-size:0.8rem;color:#94a3b8;margin-bottom:12px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.19 15.1 19.79 19.79 0 0 1 2.12 22 2 2 0 0 1 0 19.82V16.92a2 2 0 0 1 1.64-2l4.16-.73A2 2 0 0 1 8 15.59l1.87 1.87a16 16 0 0 0 6.07-6.07L14.07 9.5a2 2 0 0 1-.3-2.2l.73-4.16A2 2 0 0 1 16.5 1.5h3a2 2 0 0 1 2 2.18 19.79 19.79 0 0 1-3.07 8.63"/></svg></span> ${u.telefono||'—'}</p>
      <div style="display:flex;align-items:center;gap:8px;">
        ${u.rol === 'admin'
          ? `<span style="font-size:0.78rem;color:#94a3b8;background:#f1f5f9;padding:6px 12px;border-radius:8px;border:1px solid #e2e8f0;flex:1;display:block;text-align:center;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> Administrador (no editable)</span>`
          : `<select onchange="cambiarRol('${u.id}',this.value)"
               style="flex:1;padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:0.82rem;background:#fff;min-height:40px;">
               <option value="usuario" ${u.rol==='usuario'?'selected':''}><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span> Usuario</option>
               <option value="soporte" ${u.rol==='soporte'?'selected':''}><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>️ Soporte</option>
               <option value="admin">⚙️ Administrador</option>
             </select>`
        }
        <button onclick="verInfoUsuario('${uJson}')"
          style="background:rgba(99,102,241,0.07);color:#6366f1;border:1px solid rgba(99,102,241,0.22);padding:8px 13px;border-radius:8px;font-size:0.75rem;cursor:pointer;font-weight:600;flex-shrink:0;">
          <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span>
        </button>
      </div>
    </div>`;
  }).join('');
}

async function cambiarRol(userId, nuevoRol) {
  // Buscar el usuario actual en la lista
  const { data: usuarioTarget } = await db.from('users').select('rol,nombre').eq('id', userId).single();

  // BLOQUEO: no se puede cambiar el rol de otro administrador
  if (usuarioTarget?.rol === 'admin') {
    mostrarModalConfirmAdmin({
      titulo: '⛔ Acción no permitida',
      mensaje: `<strong>${usuarioTarget.nombre}</strong> ya es administrador.<br>No es posible cambiar el rol de otro administrador desde este panel.`,
      soloInfo: true
    });
    // Revertir el select visualmente
    await cargarUsuarios();
    return;
  }

  // CONFIRMACIÓN ESPECIAL: asignar rol de admin es irreversible
  if (nuevoRol === 'admin') {
    mostrarModalConfirmAdmin({
      titulo: '⚠️ Asignar rol Administrador',
      mensaje: `¿Estás seguro de que deseas darle permisos de <strong>Administrador</strong> a <strong>${usuarioTarget?.nombre}</strong>?<br><br>
        <span style="color:#ef4444;font-size:0.85rem;">⚠️ Esta acción <strong>no es reversible</strong> desde el Sitio Web. El administrador tendrá acceso completo al sistema.</span>`,
      onConfirm: async () => {
        try {
          await apiFetch(`/users/${userId}/rol`, { method: 'PATCH', body: JSON.stringify({ rol: nuevoRol }) });
          await cargarSoporte();
          await cargarUsuarios();
          mostrarToast('<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Rol de administrador asignado correctamente.', 'exito', 4000);
        } catch (err) { alert('Error al cambiar rol: ' + err.message); }
      },
      onCancel: async () => {
        await cargarUsuarios(); // revertir select
      }
    });
    return;
  }

  // Cambio normal (usuario ↔ soporte)
  try {
    await apiFetch(`/users/${userId}/rol`, { method: 'PATCH', body: JSON.stringify({ rol: nuevoRol }) });
    await cargarSoporte();
    await cargarUsuarios();
  } catch (err) { alert('Error al cambiar rol: ' + err.message); }
}

// ── MODAL DE CONFIRMACIÓN ADMIN ───────────────────────────────────────────────
function mostrarModalConfirmAdmin({ titulo, mensaje, onConfirm, onCancel, soloInfo = false }) {
  // Eliminar modal previo si existe
  document.getElementById('modal-confirm-admin')?.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-confirm-admin';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(15,23,42,0.7);
    display:flex;align-items:center;justify-content:center;
    padding:20px;animation:fadeIn .15s ease;
  `;
  modal.innerHTML = `
    <div style="background:#fff;border-radius:18px;padding:28px 24px;max-width:400px;width:100%;
                box-shadow:0 24px 64px rgba(15,23,42,0.25);position:relative;">
      <h3 style="font-size:1rem;font-weight:800;color:#0f172a;margin:0 0 12px;line-height:1.3;">${titulo}</h3>
      <p style="font-size:0.88rem;color:#475569;line-height:1.6;margin:0 0 22px;">${mensaje}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
        ${soloInfo ? `
          <button onclick="document.getElementById('modal-confirm-admin').remove()"
            class="btn btn-primario" style="min-height:42px;padding:0 24px;">
            Entendido
          </button>
        ` : `
          <button onclick="document.getElementById('modal-confirm-admin').remove();(window._cancelConfirm&&window._cancelConfirm())"
            class="btn btn-outline" style="min-height:42px;padding:0 20px;">
            Cancelar
          </button>
          <button onclick="document.getElementById('modal-confirm-admin').remove();(window._okConfirm&&window._okConfirm())"
            class="btn btn-peligro" style="min-height:42px;padding:0 20px;background:#ef4444;color:#fff;border-color:#ef4444;">
            Sí, asignar admin
          </button>
        `}
      </div>
    </div>
  `;

  window._okConfirm     = onConfirm;
  window._cancelConfirm = onCancel;
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.remove();
      onCancel && onCancel();
    }
  });
  document.body.appendChild(modal);
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
  container.innerHTML = agenteSoporte.map(s => {
    const iniciales = (s.nombre || 'S').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
    const avatarHTML = s.avatar_url
      ? `<img src="${s.avatar_url}" alt="${s.nombre}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--azul-suave);flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;width:52px;height:52px;border-radius:50%;background:var(--azul-suave);color:var(--azul-rey);font-size:0.9rem;font-weight:700;align-items:center;justify-content:center;flex-shrink:0;">${iniciales}</span>`
      : `<span style="display:inline-flex;width:52px;height:52px;border-radius:50%;background:var(--azul-suave);color:var(--azul-rey);font-size:0.9rem;font-weight:700;align-items:center;justify-content:center;flex-shrink:0;">${iniciales}</span>`;
    return `
    <div class="card card-agente" style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;gap:12px;">
        ${avatarHTML}
        <div style="min-width:0;">
          <strong style="color:var(--azul-oscuro);display:block;">${s.nombre}</strong>
          <small style="color:#888;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.email}</small>
          <span class="badge badge-soporte" style="margin-top:4px;display:inline-block;">Soporte</span>
        </div>
      </div>
      ${s.descripcion ? `<p style="font-size:0.8rem;color:#64748b;background:#f8fafc;border-radius:8px;padding:8px 10px;margin:0;line-height:1.5;border-left:3px solid var(--azul-suave);">${s.descripcion}</p>` : ''}
    </div>`;
  }).join('');
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
    mostrarMensaje('msg-asignar', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Asignado correctamente.', 'exito');
    setTimeout(() => cerrarModal('modal-asignar'), 1500);
    await cargarTodasPqrs();
  } catch (err) {
    mostrarMensaje('msg-asignar', err.message, 'error');
  }
}

// ── MODAL VER DETALLE ─────────────────────────────────────────────────────────
let _verPqrsId = null;

async function abrirModalVer(id) {
  _verPqrsId = id;
  const { data: p }          = await db.from('pqrs').select('*, users!pqrs_usuario_id_fkey(nombre,email)').eq('id', id).single();
  const { data: respuestas } = await db.from('respuestas').select('*, users(nombre,rol)').eq('pqrs_id', id).order('created_at');

  document.getElementById('ver-contenido').innerHTML = `
    <div class="detalle-header">
      <div><strong>Radicado</strong><br><code class="cod-radicado">${p.radicado}</code></div>
      <div><strong>Estado</strong><br><span class="estado estado-${p.estado.replace('_','-')}">${p.estado.replace('_',' ')}</span></div>
      <div><strong>Usuario</strong><br>${p.users?.nombre || '—'} <span style="font-size:0.78rem;color:#94a3b8;">${p.users?.email||''}</span></div>
    </div>
    <div class="detalle-campo"><strong>Tipo</strong> <span class="badge badge-tipo-${p.tipo}">${p.tipo}</span></div>
    <div class="detalle-campo"><strong>Asunto</strong><p>${p.asunto}</p></div>
    <div class="detalle-campo"><strong>Área</strong><p>${p.area||'—'}</p></div>
    <div class="detalle-campo"><strong>Descripción</strong><p style="white-space:pre-wrap;line-height:1.6;">${p.descripcion}</p></div>
    ${renderAdjunto(p.imagen_url)}
    <p style="color:#94a3b8;font-size:0.79rem;margin-top:10px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span> Enviado el ${formatFecha(p.created_at)}</p>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--gris-medio);">
    <h4 style="margin-bottom:10px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span> Conversación (${respuestas?.length||0})</h4>
    <div id="hilo-respuestas-ver">
    ${respuestas?.length
      ? respuestas.map(r => _renderRespuestaItem(r)).join('')
      : '<p style="color:#bbb;font-size:0.85rem;">Sin mensajes aún.</p>'}
    </div>

    <!-- ── INTERVENCIÓN DEL ADMINISTRADOR ── -->
    <div style="margin-top:20px;background:linear-gradient(135deg,#f0f4ff,#e8f0fe);border:1.5px solid #c7d7fe;border-radius:14px;padding:16px;">
      <h5 style="font-size:0.82rem;font-weight:700;color:#3730a3;margin:0 0 10px;display:flex;align-items:center;gap:6px;">
        <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="5" y1="20" x2="19" y2="20"/></svg></span> Intervención del administrador
        <span style="font-size:0.7rem;font-weight:500;color:#6366f1;background:#e0e7ff;padding:2px 8px;border-radius:99px;">Visible para el cliente y soporte</span>
      </h5>
      <textarea id="admin-intervencion-txt" rows="3" maxlength="1000"
        placeholder="Escribe un mensaje de intervención… será visible para el cliente y el equipo de soporte."
        style="width:100%;box-sizing:border-box;resize:vertical;border:1.5px solid #c7d7fe;border-radius:10px;padding:10px 12px;font-family:inherit;font-size:0.88rem;line-height:1.5;background:#fff;color:#1e293b;outline:none;transition:border-color .18s;"
        onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#c7d7fe'"></textarea>
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;">
        <select id="admin-intervencion-estado"
          style="padding:7px 10px;border:1.5px solid #c7d7fe;border-radius:8px;font-size:0.82rem;background:#fff;color:#334155;">
          <option value="">— Sin cambiar estado —</option>
          <option value="en_proceso"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span> Marcar En proceso</option>
          <option value="resuelto"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Marcar Resuelto</option>
          <option value="cerrado"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> Cerrar PQRS</option>
        </select>
        <button onclick="enviarIntervencionAdmin()" id="btn-enviar-intervencion"
          style="background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border:none;border-radius:10px;padding:9px 20px;font-size:0.85rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;transition:opacity .18s;"
          onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
          <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></span> Enviar mensaje
        </button>
        <span id="admin-intervencion-msg" style="font-size:0.8rem;color:#059669;display:none;"></span>
      </div>
    </div>
  `;
  document.getElementById('modal-ver').classList.add('abierto');
}

function _renderRespuestaItem(r) {
  const esAdmin = r.users?.rol === 'admin';
  if (esAdmin) {
    return `
    <div style="margin-bottom:12px;background:linear-gradient(135deg,#f0f4ff,#e8f0fe);border:1px solid #c7d7fe;border-radius:12px;padding:12px 14px;border-left:4px solid #6366f1;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
        <strong style="font-size:0.82rem;color:#4338ca;display:flex;align-items:center;gap:5px;">
          <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="5" y1="20" x2="19" y2="20"/></svg></span> ${r.users?.nombre||'Administrador'} <span style="font-size:0.68rem;background:#e0e7ff;color:#6366f1;padding:1px 7px;border-radius:99px;font-weight:600;">Admin</span>
        </strong>
        <span style="font-size:0.73rem;color:#94a3b8;">${formatFecha(r.created_at)}</span>
      </div>
      <p style="margin:0;font-size:0.87rem;line-height:1.55;color:#1e293b;white-space:pre-wrap;">${r.contenido}</p>
    </div>`;
  }
  return `<div class="respuesta-item"><div class="respuesta-header"><strong>${r.users?.nombre||'Soporte'}</strong><span>${formatFecha(r.created_at)}</span></div><p>${r.contenido}</p></div>`;
}

async function enviarIntervencionAdmin() {
  const contenido   = document.getElementById('admin-intervencion-txt')?.value?.trim();
  const nuevoEstado = document.getElementById('admin-intervencion-estado')?.value || null;
  const msgEl       = document.getElementById('admin-intervencion-msg');
  const btn         = document.getElementById('btn-enviar-intervencion');

  if (!contenido) {
    msgEl.textContent = '⚠️ Escribe un mensaje antes de enviar.';
    msgEl.style.color = '#ef4444';
    msgEl.style.display = 'inline';
    return;
  }

  btn.disabled = true;
  btn.style.opacity = '0.6';
  msgEl.style.display = 'none';

  try {
    const { data: { session } } = await db.auth.getSession();
    await apiFetch(`/pqrs/${_verPqrsId}/responder`, {
      method: 'POST',
      body: JSON.stringify({ soporte_id: session.user.id, contenido, nuevo_estado: nuevoEstado || undefined })
    });

    msgEl.textContent = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Mensaje enviado correctamente.';
    msgEl.style.color = '#059669';
    msgEl.style.display = 'inline';
    document.getElementById('admin-intervencion-txt').value = '';
    document.getElementById('admin-intervencion-estado').value = '';

    // Recargar hilo de respuestas en el modal sin cerrarlo
    const { data: respuestas } = await db.from('respuestas').select('*, users(nombre,rol)').eq('pqrs_id', _verPqrsId).order('created_at');
    const hilo = document.getElementById('hilo-respuestas-ver');
    if (hilo) {
      hilo.innerHTML = respuestas?.length
        ? respuestas.map(r => _renderRespuestaItem(r)).join('')
        : '<p style="color:#bbb;font-size:0.85rem;">Sin mensajes aún.</p>';
    }

    await cargarTodasPqrs();
  } catch (err) {
    msgEl.textContent = '❌ ' + (err.message || 'Error al enviar.');
    msgEl.style.color = '#ef4444';
    msgEl.style.display = 'inline';
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
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
  if (id === 'perfil')       initPerfil();
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
      <h4><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span> Notificaciones ${noLeidas > 0 ? `<span style="background:rgba(255,255,255,.25);border-radius:10px;padding:1px 7px;font-size:.7rem;">${noLeidas}</span>` : ''}</h4>
      <button onclick="marcarLeidasAdmin()">Marcar leídas</button>
    </div>
    <div class="notif-list">
      ${lista.length === 0
        ? `<div class="notif-vacio"><span class="notif-vacio-icon"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span></span>Sin notificaciones</div>`
        : lista.map(n => `
            <div class="notif-item ${n.leida ? '' : 'no-leida'}" onclick="clickNotifAdmin('${n.id}')">
              <div class="notif-icono">${n.icono || '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span>'}</div>
              <div class="notif-body">
                <div class="notif-titulo">${n.titulo}</div>
                <div class="notif-desc">${n.desc}</div>
                ${n.count ? `<div class="notif-sla-badge"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span> ${n.count} PQRS pendientes</div>` : ''}
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
      <span class="admin-notif-bar-icon"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.19 15.1 19.79 19.79 0 0 1 2.12 22 2 2 0 0 1 0 19.82V16.92a2 2 0 0 1 1.64-2l4.16-.73A2 2 0 0 1 8 15.59l1.87 1.87a16 16 0 0 0 6.07-6.07L14.07 9.5a2 2 0 0 1-.3-2.2l.73-4.16A2 2 0 0 1 16.5 1.5h3a2 2 0 0 1 2 2.18 19.79 19.79 0 0 1-3.07 8.63"/></svg></span></span>
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
      titulo: `<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.19 15.1 19.79 19.79 0 0 1 2.12 22 2 2 0 0 1 0 19.82V16.92a2 2 0 0 1 1.64-2l4.16-.73A2 2 0 0 1 8 15.59l1.87 1.87a16 16 0 0 0 6.07-6.07L14.07 9.5a2 2 0 0 1-.3-2.2l.73-4.16A2 2 0 0 1 16.5 1.5h3a2 2 0 0 1 2 2.18 19.79 19.79 0 0 1-3.07 8.63"/></svg></span> ${nuevas} nueva${nuevas > 1 ? 's' : ''} PQRS pendiente${nuevas > 1 ? 's' : ''}`,
      desc: `Hay ${count} PQRS en total esperando ser asignadas a un agente de soporte.`,
      icono: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.19 15.1 19.79 19.79 0 0 1 2.12 22 2 2 0 0 1 0 19.82V16.92a2 2 0 0 1 1.64-2l4.16-.73A2 2 0 0 1 8 15.59l1.87 1.87a16 16 0 0 0 6.07-6.07L14.07 9.5a2 2 0 0 1-.3-2.2l.73-4.16A2 2 0 0 1 16.5 1.5h3a2 2 0 0 1 2 2.18 19.79 19.79 0 0 1-3.07 8.63"/></svg></span>',
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
      titulo: `<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span> ${count} PQRS esperan asignación`,
      desc: `Al iniciar sesión hay ${count} PQRS pendientes sin agente asignado.`,
      icono: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span>',
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
      <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>
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
  const iconos = { info: `<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span>`, urgente: '⚠️', exito: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>', error: '❌' };
  const toast = document.createElement('div');
  toast.className = `toast-notif toast-${tipo}`;
  toast.innerHTML = `
    <span class="toast-notif-icon">${iconos[tipo] || `<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span>`}</span>
    <div class="toast-notif-body">
      <div class="toast-notif-title">${titulo}</div>
      <div class="toast-notif-msg">${msg}</div>
    </div>
    <button class="toast-notif-close" onclick="this.closest('.toast-notif').remove()">×</button>
  `;
  document.body.appendChild(toast);
  if (duracion > 0) setTimeout(() => { toast.classList.add('saliendo'); setTimeout(() => toast.remove(), 300); }, duracion);
}
// ── VIEWER MULTIMEDIA (admin) ──

// ── VIEWER MULTIMEDIA UNIVERSAL ──────────────────────────────────────────────
function renderAdjunto(url) {
  if (!url) return '';
  const ext = url.split('.').pop().toLowerCase().split('?')[0];
  const isVideo = ['mp4','mov','avi','webm'].includes(ext);
  const isAudio = ['mp3','wav','ogg','m4a'].includes(ext);
  const isPDF   = ext === 'pdf';

  if (isVideo) return `
    <div class="adjunto-wrap">
      <p class="adjunto-label"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></span> Video adjunto</p>
      <video controls playsinline
        style="width:100%;max-height:300px;border-radius:12px;background:#000;margin-top:6px;outline:none;"
        preload="metadata">
        <source src="${url}">
        <p style="color:#94a3b8;font-size:0.85rem;">Tu navegador no soporta este video.
          <a href="${url}" target="_blank" style="color:#3b82f6;">Descargar</a>
        </p>
      </video>
      <a href="${url}" target="_blank" rel="noopener"
        style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:0.8rem;color:#3b82f6;">
        ⬇️ Descargar video
      </a>
    </div>`;

  if (isAudio) return `
    <div class="adjunto-wrap">
      <p class="adjunto-label"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span> Audio adjunto</p>
      <audio controls style="width:100%;margin-top:6px;border-radius:8px;" preload="metadata">
        <source src="${url}">
        <p style="color:#94a3b8;font-size:0.85rem;">Tu navegador no soporta audio.
          <a href="${url}" target="_blank" style="color:#3b82f6;">Descargar</a>
        </p>
      </audio>
      <a href="${url}" target="_blank" rel="noopener"
        style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:0.8rem;color:#3b82f6;">
        ⬇️ Descargar audio
      </a>
    </div>`;

  if (isPDF) return `
    <div class="adjunto-wrap">
      <p class="adjunto-label"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span> PDF adjunto</p>
      <div style="border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-top:6px;">
        <iframe src="${url}" style="width:100%;height:420px;border:none;display:block;"
          title="PDF adjunto">
        </iframe>
      </div>
      <a href="${url}" target="_blank" rel="noopener"
        class="btn btn-outline btn-sm" style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;">
        <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span> Abrir en nueva pestaña
      </a>
    </div>`;

  // Imagen por defecto
  return `
    <div class="adjunto-wrap">
      <p class="adjunto-label"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></span> Imagen adjunta</p>
      <img src="${url}" alt="Adjunto"
        style="width:100%;max-height:280px;object-fit:contain;border-radius:12px;
               cursor:zoom-in;background:#f8fafc;border:1.5px solid #e2e8f0;margin-top:6px;"
        onclick="abrirLightbox('${url}')"
        onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <p style="display:none;color:#94a3b8;font-size:0.85rem;text-align:center;padding:20px 0;">
        No se pudo cargar la imagen.
        <a href="${url}" target="_blank" style="color:#3b82f6;">Ver enlace</a>
      </p>
    </div>`;
}

// ── LIGHTBOX IMAGEN ───────────────────────────────────────────────────────────
function abrirLightbox(url) {
  const overlay = document.createElement('div');
  overlay.id = 'lightbox-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.92);
    display:flex;align-items:center;justify-content:center;
    padding:20px;cursor:zoom-out;
    animation: fadeIn 0.15s ease;
  `;
  overlay.innerHTML = `
    <button onclick="document.getElementById('lightbox-overlay').remove()"
      style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.15);
             border:none;color:#fff;width:40px;height:40px;border-radius:50%;
             font-size:1.3rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">
      ×
    </button>
    <img src="${url}"
      style="max-width:92vw;max-height:88vh;border-radius:10px;
             box-shadow:0 32px 64px rgba(0,0,0,0.6);object-fit:contain;">
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(overlay);
}

// Alias para compatibilidad con código existente
function verImagenCompleta(url) { abrirLightbox(url); }

// ── INFO USUARIO (modal admin) ────────────────────────────────────────────────
function verInfoUsuario(uJson) {
  const u = JSON.parse(decodeURIComponent(uJson));
  const iniciales = (u.nombre || 'U').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
  const rolColor  = { usuario:'#3b82f6', soporte:'#8b5cf6', admin:'#059669' }[u.rol] || '#64748b';
  const rolLabel  = { usuario:'Usuario', soporte:'Soporte', admin:'Administrador' }[u.rol] || u.rol;

  const avatarHTML = u.avatar_url
    ? `<img src="${u.avatar_url}" alt="${u.nombre}"
         style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid ${rolColor}30;"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <span style="display:none;width:72px;height:72px;border-radius:50%;background:${rolColor}15;color:${rolColor};font-size:1.3rem;font-weight:700;align-items:center;justify-content:center;">${iniciales}</span>`
    : `<span style="display:inline-flex;width:72px;height:72px;border-radius:50%;background:${rolColor}15;color:${rolColor};font-size:1.3rem;font-weight:700;align-items:center;justify-content:center;">${iniciales}</span>`;

  const fechaReg = u.created_at
    ? new Date(u.created_at).toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' })
    : '—';
  const numId = u.numero_identificacion || '—';

  document.getElementById('info-usuario-contenido').innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid #f1f5f9;">
      ${avatarHTML}
      <div>
        <strong style="font-size:1.05rem;color:#0f172a;display:block;margin-bottom:4px;">${u.nombre}</strong>
        <span style="background:${rolColor}15;color:${rolColor};border:1px solid ${rolColor}30;padding:3px 12px;border-radius:99px;font-size:0.72rem;font-weight:700;">${rolLabel}</span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:1rem;flex-shrink:0;width:22px;">✉️</span>
        <div style="min-width:0;">
          <p style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin:0 0 2px;">Correo</p>
          <p style="font-size:0.88rem;color:#334155;margin:0;word-break:break-all;">${u.email}</p>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:1rem;flex-shrink:0;width:22px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.19 15.1 19.79 19.79 0 0 1 2.12 22 2 2 0 0 1 0 19.82V16.92a2 2 0 0 1 1.64-2l4.16-.73A2 2 0 0 1 8 15.59l1.87 1.87a16 16 0 0 0 6.07-6.07L14.07 9.5a2 2 0 0 1-.3-2.2l.73-4.16A2 2 0 0 1 16.5 1.5h3a2 2 0 0 1 2 2.18 19.79 19.79 0 0 1-3.07 8.63"/></svg></span></span>
        <div>
          <p style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin:0 0 2px;">Teléfono</p>
          <p style="font-size:0.88rem;color:#334155;margin:0;">${u.telefono || '—'}</p>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:1rem;flex-shrink:0;width:22px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span></span>
        <div>
          <p style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin:0 0 2px;">Fecha de registro</p>
          <p style="font-size:0.88rem;color:#334155;margin:0;">${fechaReg}</p>
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <span style="font-size:1rem;flex-shrink:0;width:22px;">🆔</span>
        <div>
          <p style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin:0 0 2px;">N° Identificación</p>
          <code style="font-size:0.78rem;color:#475569;background:#f1f5f9;padding:3px 8px;border-radius:5px;letter-spacing:.05em;">${numId}</code>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal-info-usuario').classList.add('abierto');
}
