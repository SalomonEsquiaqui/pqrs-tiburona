// ===== PANEL USUARIO — PQRS =====

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let sesionActual       = null;
let todasMisPqrs       = [];
let archivoAdjunto     = null;   // File seleccionado (cualquier tipo multimedia)
let tipoMediaActual    = 'imagen';
let pqrsIdParaValorar  = null;
let estrellaSeleccionada = 0;

document.addEventListener('DOMContentLoaded', async () => {
  sesionActual = await verificarSesion(db);
  if (!sesionActual) return;

  const { data: perfil } = await db
    .from('users').select('nombre,rol').eq('id', sesionActual.user.id).single();

  if (perfil) {
    document.getElementById('nombre-usuario').textContent = perfil.nombre;
    if (perfil.rol !== 'usuario') redirigirPorRol(perfil.rol);
  }

  await cargarMisPqrs();

  document.getElementById('filtro-estado').addEventListener('change', filtrarPqrs);
  document.getElementById('filtro-tipo').addEventListener('change', filtrarPqrs);
  document.getElementById('form-nueva-pqrs').addEventListener('submit', enviarPqrs);

  // Configurar upload multimedia
  configurarUploadMultimedia();

  // Suscripciones realtime para notificaciones
  suscribirCambiosEstado(sesionActual.user.id);
  suscribirRespuestasNuevas(sesionActual.user.id);
});

// ── BOTÓN REFRESCAR ──────────────────────────────────────────────────────────
async function refrescarDatos() {
  const btn = document.getElementById('btn-refrescar');
  if (btn) btn.classList.add('girando');
  await cargarMisPqrs();
  setTimeout(() => btn?.classList.remove('girando'), 700);
}

// ── CAMBIAR TIPO DE MEDIA (chips) ────────────────────────────────────────────
function cambiarTipoMedia(tipo, chipEl) {
  tipoMediaActual = tipo;
  document.querySelectorAll('.media-chip').forEach(c => c.classList.remove('active'));
  chipEl.classList.add('active');

  const configs = {
    imagen: { accept: 'image/*,.jpg,.jpeg,.png,.webp', icon: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>', label: 'Arrastra una imagen aquí o <strong>haz clic para seleccionar</strong>', hint: 'JPG, PNG, WEBP · Máx. 5 MB' },
    video:  { accept: 'video/*,.mp4,.mov,.avi,.webm',  icon: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></span>', label: 'Arrastra un video aquí o <strong>haz clic para seleccionar</strong>', hint: 'MP4, MOV, AVI · Máx. 50 MB' },
    audio:  { accept: 'audio/*,.mp3,.wav,.ogg',         icon: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>', label: 'Arrastra un audio aquí o <strong>haz clic para seleccionar</strong>', hint: 'MP3, WAV, OGG · Máx. 20 MB' },
    pdf:    { accept: '.pdf,application/pdf',            icon: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span>', label: 'Arrastra un PDF aquí o <strong>haz clic para seleccionar</strong>', hint: 'PDF · Máx. 10 MB' },
  };
  const c = configs[tipo];
  const fileInput = document.getElementById('pqrs-imagen');
  fileInput.accept = c.accept;
  document.getElementById('upload-icon-emoji').textContent = c.icon;
  document.getElementById('upload-label-main').innerHTML = c.label;
  document.getElementById('upload-label-hint').textContent = c.hint;

  // Limpiar selección previa si cambia el tipo
  quitarArchivo();
}

// ── UPLOAD MULTIMEDIA ─────────────────────────────────────────────────────────
function configurarUploadImagen() { configurarUploadMultimedia(); } // alias legacy

function configurarUploadMultimedia() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput  = document.getElementById('pqrs-imagen');
  if (!uploadArea) return;

  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault(); uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivo(file);
  });

  uploadArea.addEventListener('click', e => {
    if (e.target !== fileInput) fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) procesarArchivo(fileInput.files[0]);
  });
}

// Límites por tipo (bytes)
const LIMITES = { imagen: 5, video: 50, audio: 20, pdf: 10 };

function detectarTipoArchivo(file) {
  if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)) return 'imagen';
  if (file.type.startsWith('video/') || /\.(mp4|mov|avi|webm)$/i.test(file.name)) return 'video';
  if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg)$/i.test(file.name)) return 'audio';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  return null;
}

