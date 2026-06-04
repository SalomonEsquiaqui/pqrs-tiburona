/* ===== MANTENIMIENTO.JS ===== */

let usuarioMant = null;
let todosReportes = [];
let editTimerInterval = null;

// ── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const sesion = JSON.parse(localStorage.getItem('sesion') || 'null');
  if (!sesion || sesion.rol !== 'mantenimiento') {
    cerrarSesionLocal();
    return;
  }
  usuarioMant = sesion;
  document.getElementById('nombre-mant').textContent = sesion.nombre || 'Usuario';

  await cargarTodosReportes();
  actualizarStats();
});

// ── NAVEGACIÓN ───────────────────────────────────────────────────────────────
function mostrarSeccion(id, btnEl) {
  const secciones = ['todos', 'mis-reportes', 'perfil'];
  secciones.forEach(s => {
    const el = document.getElementById('sec-' + s);
    if (el) el.style.display = (s === id) ? '' : 'none';
  });

  // actualizar activo sidebar
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(b => b.classList.remove('activo'));
  if (btnEl) btnEl.classList.add('activo');

  if (id === 'todos') {
    renderReportes('lista-todos', todosReportes, false);
  } else if (id === 'mis-reportes') {
    const mis = todosReportes.filter(r => r.autor_id === usuarioMant.id);
    renderReportes('lista-mis', mis, true);
  } else if (id === 'perfil') {
    if (typeof cargarPerfil === 'function') cargarPerfil();
  }
}

// ── CARGAR REPORTES ──────────────────────────────────────────────────────────
async function cargarTodosReportes() {
  try {
    const data = await apiFetch('/reportes');
    todosReportes = Array.isArray(data) ? data : [];
    renderReportes('lista-todos', todosReportes, false);
    actualizarStats();
  } catch (e) {
    document.getElementById('lista-todos').innerHTML = `<div class="empty-state"><p style="color:#ef4444">Error al cargar reportes.</p></div>`;
  }
}

