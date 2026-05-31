// ===== PANEL SOPORTE =====
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let sesionSoporte       = null;
let asignacionesActivas = [];
let timers              = {};
let pqrsRespondiendo    = null;

document.addEventListener('DOMContentLoaded', async () => {
  sesionSoporte = await verificarSesion(db);
  if (!sesionSoporte) return;

  const { data: perfil } = await db.from('users').select('nombre,rol').eq('id', sesionSoporte.user.id).single();
  if (!perfil || perfil.rol !== 'soporte') { window.location.href = '/pages/index.html'; return; }

  document.getElementById('nombre-soporte').textContent = perfil.nombre;

  await Promise.all([cargarAsignaciones(), cargarResueltas()]);

  // Iniciar campana de notificaciones SLA
  initNotifSoporte();

  // Realtime — recibir nuevas asignaciones
  db.channel('soporte-asignaciones')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'asignaciones',
        filter: `soporte_id=eq.${sesionSoporte.user.id}` },
      () => cargarAsignaciones())
    .subscribe();
});

// ── CARGAR ASIGNACIONES ───────────────────────────────────────────────────────
async function cargarAsignaciones() {
  const { data } = await db
    .from('asignaciones')
    .select('*, pqrs(*, users!pqrs_usuario_id_fkey(nombre,email))')
    .eq('soporte_id', sesionSoporte.user.id)
    .eq('estado', 'activo')
    .order('vencimiento');

  asignacionesActivas = data || [];

  const urgentes = asignacionesActivas.filter(a => {
    const h = horasRestantes(a.vencimiento);
    return h > 0 && h < 6;
  }).length;

  document.getElementById('s-activas').textContent   = asignacionesActivas.length;
  document.getElementById('s-urgentes').textContent  = urgentes;
  document.getElementById('badge-pendientes').textContent = asignacionesActivas.length;

  renderAsignadas();
  iniciarTimers();
  mostrarAlertasUrgentes();
  // Generar notificaciones SLA
  setTimeout(generarNotifSLA, 300);
}

// ── RENDER TARJETAS ───────────────────────────────────────────────────────────
function renderAsignadas() {
  const container = document.getElementById('lista-asignadas');
  if (!asignacionesActivas.length) {
    container.innerHTML = '<div class="vacio-mensaje">✅ Sin asignaciones activas. ¡Buen trabajo!</div>';
    return;
  }

  container.innerHTML = asignacionesActivas.map(a => {
    const pqrs    = a.pqrs;
    const horas   = horasRestantes(a.vencimiento);
    const vencido = horas <= 0;
    const pct     = Math.min(100, Math.max(0, ((a.sla_horas - Math.max(0, horas)) / a.sla_horas) * 100));
    const claseCard = vencido ? 'vencido' : (horas < 6 ? 'urgente' : '');

    return `
      <div class="pqrs-soporte-card ${claseCard}" id="card-${a.id}">
        <div class="card-top">
          <div>
            <div class="pqrs-titulo">${pqrs.asunto}</div>
            <div class="pqrs-meta">
              ${pqrs.radicado} · <span class="badge badge-tipo-${pqrs.tipo}">${pqrs.tipo}</span>
              · 👤 ${pqrs.users?.nombre || '—'}
            </div>
          </div>
          <span class="badge prioridad-${a.prioridad}">${a.prioridad}</span>
        </div>
        <p class="pqrs-desc">${(pqrs.descripcion||'').substring(0,130)}${pqrs.descripcion?.length>130?'…':''}</p>
        <div class="timer-wrap">
          <span>⏱ Tiempo restante:</span>
          <span class="timer-display ${vencido?'urgente':horas<6?'urgente':'ok'}" id="timer-${a.id}">
            ${vencido ? '⚠️ VENCIDO' : formatTiempo(horas * 3600 * 1000)}
          </span>
        </div>
        <div class="barra-tiempo">
          <div class="barra-tiempo-fill ${pct>90?'urgente':pct>60?'medio':''}" id="barra-${a.id}" style="width:${pct}%"></div>
        </div>
        <div class="card-acciones">
          <button class="btn btn-primario btn-sm" onclick="abrirResponder('${a.id}')">✏️ Responder</button>
          <button class="btn btn-sm" style="background:var(--gris-medio);color:#555;"
            onclick="verDetalleSoporte('${a.id}')">📋 Detalle</button>
        </div>
      </div>`;
  }).join('');
}

