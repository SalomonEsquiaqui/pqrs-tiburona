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
    container.innerHTML = '<div class="vacio-mensaje"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Sin asignaciones activas. ¡Buen trabajo!</div>';
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
              · <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span> ${pqrs.users?.nombre || '—'}
            </div>
          </div>
          <span class="badge prioridad-${a.prioridad}">${a.prioridad}</span>
        </div>
        <p class="pqrs-desc">${(pqrs.descripcion||'').substring(0,130)}${pqrs.descripcion?.length>130?'…':''}</p>
        <div class="timer-wrap">
          <span><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> Tiempo restante:</span>
          <span class="timer-display ${vencido?'urgente':horas<6?'urgente':'ok'}" id="timer-${a.id}">
            ${vencido ? '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span> VENCIDO' : formatTiempo(horas * 3600 * 1000)}
          </span>
        </div>
        <div class="barra-tiempo">
          <div class="barra-tiempo-fill ${pct>90?'urgente':pct>60?'medio':''}" id="barra-${a.id}" style="width:${pct}%"></div>
        </div>
        <div class="card-acciones">
          <button class="btn btn-primario btn-sm" onclick="abrirResponder('${a.id}')"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> Responder</button>
          <button class="btn btn-sm" style="background:var(--gris-medio);color:#555;"
            onclick="verDetalleSoporte('${a.id}')"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span> Detalle</button>
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
        el.textContent = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span> VENCIDO';
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
      <h4><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span> PQRS próxima a vencer</h4>
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
    mostrarMensaje('msg-responder', 'Respuesta guardada.', 'exito');
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
    .from('respuestas').select('*, users(nombre,rol)').eq('pqrs_id', pqrs.id).order('created_at');

  document.getElementById('detalle-soporte-contenido').innerHTML = `
    <div class="detalle-header">
      <div><strong>Radicado</strong><br><code class="cod-radicado">${pqrs.radicado}</code></div>
      <div><strong>Estado</strong><br><span class="estado estado-${pqrs.estado.replace('_','-')}">${pqrs.estado.replace('_',' ')}</span></div>
      <div><strong>Prioridad</strong><br><span class="badge prioridad-${a.prioridad}">${a.prioridad}</span></div>
    </div>
    <div class="detalle-campo"><strong>Asunto</strong><p>${pqrs.asunto}</p></div>
    <div class="detalle-campo"><strong>Área</strong><p>${pqrs.area||'—'}</p></div>
    <div class="detalle-campo"><strong>Descripción</strong><p style="white-space:pre-wrap;line-height:1.6;">${pqrs.descripcion}</p></div>
    ${renderAdjunto(pqrs.imagen_url)}
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--gris-medio);">
    <h4 style="margin-bottom:10px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span> Historial de respuestas</h4>
    ${respuestas?.length
      ? respuestas.map(r => {
          const esAdmin = r.users?.rol === 'admin';
          if (esAdmin) return `<div style="margin-bottom:10px;background:linear-gradient(135deg,#f0f4ff,#e8f0fe);border:1px solid #c7d7fe;border-radius:12px;padding:11px 13px;border-left:4px solid #6366f1;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;gap:8px;flex-wrap:wrap;"><strong style="font-size:0.8rem;color:#4338ca;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="5" y1="20" x2="19" y2="20"/></svg></span> ${r.users?.nombre||'Admin'} <span style="font-size:0.67rem;background:#e0e7ff;color:#6366f1;padding:1px 7px;border-radius:99px;">Admin</span></strong><span style="font-size:0.72rem;color:#94a3b8;">${formatFecha(r.created_at)}</span></div><p style="margin:0;font-size:0.86rem;line-height:1.5;color:#1e293b;white-space:pre-wrap;">${r.contenido}</p></div>`;
          return `<div class="respuesta-item"><div class="respuesta-header"><strong>${r.users?.nombre||'Soporte'}</strong><span>${formatFecha(r.created_at)}</span></div><p>${r.contenido}</p></div>`;
        }).join('')
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
  if (window.innerWidth <= 768) {
    _renderResueltasMobile(data || []);
  } else {
    const tablaWrap = tbody.closest('.tabla-wrap');
    tablaWrap.style.display = '';
    const cards = document.getElementById('cards-mobile-resueltas');
    if (cards) cards.style.display = 'none';
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
}