function procesarArchivo(file) {
  const tipo = detectarTipoArchivo(file);
  if (!tipo) {
    mostrarMensaje('msg-nueva-pqrs', 'Tipo de archivo no permitido. Usa JPG, PNG, MP4, MP3 o PDF.', 'error');
    return;
  }
  const limiteMB = LIMITES[tipo];
  if (file.size > limiteMB * 1024 * 1024) {
    mostrarMensaje('msg-nueva-pqrs', `El archivo supera el límite de ${limiteMB} MB para ${tipo}.`, 'error');
    return;
  }

  archivoAdjunto = file;
  const preview = document.getElementById('upload-preview');
  const iconos = { imagen: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>', video: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></span>', audio: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>', pdf: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span>' };
  const sizeKB = (file.size / 1024).toFixed(0);
  const sizeTxt = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

  let previewExtra = '';
  if (tipo === 'imagen') {
    const reader = new FileReader();
    reader.onload = e => {
      preview.innerHTML = `
        <div class="upload-file-preview">
          <img src="${e.target.result}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;" alt="preview">
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-size">${sizeTxt}</div>
          </div>
          <button type="button" class="btn-remove-file" onclick="quitarArchivo()" title="Quitar archivo">✕</button>
        </div>`;
      document.getElementById('upload-area').style.display = 'none';
    };
    reader.readAsDataURL(file);
    return;
  }

  preview.innerHTML = `
    <div class="upload-file-preview">
      <span class="file-icon">${iconos[tipo]}</span>
      <div class="file-info">
        <div class="file-name">${file.name}</div>
        <div class="file-size">${sizeTxt} · ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}</div>
      </div>
      <button type="button" class="btn-remove-file" onclick="quitarArchivo()" title="Quitar archivo">✕</button>
    </div>`;
  document.getElementById('upload-area').style.display = 'none';
}

// Alias legacy
function procesarImagen(file) { procesarArchivo(file); }

function quitarArchivo() {
  archivoAdjunto = null;
  document.getElementById('upload-preview').innerHTML = '';
  document.getElementById('upload-area').style.display = '';
  document.getElementById('pqrs-imagen').value = '';
}
// Alias legacy
function quitarImagen() { quitarArchivo(); }

// ── SUBIR ARCHIVO A SUPABASE STORAGE ─────────────────────────────────────────
async function subirImagen(pqrsId) {
  if (!archivoAdjunto) return null;
  const ext  = archivoAdjunto.name.split('.').pop();
  const path = `pqrs/${pqrsId}/adjunto.${ext}`;
  const { error } = await db.storage.from('pqrs-adjuntos').upload(path, archivoAdjunto, {
    cacheControl: '3600', upsert: true
  });
  if (error) { console.error('Error subiendo archivo:', error.message); return null; }
  const { data: { publicUrl } } = db.storage.from('pqrs-adjuntos').getPublicUrl(path);
  return publicUrl;
}

// ── CARGAR MIS PQRS ──────────────────────────────────────────────────────────
async function cargarMisPqrs(keepFilter = false) {
  const { data, error } = await db
    .from('pqrs').select('*')
    .eq('usuario_id', sesionActual.user.id)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  todasMisPqrs = data || [];
  actualizarEstadisticas();
  // keepFilter=true: respetar filtros activos (usado por realtime)
  if (keepFilter) {
    filtrarPqrs();
  } else {
    renderTabla(todasMisPqrs);
  }
}

// ── ESTADÍSTICAS ────────────────────────────────────────────────────────────
function actualizarEstadisticas() {
  document.getElementById('stat-total').textContent = todasMisPqrs.length;
  document.getElementById('stat-pendientes').textContent =
    todasMisPqrs.filter(p => ['pendiente','asignado','en_proceso'].includes(p.estado)).length;
  document.getElementById('stat-resueltos').textContent =
    todasMisPqrs.filter(p => p.estado === 'resuelto').length;
}

// ── RENDER TABLA / CARDS (adaptativo) ────────────────────────────────────────
function renderTabla(lista) {
  if (window.innerWidth <= 768) {
    _renderCardsMobile(lista);
  } else {
    _renderTablaDesktop(lista);
  }
}