// ── TIMERS ────────────────────────────────────────────────────────────────────
function iniciarTimers() {
  Object.values(timers).forEach(clearInterval);
  timers = {};

  asignacionesActivas.forEach(a => {
    const venc = new Date(a.vencimiento);
    timers[a.id] = setInterval(() => {
      const restante = venc - Date.now();
      const el    = document.getElementById(`timer-${a.id}`);
      const barra = document.getElementById(`barra-${a.id}`);
      if (!el) { clearInterval(timers[a.id]); return; }

      if (restante <= 0) {
        el.textContent = '⚠️ VENCIDO';
        el.className = 'timer-display urgente';
        if (barra) { barra.style.width = '100%'; barra.className = 'barra-tiempo-fill urgente'; }
        clearInterval(timers[a.id]);
        return;
      }

      el.textContent = formatTiempo(restante);
      const pct = Math.min(100, ((a.sla_horas * 3600000 - restante) / (a.sla_horas * 3600000)) * 100);
      if (barra) {
        barra.style.width = pct + '%';
        barra.className = 'barra-tiempo-fill ' + (pct > 90 ? 'urgente' : pct > 60 ? 'medio' : '');
      }
      const horasR = restante / 3600000;
      el.className = 'timer-display ' + (horasR < 6 ? 'urgente' : 'ok');
    }, 1000);
  });
}

// ── ALERTAS FLOTANTES ─────────────────────────────────────────────────────────
function mostrarAlertasUrgentes() {
  const container = document.getElementById('alertas-container');
  const urgentes = asignacionesActivas.filter(a => {
    const h = horasRestantes(a.vencimiento);
    return h > 0 && h < 6;
  });
  if (!urgentes.length) { container.innerHTML = ''; return; }
  container.innerHTML = urgentes.slice(0,2).map(a => `
    <div class="alerta-card urgente">
      <h4>⚠️ PQRS próxima a vencer</h4>
      <p>${a.pqrs?.asunto} · ${a.pqrs?.radicado}</p>
      <span class="timer-display urgente">${horasRestantes(a.vencimiento).toFixed(1)}h restantes</span>
      <button class="btn btn-sm btn-peligro" onclick="abrirResponder('${a.id}')" style="margin-top:8px;width:100%;">
        Resolver ahora
      </button>
    </div>`).join('');
  setTimeout(() => { container.innerHTML = ''; }, 9000);
}

// ── MODAL RESPONDER ───────────────────────────────────────────────────────────
async function abrirResponder(asignacionId) {
  const a = asignacionesActivas.find(x => x.id === asignacionId);
  if (!a) return;
  pqrsRespondiendo = a;
  const pqrs = a.pqrs;
  document.getElementById('detalle-pqrs-soporte').innerHTML = `
    <strong>${pqrs.radicado}</strong> · <span class="badge badge-tipo-${pqrs.tipo}">${pqrs.tipo}</span><br>
    <strong>${pqrs.asunto}</strong><br>
    <span style="color:#666;font-size:0.85rem;">${pqrs.descripcion}</span><br>
    <small style="color:#aaa;">Área: ${pqrs.area||'—'} · Usuario: ${pqrs.users?.nombre||'—'}</small>
  `;
  document.getElementById('respuesta-texto').value = '';
  document.getElementById('nuevo-estado').value    = 'en_proceso';
  ocultarMensaje('msg-responder');
  document.getElementById('modal-responder').classList.add('abierto');
}

async function enviarRespuesta() {
  if (!pqrsRespondiendo) return;
  const contenido    = document.getElementById('respuesta-texto').value.trim();
  const nuevoEstado  = document.getElementById('nuevo-estado').value;
  if (!contenido) { mostrarMensaje('msg-responder', 'Escribe una respuesta.', 'error'); return; }

  try {
    await apiFetch(`/pqrs/${pqrsRespondiendo.pqrs.id}/responder`, {
      method: 'POST',
      body: JSON.stringify({ soporte_id: sesionSoporte.user.id, contenido, nuevo_estado: nuevoEstado })
    });
    mostrarMensaje('msg-responder', '✅ Respuesta guardada.', 'exito');
    setTimeout(() => cerrarModal('modal-responder'), 1200);
    await Promise.all([cargarAsignaciones(), cargarResueltas()]);
  } catch (err) {
    mostrarMensaje('msg-responder', err.message, 'error');
  }
}