// ── RENDER CARDS ─────────────────────────────────────────────────────────────
function renderReportes(contenedorId, lista, esPropio) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;

  if (!lista || lista.length === 0) {
    cont.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h3>${esPropio ? 'Aún no has publicado reportes' : 'No hay reportes publicados'}</h3>
        <p>${esPropio ? 'Crea tu primer reporte de novedad.' : 'Los reportes del equipo aparecerán aquí.'}</p>
      </div>`;
    return;
  }

  cont.innerHTML = lista.map((r, i) => buildCard(r, i)).join('');
}

function buildCard(r, idx) {
  const esPropio = r.autor_id === usuarioMant?.id;
  const fecha = formatFecha(r.created_at);
  const iniciales = (r.autor_nombre || '??').split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
  const puedeEditar = esPropio && puedeAunEditar(r.created_at);
  const delay = (idx % 6) * 0.05;

  const imgHTML = r.foto_url
    ? `<img class="reporte-card-img" src="${r.foto_url}" alt="${r.titulo}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=reporte-card-img-placeholder><svg xmlns=http://www.w3.org/2000/svg viewBox=0 0 24 24 fill=none stroke=currentColor stroke-width=1.5><rect x=3 y=3 width=18 height=18 rx=2/><circle cx=8.5 cy=8.5 r=1.5/><polyline points=21,15,16,10,5,21/></svg><span>Sin imagen</span></div>'">`
    : `<div class="reporte-card-img-placeholder">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span style="font-size:0.7rem;">Sin imagen</span>
       </div>`;

  const chipHTML = esPropio ? `<span class="reporte-chip chip-propio">Mi reporte</span>` : '';
  const areaHTML = r.area ? `<span style="background:#f1f5f9;color:#64748b;font-size:0.68rem;font-weight:600;padding:2px 8px;border-radius:20px;">${r.area}</span>` : '';

  const editBtn = puedeEditar
    ? `<button class="btn-reporte editar" onclick="abrirModalEditar('${r.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar
       </button>`
    : '';

  return `
    <div class="reporte-card" style="animation-delay:${delay}s;" data-id="${r.id}">
      ${imgHTML}
      <div class="reporte-card-body">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${chipHTML}${areaHTML}</div>
        <div class="reporte-card-title">${r.titulo}</div>
        <div class="reporte-card-desc">${r.descripcion || ''}</div>
        <div class="reporte-card-meta">
          <div class="reporte-card-author">
            <div class="avatar-mini">
              ${r.autor_avatar ? `<img src="${r.autor_avatar}" alt="">` : iniciales}
            </div>
            <span>${r.autor_nombre || 'Desconocido'}</span>
          </div>
          <span>${fecha}</span>
        </div>
        <div class="reporte-card-actions">
          <button class="btn-reporte ver" onclick="verReporte('${r.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Ver detalle
          </button>
          ${editBtn}
        </div>
      </div>
    </div>`;
}

// ── STATS ────────────────────────────────────────────────────────────────────
function actualizarStats() {
  const total = todosReportes.length;
  const mis = todosReportes.filter(r => r.autor_id === usuarioMant?.id).length;
  const hoy = todosReportes.filter(r => {
    const d = new Date(r.created_at);
    const n = new Date();
    return d.getDate()===n.getDate() && d.getMonth()===n.getMonth() && d.getFullYear()===n.getFullYear();
  }).length;
  animNum('stat-total', total);
  animNum('stat-mis', mis);
  animNum('stat-hoy', hoy);
}

function animNum(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  let cur = 0;
  const step = Math.ceil(val / 20);
  const t = setInterval(() => {
    cur = Math.min(cur + step, val);
    el.textContent = cur;
    if (cur >= val) clearInterval(t);
  }, 40);
}

// ── MODAL NUEVO REPORTE ───────────────────────────────────────────────────────
function abrirModalNuevo() {
  document.getElementById('modal-reporte-titulo').textContent = 'Nuevo reporte';
  document.getElementById('reporte-edit-id').value = '';
  document.getElementById('reporte-titulo').value = '';
  document.getElementById('reporte-descripcion').value = '';
  document.getElementById('reporte-area').value = '';
  document.getElementById('reporte-foto').value = '';
  document.getElementById('foto-preview').classList.remove('visible');
  document.getElementById('foto-url-actual').style.display = 'none';
  document.getElementById('edit-timer-container').style.display = 'none';
  document.getElementById('btn-guardar-reporte').textContent = ''; // reset
  document.getElementById('btn-guardar-reporte').innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
    Publicar reporte`;
  limpiarMensaje('msg-reporte');
  if (editTimerInterval) { clearInterval(editTimerInterval); editTimerInterval = null; }
  document.getElementById('modal-nuevo-reporte').classList.add('abierto');
  setTimeout(() => document.getElementById('reporte-titulo').focus(), 300);
}

function cerrarModalNuevo() {
  document.getElementById('modal-nuevo-reporte').classList.remove('abierto');
  if (editTimerInterval) { clearInterval(editTimerInterval); editTimerInterval = null; }
}

