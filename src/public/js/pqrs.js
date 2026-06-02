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
    imagen: { accept: 'image/*,.jpg,.jpeg,.png,.webp', icon: '🖼️', label: 'Arrastra una imagen aquí o <strong>haz clic para seleccionar</strong>', hint: 'JPG, PNG, WEBP · Máx. 5 MB' },
    video:  { accept: 'video/*,.mp4,.mov,.avi,.webm',  icon: '🎬', label: 'Arrastra un video aquí o <strong>haz clic para seleccionar</strong>', hint: 'MP4, MOV, AVI · Máx. 50 MB' },
    audio:  { accept: 'audio/*,.mp3,.wav,.ogg',         icon: '🎵', label: 'Arrastra un audio aquí o <strong>haz clic para seleccionar</strong>', hint: 'MP3, WAV, OGG · Máx. 20 MB' },
    pdf:    { accept: '.pdf,application/pdf',            icon: '📄', label: 'Arrastra un PDF aquí o <strong>haz clic para seleccionar</strong>', hint: 'PDF · Máx. 10 MB' },
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
  const iconos = { imagen: '🖼️', video: '🎬', audio: '🎵', pdf: '📄' };
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
      <span style="font-size:1.8rem;display:block;margin-bottom:8px;">📭</span>
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
      <td><button class="btn btn-sm btn-outline" onclick="verDetalle('${p.id}')">👁 Ver</button></td>
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
  const iconos  = {peticion:'📝',queja:'😤',reclamo:'⚡',sugerencia:'💡',felicitacion:'🌟'};

  if (!lista.length) {
    cardsWrap.innerHTML = `
      <div style="text-align:center;padding:40px 20px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;">
        <span style="font-size:2rem;display:block;margin-bottom:10px;">📭</span>
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
      <div style="font-size:0.78rem;color:#64748b;margin-bottom:4px;">${iconos[p.tipo]||'📋'} ${p.tipo}</div>
      <div style="font-size:0.75rem;color:#94a3b8;margin-bottom:12px;">📅 ${formatFecha(p.created_at)}</div>
      <button class="btn btn-sm btn-outline" onclick="verDetalle('${p.id}')" style="width:100%;justify-content:center;min-height:42px;">
        👁 Ver detalle
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
    .from('respuestas').select('*, users(nombre)').eq('pqrs_id', id).order('created_at');

  // Adjunto multimedia
  const adjunto = renderAdjunto(p.imagen_url);

  // Valoración existente
  let valoracionHtml = '';
  if (p.valoracion) {
    const estrellas = '★'.repeat(p.valoracion) + '☆'.repeat(5 - p.valoracion);
    valoracionHtml = `<div class="rating-badge">⭐ Tu valoración: <span style="letter-spacing:2px">${estrellas}</span> (${p.valoracion}/5)</div>`;
  }

  // Botón valorar — solo si hay respuesta y no ha valorado
  const hayRespuestas = respuestas && respuestas.length > 0;
  const puedeValorar  = hayRespuestas && !p.valoracion;
  const btnValorar    = puedeValorar
    ? `<button class="btn btn-sm btn-outline" style="margin-top:10px;" onclick="abrirModalValoracion('${p.id}')">⭐ Valorar atención</button>`
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
    ${p.fecha_hecho ? `<div class="detalle-campo"><strong>Fecha y hora del hecho</strong><p>📅 ${p.fecha_hecho}${p.hora_hecho ? ' &nbsp;🕐 ' + p.hora_hecho : ''}</p></div>` : ''}
    ${adjunto}
    ${valoracionHtml}
    ${btnValorar}
    <p style="margin-top:12px;color:#94a3b8;font-size:0.79rem;">📅 Enviado el ${formatFecha(p.created_at)}</p>
    <hr style="margin:18px 0;border:none;border-top:1px solid var(--gris-medio);">
    <h3 style="font-size:0.92rem;font-weight:700;margin-bottom:12px;">💬 Respuestas (${respuestas?.length || 0})</h3>
    ${respuestas?.length
      ? respuestas.map(r => `
          <div class="respuesta-item">
            <div class="respuesta-header">
              <strong>${r.users?.nombre || 'Soporte'}</strong>
              <span>${formatFecha(r.created_at)}</span>
            </div>
            <p>${r.contenido}</p>
          </div>`).join('')
      : '<p style="color:#94a3b8;font-size:0.85rem;">Sin respuestas aún.</p>'
    }
  `;
  document.getElementById('modal-detalle').classList.add('abierto');
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
      <p class="adjunto-label">🎬 Video adjunto</p>
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
      <p class="adjunto-label">🎵 Audio adjunto</p>
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
      <p class="adjunto-label">📄 PDF adjunto</p>
      <div style="border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-top:6px;">
        <iframe src="${url}" style="width:100%;height:420px;border:none;display:block;"
          title="PDF adjunto">
        </iframe>
      </div>
      <a href="${url}" target="_blank" rel="noopener"
        class="btn btn-outline btn-sm" style="margin-top:8px;display:inline-flex;align-items:center;gap:6px;">
        🔗 Abrir en nueva pestaña
      </a>
    </div>`;

  // Imagen por defecto
  return `
    <div class="adjunto-wrap">
      <p class="adjunto-label">📎 Imagen adjunta</p>
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
  silbatoFutbol(); // 🎵 sonido de silbato al enviar

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
    btn.textContent = '📤 Enviar solicitud';

    document.getElementById('form-nueva-pqrs').reset();
    quitarArchivo();
    mostrarAlertaPqrs(tipo);
    notificarPqrsEnviada(tipo, radicado);
    await cargarMisPqrs();

  } catch (err) {
    mostrarMensaje('msg-nueva-pqrs', err.message || 'Error al enviar. Intenta de nuevo.', 'error');
    btn.disabled = false;
    btn.textContent = '📤 Enviar solicitud';
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
  const iconos = { peticion:'📝', queja:'😤', reclamo:'⚡', sugerencia:'💡', felicitacion:'🌟' };
  agregarNotificacion({
    titulo: 'PQRS enviada con éxito',
    desc: `Tu ${tipo} fue radicada como ${radicado}`,
    icono: iconos[tipo] || '📋',
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
      const iconoEstado = { asignado:'👤', en_proceso:'🔄', resuelto:'✅', cerrado:'🔒' };
      const titulo = estadoTexto[p.estado] || `Estado: ${p.estado}`;
      agregarNotificacion({
        titulo,
        desc: `${p.radicado} — ${p.asunto}`,
        icono: iconoEstado[p.estado] || '🔔',
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
          titulo: '💬 Nueva respuesta de soporte',
          desc: `${pqrs.radicado}: ${r.contenido.substring(0,80)}${r.contenido.length > 80 ? '...' : ''}`,
          icono: '💬',
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

const LABEL_ESTRELLAS = { 1: 'Muy malo 😞', 2: 'Malo 😕', 3: 'Regular 😐', 4: 'Bueno 😊', 5: 'Excelente 🤩' };

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
    btn.textContent = '✅ Enviar valoración';
    mostrarMensaje('msg-valoracion', '¡Gracias por tu valoración! 🙏', 'exito');
    setTimeout(() => {
      cerrarModal('modal-valoracion');
      // Refrescar el detalle si está abierto
      if (pqrsIdParaValorar) verDetalle(pqrsIdParaValorar);
    }, 1800);
  } catch (err) {
    mostrarMensaje('msg-valoracion', err.message || 'Error al guardar. Intenta de nuevo.', 'error');
    btn.disabled = false;
    btn.textContent = '✅ Enviar valoración';
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