function _renderResueltasMobile(data) {
  const tbody = document.getElementById('tabla-resueltas');
  const tablaWrap = tbody.closest('.tabla-wrap');
  tablaWrap.style.display = 'none';

  let cardsWrap = document.getElementById('cards-mobile-resueltas');
  if (!cardsWrap) {
    cardsWrap = document.createElement('div');
    cardsWrap.id = 'cards-mobile-resueltas';
    cardsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    tablaWrap.parentNode.insertBefore(cardsWrap, tablaWrap);
  }
  cardsWrap.style.display = 'flex';

  const iconos = {peticion:`<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></span>`,queja:`<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>`,reclamo:`<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>`,sugerencia:`<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg></span>`,felicitacion:`<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>`};

  if (!data.length) {
    cardsWrap.innerHTML = `
      <div style="text-align:center;padding:40px 20px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;">
        <span style="font-size:2rem;display:block;margin-bottom:10px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span></span>
        <p style="color:#94a3b8;font-size:0.9rem;">Sin PQRS resueltas aún.</p>
      </div>`;
    return;
  }
  cardsWrap.innerHTML = data.map(p => `
    <div style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(15,23,42,.08);border:1px solid #e2e8f0;border-left:4px solid #059669;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">
        <code style="font-size:0.7rem;background:#f1f5f9;padding:2px 7px;border-radius:5px;color:#475569;font-weight:700;">${p.radicado}</code>
        <span style="background:#05966918;color:#059669;border:1px solid #05966940;padding:3px 10px;border-radius:99px;font-size:0.68rem;font-weight:700;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> resuelto</span>
      </div>
      <p style="font-weight:600;color:#0f172a;font-size:0.88rem;margin-bottom:6px;line-height:1.3;">${p.asunto}</p>
      <p style="font-size:0.78rem;color:#64748b;">${iconos[p.tipo]||`<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span>`} ${p.tipo} &nbsp;·&nbsp; <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span> ${formatFecha(p.updated_at)}</p>
    </div>`).join('');
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function mostrarSeccionSoporte(id, btn) {
  document.querySelectorAll('section[id^="sec-"]').forEach(s => s.style.display='none');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
  document.getElementById(`sec-${id}`).style.display = 'block';
  if (btn) btn.classList.add('activo');
  if (id === 'perfil') initPerfil();
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
      <h4><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> Alertas SLA ${noLeidas > 0 ? `<span style="background:rgba(255,255,255,.25);border-radius:10px;padding:1px 7px;font-size:.7rem;">${noLeidas}</span>` : ''}</h4>
      <button onclick="marcarLeidasSoporte()">Marcar leídas</button>
    </div>
    <div class="notif-list">
      ${lista.length === 0
        ? `<div class="notif-vacio"><span class="notif-vacio-icon"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span></span>Sin alertas activas</div>`
        : lista.map(n => `
            <div class="notif-item ${n.leida ? '' : 'no-leida'} ${n.urgente ? 'notif-urgente' : ''}"
                 data-id="${n.id}" onclick="clickNotifSoporte('${n.id}', '${n.asignacionId || ''}')">
              <div class="notif-icono">${n.icono || `<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>`}</div>
              <div class="notif-body">
                <div class="notif-titulo">${n.titulo}</div>
                <div class="notif-desc">${n.desc}</div>
                ${n.tiempoRestante ? `<div class="notif-sla-badge"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> ${n.tiempoRestante}</div>` : ''}
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
        titulo: 'PQRS VENCIDA',
        desc: `${pqrs?.radicado} — ${pqrs?.asunto}`,
        icono: `<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="3"/><path d="M12 2v4"/><path d="M4.22 10.22l2.83 2.83"/><path d="M2 18h20"/><path d="M19.78 10.22l-2.83 2.83"/></svg></span>`,
        urgente: true,
        tipo: 'vencido',
        tiempoRestante: 'VENCIDA',
        pqrsId: pqrs?.id,
        asignacionId: a.id
      });
      mostrarToast('PQRS Vencida', `${pqrs?.radicado} — Atención inmediata requerida`, 'urgente');
    } else if (horas <= 2) {
      agregarNotifSoporte({
        titulo: 'Vence en menos de 2 horas',
        desc: `${pqrs?.radicado} — ${pqrs?.asunto}`,
        icono: `<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>`,
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
      <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
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
// ── VIEWER MULTIMEDIA (soporte) ──

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