// ── VER DETALLE ───────────────────────────────────────────────────────────────
async function verDetalleSoporte(asignacionId) {
  const a    = asignacionesActivas.find(x => x.id === asignacionId);
  if (!a) return;
  const pqrs = a.pqrs;
  const { data: respuestas } = await db
    .from('respuestas').select('*, users(nombre)').eq('pqrs_id', pqrs.id).order('created_at');

  document.getElementById('detalle-soporte-contenido').innerHTML = `
    <div class="detalle-header">
      <div><strong>Radicado</strong><br><code class="cod-radicado">${pqrs.radicado}</code></div>
      <div><strong>Estado</strong><br><span class="estado estado-${pqrs.estado.replace('_','-')}">${pqrs.estado.replace('_',' ')}</span></div>
      <div><strong>Prioridad</strong><br><span class="badge prioridad-${a.prioridad}">${a.prioridad}</span></div>
    </div>
    <div class="detalle-campo"><strong>Asunto</strong><p>${pqrs.asunto}</p></div>
    <div class="detalle-campo"><strong>Descripción</strong><p style="white-space:pre-wrap;">${pqrs.descripcion}</p></div>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--gris-medio);">
    <h4 style="margin-bottom:10px;">💬 Historial de respuestas</h4>
    ${respuestas?.length
      ? respuestas.map(r=>`<div class="respuesta-item"><div class="respuesta-header"><strong>${r.users?.nombre||'Soporte'}</strong><span>${formatFecha(r.created_at)}</span></div><p>${r.contenido}</p></div>`).join('')
      : '<p style="color:#bbb;font-size:0.85rem;">Sin respuestas aún.</p>'}
  `;
  document.getElementById('modal-detalle-soporte').classList.add('abierto');
}