function _renderTablaDesktop(lista) {
  const tbody = document.getElementById('tabla-mis-pqrs');
  const tablaWrap = tbody.closest('.tabla-wrap');
  tablaWrap.style.display = '';
  const cardsWrap = document.getElementById('cards-mobile-pqrs');
  if (cardsWrap) cardsWrap.style.display = 'none';

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#94a3b8;">
      <span style="font-size:1.8rem;display:block;margin-bottom:8px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6 6A19.79 19.79 0 0 1 2.12 22 2 2 0 0 1 0 19.82V16.92a2 2 0 0 1 1.64-2l4.16-.73A2 2 0 0 1 8 15.59l1.87 1.87a16 16 0 0 0 6.07-6.07L14.07 9.5a2 2 0 0 1-.3-2.2l.73-4.16A2 2 0 0 1 16.5 1.5h3a2 2 0 0 1 2 2.18 19.79 19.79 0 0 1-3.07 8.63"/></svg></span></span>
      No tienes solicitudes aún. ¡Crea tu primera PQRS!
    </td></tr>`;
    return;
  }
  tbody.innerHTML = lista.map(p => `
    <tr>
      <td><code class="cod-radicado">${p.radicado}</code></td>
      <td><span class="badge badge-tipo-${p.tipo}">${p.tipo}</span></td>
      <td class="asunto-cell" title="${p.asunto}">${p.asunto}</td>
      <td style="color:#64748b;font-size:0.82rem;">${formatFecha(p.created_at)}</td>
      <td><span class="estado estado-${p.estado.replace('_','-')}">${p.estado.replace('_',' ')}</span></td>
      <td>${p.imagen_url ? `<img src="${p.imagen_url}" class="img-thumb" onclick="verImagenCompleta('${p.imagen_url}')" title="Ver imagen adjunta">` : '<span style="color:#cbd5e1;font-size:0.78rem;">—</span>'}</td>
      <td><button class="btn btn-sm btn-outline" onclick="verDetalle('${p.id}')"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span> Ver</button></td>
    </tr>
  `).join('');
}

function _renderCardsMobile(lista) {
  const tbody = document.getElementById('tabla-mis-pqrs');
  const tablaWrap = tbody.closest('.tabla-wrap');
  tablaWrap.style.display = 'none';

  let cardsWrap = document.getElementById('cards-mobile-pqrs');
  if (!cardsWrap) {
    cardsWrap = document.createElement('div');
    cardsWrap.id = 'cards-mobile-pqrs';
    cardsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    tablaWrap.parentNode.insertBefore(cardsWrap, tablaWrap);
  }
  cardsWrap.style.display = 'flex';

  const colores = {pendiente:'#f97316',asignado:'#3b82f6',en_proceso:'#8b5cf6',resuelto:'#059669',cerrado:'#94a3b8'};
  const iconos  = {peticion:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></span>',queja:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>',reclamo:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>',sugerencia:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg></span>',felicitacion:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'};

  if (!lista.length) {
    cardsWrap.innerHTML = `
      <div style="text-align:center;padding:40px 20px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;">
        <span style="font-size:2rem;display:block;margin-bottom:10px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6 6A19.79 19.79 0 0 1 2.12 22 2 2 0 0 1 0 19.82V16.92a2 2 0 0 1 1.64-2l4.16-.73A2 2 0 0 1 8 15.59l1.87 1.87a16 16 0 0 0 6.07-6.07L14.07 9.5a2 2 0 0 1-.3-2.2l.73-4.16A2 2 0 0 1 16.5 1.5h3a2 2 0 0 1 2 2.18 19.79 19.79 0 0 1-3.07 8.63"/></svg></span></span>
        <p style="color:#94a3b8;font-size:0.9rem;">No tienes solicitudes aún.<br>¡Crea tu primera PQRS!</p>
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
      <div style="font-size:0.78rem;color:#64748b;margin-bottom:4px;">${iconos[p.tipo]||'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span>'} ${p.tipo}</div>
      <div style="font-size:0.75rem;color:#94a3b8;margin-bottom:12px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span> ${formatFecha(p.created_at)}</div>
      <button class="btn btn-sm btn-outline" onclick="verDetalle('${p.id}')" style="width:100%;justify-content:center;min-height:42px;">
        <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span> Ver detalle
      </button>
    </div>`;
  }).join('');
}

window.addEventListener('resize', () => { renderTabla(todasMisPqrs); });

// ── FILTRAR ───────────────────────────────────────────────────────────────────
function filtrarPqrs() {
  const estado = document.getElementById('filtro-estado').value;
  const tipo   = document.getElementById('filtro-tipo').value;
  let filtrado = todasMisPqrs;
  if (estado) filtrado = filtrado.filter(p => p.estado === estado);
  if (tipo)   filtrado = filtrado.filter(p => p.tipo === tipo);
  renderTabla(filtrado);
}

async function verDetalle(id) {
  const { data: p } = await db.from('pqrs').select('*').eq('id', id).single();
  const { data: respuestas } = await db
    .from('respuestas').select('*, users(nombre,rol)').eq('pqrs_id', id).order('created_at');

  // Buscar agente asignado
  let agente = null;
  if (['asignado','en_proceso','resuelto'].includes(p.estado)) {
    const { data: asig } = await db
      .from('asignaciones')
      .select('*, users!asignaciones_soporte_id_fkey(nombre,email,avatar_url,descripcion)')
      .eq('pqrs_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (asig?.users) agente = asig.users;
  }

  // Botón info soporte
  let btnInfoSoporte = '';
  if (agente) {
    btnInfoSoporte = `<button class="btn btn-sm" onclick="verInfoSoporte('${encodeURIComponent(JSON.stringify(agente))}')"
      style="background:rgba(99,102,241,0.08);color:#6366f1;border:1px solid rgba(99,102,241,0.25);font-size:0.75rem;padding:4px 10px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">
      <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span> Info del soporte
    </button>`;
  }

  // Adjunto multimedia
  const adjunto = renderAdjunto(p.imagen_url);

  // Valoración existente
  let valoracionHtml = '';
  if (p.valoracion) {
    const estrellas = '★'.repeat(p.valoracion) + '☆'.repeat(5 - p.valoracion);
    valoracionHtml = `<div class="rating-badge"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span> Tu valoración: <span style="letter-spacing:2px">${estrellas}</span> (${p.valoracion}/5)</div>`;
  }

  // Botón valorar — solo si hay respuesta y no ha valorado
  const hayRespuestas = respuestas && respuestas.length > 0;
  const puedeValorar  = hayRespuestas && !p.valoracion;
  const btnValorar    = puedeValorar
    ? `<button class="btn btn-sm btn-outline" style="margin-top:10px;" onclick="abrirModalValoracion('${p.id}')"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span> Valorar atención</button>`
    : '';

  document.getElementById('contenido-detalle').innerHTML = `
    <div class="detalle-header">
      <div><strong class="detalle-campo" style="font-size:.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;">Radicado</strong><code class="cod-radicado">${p.radicado}</code></div>
      <div><strong class="detalle-campo" style="font-size:.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;">Estado</strong><span class="estado estado-${p.estado.replace('_','-')}">${p.estado.replace('_',' ')}</span></div>
      <div><strong class="detalle-campo" style="font-size:.72rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;">Tipo</strong><span class="badge badge-tipo-${p.tipo}">${p.tipo}</span></div>
    </div>
    <div class="detalle-campo"><strong>Asunto</strong><p>${p.asunto}</p></div>
    <div class="detalle-campo"><strong>Área</strong><p>${p.area || '—'}</p></div>
    <div class="detalle-campo"><strong>Descripción</strong><p style="white-space:pre-wrap;line-height:1.6;">${p.descripcion}</p></div>
    ${p.fecha_hecho ? `<div class="detalle-campo"><strong>Fecha y hora del hecho</strong><p><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span> ${p.fecha_hecho}${p.hora_hecho ? ' &nbsp;<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> ' + p.hora_hecho : ''}</p></div>` : ''}
    ${agente ? `<div class="detalle-campo" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;"><div><strong>Agente asignado</strong><p style="margin:2px 0 0;">${agente.nombre}</p></div>${btnInfoSoporte}</div>` : ''}
    ${adjunto}
    ${valoracionHtml}
    ${btnValorar}
    <p style="margin-top:12px;color:#94a3b8;font-size:0.79rem;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span> Enviado el ${formatFecha(p.created_at)}</p>
    <hr style="margin:18px 0;border:none;border-top:1px solid var(--gris-medio);">
    <h3 style="font-size:0.92rem;font-weight:700;margin-bottom:12px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span> Respuestas (${respuestas?.length || 0})</h3>
    ${respuestas?.length
      ? respuestas.map(r => {
          const esAdmin = r.users?.rol === 'admin';
          if (esAdmin) return `
            <div style="margin-bottom:12px;background:linear-gradient(135deg,#f0f4ff,#e8f0fe);border:1px solid #c7d7fe;border-radius:12px;padding:12px 14px;border-left:4px solid #6366f1;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
                <strong style="font-size:0.82rem;color:#4338ca;display:flex;align-items:center;gap:5px;">
                  <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="5" y1="20" x2="19" y2="20"/></svg></span> ${r.users?.nombre||'Administrador'} <span style="font-size:0.68rem;background:#e0e7ff;color:#6366f1;padding:1px 7px;border-radius:99px;font-weight:600;">Administración</span>
                </strong>
                <span style="font-size:0.73rem;color:#94a3b8;">${formatFecha(r.created_at)}</span>
              </div>
              <p style="margin:0;font-size:0.87rem;line-height:1.55;color:#1e293b;white-space:pre-wrap;">${r.contenido}</p>
            </div>`;
          return `
            <div class="respuesta-item">
              <div class="respuesta-header">
                <strong>${r.users?.nombre || 'Soporte'}</strong>
                <span>${formatFecha(r.created_at)}</span>
              </div>
              <p>${r.contenido}</p>
            </div>`;
        }).join('')
      : '<p style="color:#94a3b8;font-size:0.85rem;">Sin respuestas aún.</p>'
    }
  `;
  document.getElementById('modal-detalle').classList.add('abierto');
}

// ── INFO SOPORTE MODAL ─────────────────────────────────────────────────────────
function verInfoSoporte(agentJson) {
  const agente = JSON.parse(decodeURIComponent(agentJson));
  const iniciales = (agente.nombre || 'S').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
  const avatarHTML = agente.avatar_url
    ? `<img src="${agente.avatar_url}" alt="${agente.nombre}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid #e0e7ff;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span style="display:none;width:64px;height:64px;border-radius:50%;background:#e0e7ff;color:#6366f1;font-size:1.1rem;font-weight:700;align-items:center;justify-content:center;">${iniciales}</span>`
    : `<span style="display:inline-flex;width:64px;height:64px;border-radius:50%;background:#e0e7ff;color:#6366f1;font-size:1.1rem;font-weight:700;align-items:center;justify-content:center;">${iniciales}</span>`;

  document.getElementById('modal-info-soporte').classList.add('abierto');
  document.getElementById('info-soporte-contenido').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
      ${avatarHTML}
      <div>
        <strong style="font-size:1rem;color:#0f172a;display:block;">${agente.nombre}</strong>
        <span style="font-size:0.8rem;color:#6366f1;font-weight:600;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span> Agente de soporte</span>
      </div>
    </div>
    ${agente.descripcion
      ? `<div style="background:#f8fafc;border-radius:10px;padding:12px 14px;border-left:3px solid #6366f1;">
           <p style="font-size:0.75rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;font-weight:700;">Áreas y funciones</p>
           <p style="font-size:0.88rem;color:#475569;line-height:1.6;margin:0;">${agente.descripcion}</p>
         </div>`
      : `<p style="color:#94a3b8;font-size:0.85rem;text-align:center;padding:12px 0;">Este agente aún no ha registrado una descripción.</p>`
    }
  `;
}


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
        <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg></span> Descargar video
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
        <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg></span> Descargar audio
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


// ── ENVIAR PQRS ───────────────────────────────────────────────────────────────
async function enviarPqrs(e) {
  e.preventDefault();
  ocultarMensaje('msg-nueva-pqrs');

  const tipo        = document.getElementById('pqrs-tipo').value;
  const asunto      = document.getElementById('pqrs-asunto').value.trim();
  const descripcion = document.getElementById('pqrs-descripcion').value.trim();
  const area        = document.getElementById('pqrs-area').value;
  const fechaHecho  = document.getElementById('pqrs-fecha-hecho').value;
  const horaHecho   = document.getElementById('pqrs-hora-hecho').value;
  const btn         = document.getElementById('btn-enviar-pqrs');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Enviando...';
  silbatoFutbol(); // sonido de silbato al enviar

  try {
    const radicado = generarRadicado();
    // 1. Insertar PQRS
    const { data: pqrsCreada, error } = await db.from('pqrs').insert({
      radicado, usuario_id: sesionActual.user.id,
      tipo, asunto, descripcion, area: area || null, estado: 'pendiente',
      fecha_hecho: fechaHecho || null,
      hora_hecho:  horaHecho  || null
    }).select().single();

    if (error) throw new Error(error.message);

    // 2. Subir archivo multimedia si existe
    if (archivoAdjunto) {
      const imageUrl = await subirImagen(pqrsCreada.id);
      if (imageUrl) {
        await db.from('pqrs').update({ imagen_url: imageUrl }).eq('id', pqrsCreada.id);
      }
    }

    btn.disabled = false;
    btn.textContent = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></span> Enviar solicitud';

    document.getElementById('form-nueva-pqrs').reset();
    quitarArchivo();
    mostrarAlertaPqrs(tipo);
    notificarPqrsEnviada(tipo, radicado);
    await cargarMisPqrs();

  } catch (err) {
    mostrarMensaje('msg-nueva-pqrs', err.message || 'Error al enviar. Intenta de nuevo.', 'error');
    btn.disabled = false;
    btn.textContent = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></span> Enviar solicitud';
  }
}

// ── HELPERS UI ────────────────────────────────────────────────────────────────
function mostrarSeccion(id, btn) {
  document.querySelectorAll('section[id^="sec-"]').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('activo'));
  const sec = document.getElementById(`sec-${id}`);
  if (sec) sec.style.display = 'block';
  // Marcar activo en sidebar Y en nav inferior
  document.querySelectorAll(`[data-seccion="${id}"], [onclick*="'${id}'"]`).forEach(b => b.classList.add('activo'));
  if (btn) btn.classList.add('activo');
  if (id === 'perfil') initPerfil();
}

function cerrarModal(id) { document.getElementById(id)?.classList.remove('abierto'); }
function cerrarSesionLocal() { cerrarSesion(db); }
// ── NOTIFICACIONES USUARIO ────────────────────────────────────────────────────

// Registrar notificación cuando se envía una PQRS nueva
function notificarPqrsEnviada(tipo, radicado) {
  const iconos = { peticion:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></span>', queja:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>', reclamo:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>', sugerencia:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg></span>', felicitacion:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>' };
  agregarNotificacion({
    titulo: 'PQRS enviada con éxito',
    desc: `Tu ${tipo} fue radicada como ${radicado}`,
    icono: iconos[tipo] || '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span>',
    tipo: 'exito'
  });
  mostrarToast('PQRS enviada', `Radicado: ${radicado}`, 'exito');
  renderNotifPanel(cargarNotifStorage());
}

// Detectar cambios de estado en mis PQRS (realtime Supabase)
function suscribirCambiosEstado(userId) {
  db.channel('mis-pqrs-estado')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'pqrs',
      filter: `usuario_id=eq.${userId}`
    }, payload => {
      const p = payload.new;
      const estadoTexto = { asignado:'Asignada a soporte', en_proceso:'En proceso', resuelto:'¡Resuelta!', cerrado:'Cerrada' };
      const iconoEstado = { asignado:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>', en_proceso:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span>', resuelto:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>', cerrado:'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>' };
      const titulo = estadoTexto[p.estado] || `Estado: ${p.estado}`;
      agregarNotificacion({
        titulo,
        desc: `${p.radicado} — ${p.asunto}`,
        icono: iconoEstado[p.estado] || '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>',
        urgente: p.estado === 'resuelto',
        pqrsId: p.id
      });
      mostrarToast(titulo, `${p.radicado} — ${p.asunto}`, p.estado === 'resuelto' ? 'exito' : 'info');
      renderNotifPanel(cargarNotifStorage());
      // Recargar data pero respetar el filtro activo
      cargarMisPqrs(true);
    })
    .subscribe();
}

// Notificar respuestas nuevas
function suscribirRespuestasNuevas(userId) {
  db.channel('mis-respuestas')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'respuestas'
    }, async payload => {
      const r = payload.new;
      // Verificar si es de una PQRS del usuario actual
      const { data: pqrs } = await db.from('pqrs')
        .select('radicado,asunto,usuario_id').eq('id', r.pqrs_id).single();
      if (pqrs && pqrs.usuario_id === userId) {
        agregarNotificacion({
          titulo: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span> Nueva respuesta de soporte',
          desc: `${pqrs.radicado}: ${r.contenido.substring(0,80)}${r.contenido.length > 80 ? '...' : ''}`,
          icono: '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>',
          pqrsId: r.pqrs_id
        });
        mostrarToast('Nueva respuesta', `Soporte respondió tu PQRS ${pqrs.radicado}`, 'info');
        renderNotifPanel(cargarNotifStorage());
      }
    })
    .subscribe();
}

// ── VALORACIÓN DE ESTRELLAS ───────────────────────────────────────────────────

function abrirModalValoracion(pqrsId) {
  pqrsIdParaValorar   = pqrsId;
  estrellaSeleccionada = 0;
  // Reset estrellas
  document.querySelectorAll('.star-btn').forEach(b => {
    b.classList.remove('selected', 'filled');
  });
  document.getElementById('star-label').textContent = '';
  document.getElementById('valoracion-comentario').value = '';
  ocultarMensaje?.('msg-valoracion');
  document.getElementById('modal-valoracion').classList.add('abierto');
}

const LABEL_ESTRELLAS = { 1: 'Muy malo', 2: 'Malo', 3: 'Regular', 4: 'Bueno', 5: 'Excelente' };

function seleccionarEstrella(valor) {
  estrellaSeleccionada = valor;
  document.querySelectorAll('.star-btn').forEach(btn => {
    const v = parseInt(btn.dataset.value);
    btn.classList.toggle('selected', v === valor);
    btn.classList.toggle('filled', v <= valor);
  });
  document.getElementById('star-label').textContent = LABEL_ESTRELLAS[valor] || '';
}

// Hover interactivo
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      const v = parseInt(btn.dataset.value);
      document.querySelectorAll('.star-btn').forEach(b => {
        b.classList.toggle('hover-active', parseInt(b.dataset.value) <= v);
      });
      document.getElementById('star-label').textContent = LABEL_ESTRELLAS[v] || '';
    });
    btn.addEventListener('mouseleave', () => {
      document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('hover-active'));
      document.getElementById('star-label').textContent = estrellaSeleccionada ? LABEL_ESTRELLAS[estrellaSeleccionada] : '';
    });
  });
});

async function enviarValoracion() {
  if (!estrellaSeleccionada) {
    mostrarMensaje('msg-valoracion', 'Por favor selecciona al menos una estrella.', 'error');
    return;
  }
  const comentario = document.getElementById('valoracion-comentario').value.trim();
  const btn = document.getElementById('btn-enviar-valoracion');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const update = { valoracion: estrellaSeleccionada };
    if (comentario) update.valoracion_comentario = comentario;

    const { error } = await db.from('pqrs').update(update).eq('id', pqrsIdParaValorar);
    if (error) throw new Error(error.message);

    btn.disabled = false;
    btn.textContent = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Enviar valoración';
    mostrarMensaje('msg-valoracion', '¡Gracias por tu valoración!', 'exito');
    setTimeout(() => {
      cerrarModal('modal-valoracion');
      // Refrescar el detalle si está abierto
      if (pqrsIdParaValorar) verDetalle(pqrsIdParaValorar);
    }, 1800);
  } catch (err) {
    mostrarMensaje('msg-valoracion', err.message || 'Error al guardar. Intenta de nuevo.', 'error');
    btn.disabled = false;
    btn.textContent = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Enviar valoración';
  }
}

// ── SONIDO MÁGICO DE ENVÍO (Web Audio API) ───────────────────────────────────
// Tres notas tipo "estrellitas": Do → Mi → Sol ascendente, suave y breve
function silbatoFutbol() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.18, ctx.currentTime); // volumen general bajo
    master.connect(ctx.destination);

    // Notas: Do5, Mi5, Sol5, Do6 — acorde mágico ascendente
    const notas = [
      { freq: 523.25, t: 0.00, dur: 0.18 },  // Do5
      { freq: 659.25, t: 0.10, dur: 0.18 },  // Mi5
      { freq: 783.99, t: 0.20, dur: 0.18 },  // Sol5
      { freq: 1046.5, t: 0.30, dur: 0.22 },  // Do6 — brillo final
    ];

    notas.forEach(({ freq, t, dur }) => {
      const start = ctx.currentTime + t;

      // Oscilador principal — sine suave
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      // Envelope: ataque muy suave, caída con cola de reverb
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(1, start + 0.015);  // ataque 15ms
      env.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.18); // cola larga

      osc.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(start + dur + 0.25);

      // Armónico de brillo (sine a 2x frecuencia, muy suave)
      const osc2 = ctx.createOscillator();
      const env2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, start);
      env2.gain.setValueAtTime(0, start);
      env2.gain.linearRampToValueAtTime(0.25, start + 0.01);
      env2.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.08);
      osc2.connect(env2);
      env2.connect(master);
      osc2.start(start);
      osc2.stop(start + dur + 0.15);
    });

  } catch (e) {
    console.warn('sonidoMagico: AudioContext no disponible', e);
  }
}