// ── MODAL EDITAR ─────────────────────────────────────────────────────────────
async function abrirModalEditar(reporteId) {
  const r = todosReportes.find(x => x.id === reporteId);
  if (!r) return;

  const segsRestantes = tiempoRestante(r.created_at);
  if (segsRestantes <= 0) {
    mostrarToastMant('El tiempo de edición ha expirado.', 'error');
    return;
  }

  document.getElementById('modal-reporte-titulo').textContent = 'Editar reporte';
  document.getElementById('reporte-edit-id').value = r.id;
  document.getElementById('reporte-titulo').value = r.titulo || '';
  document.getElementById('reporte-descripcion').value = r.descripcion || '';
  document.getElementById('reporte-area').value = r.area || '';
  document.getElementById('reporte-foto').value = '';

  const preview = document.getElementById('foto-preview');
  if (r.foto_url) {
    preview.src = r.foto_url;
    preview.classList.add('visible');
  } else {
    preview.classList.remove('visible');
  }

  document.getElementById('foto-url-actual').textContent = r.foto_url || '';
  document.getElementById('foto-url-actual').style.display = 'none';

  document.getElementById('btn-guardar-reporte').innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
    Guardar cambios`;

  // Timer
  document.getElementById('edit-timer-container').style.display = '';
  limpiarMensaje('msg-reporte');
  iniciarTimer(segsRestantes);

  document.getElementById('modal-nuevo-reporte').classList.add('abierto');
  setTimeout(() => document.getElementById('reporte-titulo').focus(), 300);
}

function iniciarTimer(segs) {
  if (editTimerInterval) clearInterval(editTimerInterval);
  let restante = segs;
  actualizarTimerUI(restante);
  editTimerInterval = setInterval(() => {
    restante--;
    actualizarTimerUI(restante);
    if (restante <= 0) {
      clearInterval(editTimerInterval);
      editTimerInterval = null;
      cerrarModalNuevo();
      mostrarToastMant('El tiempo de edición expiró.', 'error');
    }
  }, 1000);
}

function actualizarTimerUI(segs) {
  const num = document.getElementById('edit-timer-num');
  const timer = document.getElementById('edit-timer');
  if (!num || !timer) return;
  const m = Math.floor(segs / 60);
  const s = segs % 60;
  num.textContent = `${m}:${String(s).padStart(2,'0')}`;
  if (segs <= 30) timer.classList.add('urgente');
  else timer.classList.remove('urgente');
}

function tiempoRestante(createdAt) {
  const limite = 2 * 60 * 1000; // 2 minutos
  const diff = Date.now() - new Date(createdAt).getTime();
  return Math.floor((limite - diff) / 1000);
}

function puedeAunEditar(createdAt) {
  return tiempoRestante(createdAt) > 0;
}

// ── GUARDAR REPORTE ───────────────────────────────────────────────────────────
async function guardarReporte() {
  const titulo = document.getElementById('reporte-titulo').value.trim();
  const descripcion = document.getElementById('reporte-descripcion').value.trim();
  const area = document.getElementById('reporte-area').value;
  const fotoFile = document.getElementById('reporte-foto').files[0];
  const editId = document.getElementById('reporte-edit-id').value;

  if (!titulo) { mostrarMensaje('msg-reporte', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;width:15px;height:15px;vertical-align:middle;margin-right:5px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> El título es obligatorio.', 'error'); return; }
  if (!descripcion) { mostrarMensaje('msg-reporte', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;width:15px;height:15px;vertical-align:middle;margin-right:5px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> La descripción es obligatoria.', 'error'); return; }

  const btn = document.getElementById('btn-guardar-reporte');
  btn.disabled = true;
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;animation:spinLoader 0.8s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Guardando...`;

  try {
    let foto_url = document.getElementById('foto-url-actual').textContent || null;

    // Subir foto si hay nueva
    if (fotoFile) {
      if (fotoFile.size > 3 * 1024 * 1024) {
        mostrarMensaje('msg-reporte', 'La imagen no debe superar 3 MB.', 'error');
        btn.disabled = false;
        btn.innerHTML = editId ? 'Guardar cambios' : 'Publicar reporte';
        return;
      }
      const fotoData = await subirFoto(fotoFile);
      if (fotoData) foto_url = fotoData;
    }

    const payload = { titulo, descripcion, area, foto_url };

    if (editId) {
      await apiFetch(`/reportes/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/reportes', { method: 'POST', body: JSON.stringify(payload) });
    }

    cerrarModalNuevo();
    await cargarTodosReportes();
    mostrarToastMant(editId ? 'Reporte actualizado correctamente.' : 'Reporte publicado exitosamente.', 'exito');

    // Refrescar sección activa
    const secMis = document.getElementById('sec-mis-reportes');
    if (secMis && secMis.style.display !== 'none') {
      const mis = todosReportes.filter(r => r.autor_id === usuarioMant?.id);
      renderReportes('lista-mis', mis, true);
    }

  } catch (err) {
    mostrarMensaje('msg-reporte', 'Error al guardar: ' + (err.message || 'Inténtalo de nuevo.'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = editId
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/></svg> Guardar cambios`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/></svg> Publicar reporte`;
  }
}

// ── SUBIR FOTO A SUPABASE STORAGE ─────────────────────────────────────────────
async function subirFoto(file) {
  const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const ext = file.name.split('.').pop();
  const nombre = `reportes/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await db.storage.from('avatars').upload(nombre, file, { upsert: true });
  if (error) throw new Error('Error al subir imagen: ' + error.message);
  const { data: urlData } = db.storage.from('avatars').getPublicUrl(nombre);
  return urlData?.publicUrl || null;
}

// ── VER REPORTE ───────────────────────────────────────────────────────────────
function verReporte(id) {
  const r = todosReportes.find(x => x.id === id);
  if (!r) return;

  const iniciales = (r.autor_nombre || '??').split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
  const esPropio = r.autor_id === usuarioMant?.id;
  const puedeEdit = esPropio && puedeAunEditar(r.created_at);

  const imgHTML = r.foto_url
    ? `<img class="modal-ver-img" src="${r.foto_url}" alt="${r.titulo}">`
    : `<div style="width:100%;height:180px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);display:flex;align-items:center;justify-content:center;border-radius:20px 20px 0 0;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
       </div>`;

  document.getElementById('modal-ver-contenido').innerHTML = `
    ${imgHTML}
    <div class="modal-ver-body">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
        <h2>${r.titulo}</h2>
        <button onclick="cerrarModalVer()" style="flex-shrink:0;width:32px;height:32px;border-radius:50%;border:none;background:#f1f5f9;color:#475569;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;">×</button>
      </div>
      <div class="modal-ver-meta">
        <div class="modal-ver-meta-item">
          <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:800;color:#fff;overflow:hidden;flex-shrink:0;">
            ${r.autor_avatar ? `<img src="${r.autor_avatar}" style="width:100%;height:100%;object-fit:cover;" alt="">` : iniciales}
          </div>
          <span>${r.autor_nombre || 'Desconocido'}</span>
        </div>
        ${r.area ? `<div class="modal-ver-meta-item"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>${r.area}</span></div>` : ''}
        <div class="modal-ver-meta-item">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>${formatFecha(r.created_at)}</span>
        </div>
      </div>
      <p>${r.descripcion || ''}</p>
      ${puedeEdit ? `
        <button onclick="cerrarModalVer(); abrirModalEditar('${r.id}')" style="width:100%;padding:10px;background:rgba(245,158,11,0.1);color:#d97706;border:2px solid rgba(245,158,11,0.3);border-radius:10px;font-size:0.85rem;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar (tiempo disponible)
        </button>` : ''}
    </div>`;

  document.getElementById('modal-ver-reporte').classList.add('abierto');
}

function cerrarModalVer() {
  document.getElementById('modal-ver-reporte').classList.remove('abierto');
}

// Cerrar modales al hacer clic fuera
document.addEventListener('click', e => {
  const mNuevo = document.getElementById('modal-nuevo-reporte');
  const mVer   = document.getElementById('modal-ver-reporte');
  if (e.target === mNuevo) cerrarModalNuevo();
  if (e.target === mVer)   cerrarModalVer();
});

// ── PREVISUALIZAR FOTO ────────────────────────────────────────────────────────
function previsualizarFoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('foto-preview');
    img.src = e.target.result;
    img.classList.add('visible');
  };
  reader.readAsDataURL(file);
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function formatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function mostrarToastMant(msg, tipo = 'exito') {
  const t = document.getElementById('mant-toast');
  if (!t) return;
  const icon = tipo === 'exito'
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  t.innerHTML = icon + msg;
  t.className = `mant-toast ${tipo} visible`;
  setTimeout(() => t.classList.remove('visible'), 3500);
}

function limpiarMensaje(id) {
  const el = document.getElementById(id);
  if (el) { el.className = 'mensaje'; el.innerHTML = ''; }
}