// ── RESUELTAS ─────────────────────────────────────────────────────────────────
async function cargarResueltas() {
  const { data } = await db
    .from('pqrs').select('*')
    .eq('soporte_id', sesionSoporte.user.id)
    .eq('estado', 'resuelto')
    .order('updated_at', { ascending: false });

  const hoy = new Date().toDateString();
  const hoyCount = (data||[]).filter(p => new Date(p.updated_at).toDateString() === hoy).length;
  document.getElementById('s-resueltas').textContent = hoyCount;

  const tbody = document.getElementById('tabla-resueltas');
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;">Sin resueltas aún.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(p => `
    <tr>
      <td><code class="cod-radicado">${p.radicado}</code></td>
      <td><span class="badge badge-tipo-${p.tipo}">${p.tipo}</span></td>
      <td>${p.asunto}</td>
      <td>${formatFecha(p.updated_at)}</td>
    </tr>`).join('');
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function mostrarSeccionSoporte(id, btn) {
  document.querySelectorAll('section[id^="sec-"]').forEach(s => s.style.display='none');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
  document.getElementById(`sec-${id}`).style.display = 'block';
  if (btn) btn.classList.add('activo');
}
function cerrarModal(id) { document.getElementById(id)?.classList.remove('abierto'); }
function cerrarSesionLocal() { cerrarSesion(db); }
// ── NOTIFICACIONES SOPORTE ────────────────────────────────────────────────────

const NOTIF_SOPORTE_KEY = 'pqrs_notif_soporte';

function cargarNotifSoporte() {
  try { return JSON.parse(localStorage.getItem(NOTIF_SOPORTE_KEY) || '[]'); }
  catch { return []; }
}

function guardarNotifSoporte(lista) {
  localStorage.setItem(NOTIF_SOPORTE_KEY, JSON.stringify(lista.slice(0, 40)));
}

function agregarNotifSoporte(notif) {
  const lista = cargarNotifSoporte();
  // Evitar duplicados por pqrsId
  const ya = lista.find(n => n.pqrsId === notif.pqrsId && n.tipo === notif.tipo);
  if (ya) return lista;
  lista.unshift({
    id: Date.now() + Math.random().toString(36).slice(2),
    leida: false,
    ts: new Date().toISOString(),
    ...notif
  });
  guardarNotifSoporte(lista);
  return lista;
}

function marcarTodasLeidasSoporte() {
  const lista = cargarNotifSoporte().map(n => ({ ...n, leida: true }));
  guardarNotifSoporte(lista);
  return lista;
}

function renderNotifSoporte() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const lista = cargarNotifSoporte();
  const noLeidas = lista.filter(n => !n.leida).length;

  panel.innerHTML = `
    <div class="notif-panel-header">
      <h4>⏱ Alertas SLA ${noLeidas > 0 ? `<span style="background:rgba(255,255,255,.25);border-radius:10px;padding:1px 7px;font-size:.7rem;">${noLeidas}</span>` : ''}</h4>
      <button onclick="marcarLeidasSoporte()">Marcar leídas</button>
    </div>
    <div class="notif-list">
      ${lista.length === 0
        ? `<div class="notif-vacio"><span class="notif-vacio-icon">✅</span>Sin alertas activas</div>`
        : lista.map(n => `
            <div class="notif-item ${n.leida ? '' : 'no-leida'} ${n.urgente ? 'notif-urgente' : ''}"
                 data-id="${n.id}" onclick="clickNotifSoporte('${n.id}', '${n.asignacionId || ''}')">
              <div class="notif-icono">${n.icono || '⚠️'}</div>
              <div class="notif-body">
                <div class="notif-titulo">${n.titulo}</div>
                <div class="notif-desc">${n.desc}</div>
                ${n.tiempoRestante ? `<div class="notif-sla-badge">⏱ ${n.tiempoRestante}</div>` : ''}
                <div class="notif-tiempo">${tiempoRelativoSoporte(n.ts)}</div>
              </div>
            </div>`).join('')
      }
    </div>
  `;

  // Actualizar dot
  const dot = document.querySelector('.notif-dot');
  if (dot) dot.classList.toggle('visible', noLeidas > 0);
}

function tiempoRelativoSoporte(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Ahora mismo';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

function marcarLeidasSoporte() {
  const lista = marcarTodasLeidasSoporte();
  renderNotifSoporte();
}

function clickNotifSoporte(id, asignacionId) {
  const lista = cargarNotifSoporte().map(n => n.id == id ? { ...n, leida: true } : n);
  guardarNotifSoporte(lista);
  renderNotifSoporte();
  if (asignacionId) {
    abrirResponder(asignacionId);
    document.getElementById('notif-panel')?.classList.remove('open');
  }
}

function toggleNotifPanelSoporte() {
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
    renderNotifSoporte();
    dingDong();
  }
  panel.classList.toggle('open', !isOpen);
}

// Generar notificaciones SLA basadas en asignaciones activas
function generarNotifSLA() {
  asignacionesActivas.forEach(a => {
    const horas = horasRestantes(a.vencimiento);
    const pqrs  = a.pqrs;

    if (horas <= 0) {
      agregarNotifSoporte({
        titulo: '🚨 PQRS VENCIDA',
        desc: `${pqrs?.radicado} — ${pqrs?.asunto}`,
        icono: '🚨',
        urgente: true,
        tipo: 'vencido',
        tiempoRestante: 'VENCIDA',
        pqrsId: pqrs?.id,
        asignacionId: a.id
      });
      mostrarToast('PQRS Vencida', `${pqrs?.radicado} — Atención inmediata requerida`, 'urgente');
    } else if (horas <= 2) {
      agregarNotifSoporte({
        titulo: '⚠️ Vence en menos de 2 horas',
        desc: `${pqrs?.radicado} — ${pqrs?.asunto}`,
        icono: '⚠️',
        urgente: true,
        tipo: '2h',
        tiempoRestante: `${horas.toFixed(1)}h restantes`,
        pqrsId: pqrs?.id,
        asignacionId: a.id
      });
      mostrarToast('Urgente — SLA crítico', `${pqrs?.radicado} vence en ${horas.toFixed(1)}h`, 'urgente', 8000);
    } else if (horas <= 6) {
      agregarNotifSoporte({
        titulo: '⏰ Vence pronto',
        desc: `${pqrs?.radicado} — ${pqrs?.asunto}`,
        icono: '⏰',
        urgente: false,
        tipo: '6h',
        tiempoRestante: `${horas.toFixed(1)}h restantes`,
        pqrsId: pqrs?.id,
        asignacionId: a.id
      });
    }
  });
  renderNotifSoporte();
}

// Inicializar campana soporte
function initNotifSoporte() {
  const cont = document.querySelector('.sidebar-user');
  if (!cont || document.getElementById('notif-panel')) return;
  const wrap = document.createElement('div');
  wrap.className = 'notif-bell-wrap';
  wrap.style.cssText = 'margin-top:12px;';
  wrap.innerHTML = `
    <button class="notif-bell-btn" onclick="toggleNotifPanelSoporte()" title="Alertas SLA">
      ⏱
      <span class="notif-dot" id="notif-dot"></span>
    </button>
    <div class="notif-panel" id="notif-panel"></div>
  `;
  // Insertar antes del botón de salir
  const btnSalir = cont.querySelector('.btn-peligro');
  if (btnSalir) cont.insertBefore(wrap, btnSalir);
  else cont.appendChild(wrap);

  // Cerrar al clic fuera
  document.addEventListener('click', e => {
    const panel = document.getElementById('notif-panel');
    if (!wrap.contains(e.target)) panel?.classList.remove('open');
  });
}

// ── RENDER MÓVIL: tabla resueltas → cards ──────────────────────────────────
const _cargarResueltasOriginal = cargarResueltas;
async function cargarResueltas() {
  await _cargarResueltasOriginal();
  if (window.innerWidth <= 768) _adaptarResueltasMobile();
}

function _adaptarResueltasMobile() {
  const tbody = document.getElementById('tabla-resueltas');
  if (!tbody) return;
  const tablaWrap = tbody.closest('.tabla-wrap');

  let cardsWrap = document.getElementById('cards-mobile-resueltas');
  if (!cardsWrap) {
    cardsWrap = document.createElement('div');
    cardsWrap.id = 'cards-mobile-resueltas';
    cardsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    tablaWrap.parentNode.insertBefore(cardsWrap, tablaWrap);
  }
  tablaWrap.style.display = 'none';

  const filas = [...tbody.querySelectorAll('tr')];
  if (!filas.length || tbody.textContent.includes('Sin resueltas')) {
    cardsWrap.innerHTML = `
      <div style="text-align:center;padding:40px 20px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;">
        <span style="font-size:2rem;display:block;margin-bottom:10px;">✅</span>
        <p style="color:#94a3b8;font-size:0.9rem;">Sin PQRS resueltas aún.</p>
      </div>`;
    return;
  }
  const iconos = { peticion:'📝', queja:'😤', reclamo:'⚡', sugerencia:'💡', felicitacion:'🌟' };
  cardsWrap.innerHTML = filas.map(tr => {
    const celdas = [...tr.querySelectorAll('td')];
    if (celdas.length < 4) return '';
    const radicado = celdas[0]?.textContent.trim();
    const tipo     = celdas[1]?.textContent.trim();
    const asunto   = celdas[2]?.textContent.trim();
    const fecha    = celdas[3]?.textContent.trim();
    return `
      <div style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(15,23,42,.08);border:1px solid #e2e8f0;border-left:4px solid #059669;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">
          <code style="font-size:0.7rem;background:#f1f5f9;padding:2px 7px;border-radius:5px;color:#475569;font-weight:700;">${radicado}</code>
          <span style="background:#05966918;color:#059669;border:1px solid #05966940;padding:3px 10px;border-radius:99px;font-size:0.68rem;font-weight:700;">✅ resuelto</span>
        </div>
        <p style="font-weight:600;color:#0f172a;font-size:0.88rem;margin-bottom:6px;">${asunto}</p>
        <p style="font-size:0.78rem;color:#64748b;">${iconos[tipo]||'📋'} ${tipo} &nbsp;·&nbsp; 📅 ${fecha}</p>
      </div>`;
  }).join('');
}
