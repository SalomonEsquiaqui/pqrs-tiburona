// ═══════════════════════════════════════════════════════════
//  PERFIL — Lógica compartida para todos los roles
//  Depende de: db (supabase client), sesionActual (user object)
// ═══════════════════════════════════════════════════════════

// ── Estado local del perfil ────────────────────────────────
let _perfilDatos = {};
let _perfilModalStep = 1; // 1 = confirmación, 2 = contraseña

// ── Inicializar la sección de perfil ──────────────────────
async function initPerfil() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;

  const uid   = session.user.id;
  const email = session.user.email;

  // Intentar con todas las columnas; si falla (columnas no existen), caer a las básicas
  let perfil = null;
  const { data: d1, error: e1 } = await db
    .from('users')
    .select('nombre, telefono, rol, avatar_url, descripcion, numero_identificacion')
    .eq('id', uid)
    .single();

  if (e1) {
    // Columnas opcionales no existen aún — traer solo las básicas
    const { data: d2 } = await db
      .from('users')
      .select('nombre, rol')
      .eq('id', uid)
      .single();
    perfil = d2 ? { ...d2, telefono: null, avatar_url: null } : null;
  } else {
    perfil = d1;
  }

  // Si no hay perfil en absoluto, mostrar error amigable
  if (!perfil) {
    const sec = document.getElementById('sec-perfil');
    if (sec) sec.innerHTML = `
      <div class="perfil-wrap">
        <div class="page-header"><h1><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span> Mi cuenta</h1></div>
        <div class="perfil-card">
          <div class="perfil-card-body" style="text-align:center;padding:32px;color:#94a3b8;">
            <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span> No se pudo cargar la información del perfil.<br>
            <small>Verifica tu conexión o intenta recargar la página.</small>
          </div>
        </div>
      </div>`;
    return;
  }

  _perfilDatos = { uid, email, ...perfil };

  // ── Iniciales para avatar ──
  const iniciales = (perfil.nombre || 'U')
    .split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();

  // ── Construir HTML de la sección ──
  const rol = perfil.rol || 'usuario';
  const rolLabel = { admin: 'Administrador', soporte: 'Soporte', usuario: 'Usuario' }[rol] || rol;

  const avatarHTML = perfil.avatar_url
    ? `<img class="perfil-avatar-img" id="perfil-avatar-preview" src="${perfil.avatar_url}" alt="Foto de perfil">`
    : `<div class="perfil-avatar-initials" id="perfil-avatar-initials">${iniciales}</div>`;

  // Bloque descripción — para soporte y admin
  const descBlock = (rol === 'soporte' || rol === 'admin') ? `
    <!-- ── CARD DESCRIPCIÓN (SOPORTE / ADMIN) ── -->
    <div class="perfil-card">
      <div class="perfil-card-header">
        <div class="perfil-card-header-icon" style="background:${rol==='admin'?'#e0e7ff':'#ede9fe'};color:${rol==='admin'?'#4f46e5':'#7c3aed'};">${rol==='admin'?'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="5" y1="20" x2="19" y2="20"/></svg></span>':'<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>'}</div>
        <div>
          <h3>${rol==='admin'?'Descripción del administrador':'Descripción de soporte'}</h3>
          <p>${rol==='admin'?'Descripción visible en tu perfil de administrador (máx. 300 caracteres)':'Áreas asignadas y funciones como agente de soporte'}</p>
        </div>
      </div>
      <div class="perfil-card-body">
        <div class="perfil-field">
          <label>Descripción (visible para los usuarios)</label>
          <textarea id="perfil-input-descripcion" rows="3" maxlength="350"
            placeholder="Ej: Área de facturación y cobranzas. Atiendo solicitudes de pagos, ajustes de cuenta y reclamos relacionados con el servicio…"
            style="resize:vertical;font-family:inherit;font-size:0.9rem;line-height:1.5;">${perfil.descripcion || ''}</textarea>
          <span style="font-size:0.72rem;color:#94a3b8;text-align:right;display:block;margin-top:4px;"><span id="desc-count">${(perfil.descripcion||'').length}</span>/300</span>
        </div>
        <button class="perfil-save-btn" id="perfil-btn-desc" onclick="guardarDescripcion()" type="button" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);">
          <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span> Guardar descripción
        </button>
        <div id="perfil-desc-toast" class="perfil-toast"></div>
      </div>
    </div>` : '';

  const seccion = document.getElementById('sec-perfil');
  if (!seccion) return;

  seccion.innerHTML = `
  <input type="file" id="perfil-file-input" accept="image/jpeg,image/png,image/webp" />
  <div class="perfil-wrap">

    <!-- ── HEADER ── -->
    <div class="page-header" style="margin-bottom:20px;">
      <h1><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span> Mi cuenta</h1>
    </div>

    <!-- ── CARD AVATAR + NOMBRE ── -->
    <div class="perfil-card">
      <div class="perfil-card-header">
        <div class="perfil-card-header-icon icon-azul"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span></div>
        <div>
          <h3>Foto de perfil</h3>
          <p>Imagen visible en tu cuenta</p>
        </div>
      </div>
      <div class="perfil-card-body">
        <div class="perfil-avatar-hero">
          <div class="perfil-avatar-ring" onclick="document.getElementById('perfil-file-input').click()" title="Cambiar foto" style="cursor:pointer;">
            ${avatarHTML}
            <button class="perfil-avatar-btn" type="button" tabindex="-1"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span></button>
          </div>
          <div class="perfil-avatar-info">
            <h2 id="perfil-nombre-display">${perfil.nombre || '—'}</h2>
            <span class="perfil-badge-rol rol-${rol}">${rolLabel}</span>
            <p class="perfil-avatar-hint">Toca la foto para cambiarla · JPG, PNG o WEBP · Máx. 2 MB</p>
            ${perfil.avatar_url ? `
            <button id="btn-eliminar-foto" onclick="eliminarFotoPerfil()" type="button"
              style="margin-top:10px;background:none;border:1px solid #fca5a5;color:#ef4444;padding:5px 13px;border-radius:7px;font-size:0.75rem;font-weight:600;cursor:pointer;transition:background .18s,color .18s;"
              onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">
              <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></span> Eliminar foto
            </button>` : ''}
          </div>
        </div>
        <div id="perfil-avatar-toast" class="perfil-toast"></div>
      </div>
    </div>

    <!-- ── CARD DATOS PERSONALES ── -->
    <div class="perfil-card">
      <div class="perfil-card-header">
        <div class="perfil-card-header-icon icon-verde"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span></div>
        <div>
          <h3>Información personal</h3>
          <p>Correo e identificación no son editables</p>
        </div>
      </div>
      <div class="perfil-card-body">
        <div class="perfil-field">
          <label>Nombre completo</label>
          <input type="text" id="perfil-input-nombre" value="${perfil.nombre || ''}" placeholder="Tu nombre completo" maxlength="80">
        </div>
        <div class="perfil-field-row">
          <div class="perfil-field">
            <label>Correo electrónico</label>
            <input type="email" value="${email}" class="perfil-readonly" disabled>
            <span class="perfil-lock-hint"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> No editable</span>
          </div>
          <div class="perfil-field">
            <label>Identificación</label>
            <input type="text" value="${perfil.numero_identificacion || '—'}" class="perfil-readonly" disabled>
            <span class="perfil-lock-hint"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> No editable</span>
          </div>
        </div>
        <div class="perfil-field">
          <label>Número de teléfono</label>
          <div class="perfil-tel-wrap">
            <input type="tel" id="perfil-input-tel" value="${perfil.telefono || ''}" placeholder="+57 300 000 0000" maxlength="20" readonly>
            <button class="perfil-tel-edit-btn" onclick="abrirModalTel()" type="button"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> Editar</button>
          </div>
        </div>
        <button class="perfil-save-btn" id="perfil-btn-guardar" onclick="guardarPerfil()" type="button">
          <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span> Guardar cambios
        </button>
        <div id="perfil-main-toast" class="perfil-toast"></div>
      </div>
    </div>

    ${descBlock}

  </div>

  <!-- ══ MODAL CONFIRMACIÓN TELÉFONO ══ -->
  <div class="perfil-modal-overlay" id="perfil-modal-tel">
    <div class="perfil-modal">
      <div class="perfil-steps">
        <div class="perfil-step activo" id="pstep-1"></div>
        <div class="perfil-step" id="pstep-2"></div>
      </div>

      <!-- Step 1: confirmación -->
      <div id="pmodal-step1">
        <div class="perfil-modal-icon modal-icon-warning"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span></div>
        <h3>¿Cambiar número de teléfono?</h3>
        <p>Esta información se usa para contactarte. Asegúrate de ingresar un número válido.</p>
        <div class="perfil-field">
          <label>Nuevo número</label>
          <input type="tel" id="perfil-tel-nuevo" placeholder="+57 300 000 0000" maxlength="20">
        </div>
        <div class="perfil-modal-actions">
          <button class="btn-modal-primary" id="pstep1-btn" onclick="confirmarCambioTel()" type="button">
            Continuar →
          </button>
          <button class="btn-modal-cancel" onclick="cerrarModalTel()" type="button">Cancelar</button>
        </div>
      </div>

      <!-- Step 2: contraseña -->
      <div id="pmodal-step2" style="display:none;">
        <div class="perfil-modal-icon modal-icon-lock"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg></span></div>
        <h3>Confirma tu contraseña</h3>
        <p>Por seguridad, ingresa tu contraseña actual para aplicar este cambio.</p>
        <div class="perfil-field">
          <label>Contraseña actual</label>
          <input type="password" id="perfil-pass-confirm" placeholder="Tu contraseña" autocomplete="current-password">
        </div>
        <div id="perfil-modal-toast" class="perfil-toast"></div>
        <div class="perfil-modal-actions" style="margin-top:14px;">
          <button class="btn-modal-primary" id="pstep2-btn" onclick="guardarCambioTel()" type="button">
            <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Guardar cambio
          </button>
          <button class="btn-modal-cancel" onclick="volverStep1()" type="button">← Volver</button>
        </div>
      </div>
    </div>
  </div>
  `;

  // ── Listener: subir foto ──
  document.getElementById('perfil-file-input').addEventListener('change', subirFotoPerfil);

  // Contador de caracteres descripción
  const inputDesc = document.getElementById('perfil-input-descripcion');
  if (inputDesc) {
    inputDesc.addEventListener('input', () => {
      const count = document.getElementById('desc-count');
      if (count) count.textContent = inputDesc.value.length;
    });
  }
}

// ── Guardar nombre ─────────────────────────────────────────
async function guardarPerfil() {
  const btn = document.getElementById('perfil-btn-guardar');
  const nombre = document.getElementById('perfil-input-nombre')?.value.trim();

  if (!nombre) {
    mostrarPerfilToast('perfil-main-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> El nombre no puede estar vacío.', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<div class="perfil-spinner"></div> Guardando…`;

  try {
    const { error } = await db
      .from('users')
      .update({ nombre })
      .eq('id', _perfilDatos.uid);

    if (error) throw new Error(error.message);

    // Actualizar displays del sidebar
    const displayIds = ['nombre-admin', 'nombre-soporte', 'nombre-usuario'];
    displayIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = nombre;
    });
    document.getElementById('perfil-nombre-display').textContent = nombre;
    _perfilDatos.nombre = nombre;

    mostrarPerfilToast('perfil-main-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Cambios guardados correctamente.', 'exito');
  } catch (e) {
    mostrarPerfilToast('perfil-main-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> ' + (e.message || 'Error al guardar.'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span> Guardar cambios';
  }
}

// ── Guardar descripción soporte ────────────────────────────
async function guardarDescripcion() {
  const btn  = document.getElementById('perfil-btn-desc');
  const desc = document.getElementById('perfil-input-descripcion')?.value.trim();
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg></span> Guardando…';
  try {
    await apiFetch(`/users/${_perfilDatos.uid}/perfil`, {
      method: 'PATCH',
      body: JSON.stringify({ descripcion: desc })
    });
    _perfilDatos.descripcion = desc;
    mostrarPerfilToast('perfil-desc-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Descripción guardada correctamente.', 'exito');
  } catch (e) {
    mostrarPerfilToast('perfil-desc-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> ' + (e.message || 'Error al guardar.'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span> Guardar descripción';
  }
}

// ── Subir foto de perfil ───────────────────────────────────
async function subirFotoPerfil(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    mostrarPerfilToast('perfil-avatar-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> La imagen no debe superar 2 MB.', 'error');
    return;
  }

  const ext   = file.name.split('.').pop();
  const path  = `avatars/${_perfilDatos.uid}.${ext}`;

  mostrarPerfilToast('perfil-avatar-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg></span> Subiendo imagen…', '');

  try {
    const { error: upErr } = await db.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) throw new Error(upErr.message);

    const { data: urlData } = db.storage.from('avatars').getPublicUrl(path);
    const avatar_url = urlData.publicUrl + '?t=' + Date.now();

    const { error: dbErr } = await db
      .from('users')
      .update({ avatar_url })
      .eq('id', _perfilDatos.uid);

    if (dbErr) throw new Error(dbErr.message);

    // Actualizar preview
    const ring = document.querySelector('.perfil-avatar-ring');
    ring.querySelector('.perfil-avatar-initials')?.remove();
    let img = ring.querySelector('.perfil-avatar-img');
    if (!img) {
      img = document.createElement('img');
      img.className = 'perfil-avatar-img';
      img.id = 'perfil-avatar-preview';
      img.alt = 'Foto de perfil';
      ring.insertBefore(img, ring.querySelector('.perfil-avatar-btn'));
    }
    img.src = avatar_url;
    _perfilDatos.avatar_url = avatar_url;

    mostrarPerfilToast('perfil-avatar-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Foto actualizada correctamente.', 'exito');
  } catch (err) {
    mostrarPerfilToast('perfil-avatar-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> ' + (err.message || 'Error al subir la imagen.'), 'error');
  }

  e.target.value = '';
}

// ── Eliminar foto de perfil ─────────────────────────────────
async function eliminarFotoPerfil() {
  const btn = document.getElementById('btn-eliminar-foto');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg></span> Eliminando…';

  try {
    // 1. Limpiar avatar_url en la BD
    const { error: dbErr } = await db
      .from('users')
      .update({ avatar_url: null })
      .eq('id', _perfilDatos.uid);
    if (dbErr) throw new Error(dbErr.message);

    // 2. Animación de desvanecido sobre la imagen
    const ring = document.querySelector('.perfil-avatar-ring');
    const img  = ring?.querySelector('.perfil-avatar-img');
    if (img) {
      img.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
      img.style.opacity    = '0';
      img.style.transform  = 'scale(0.85)';
      await new Promise(r => setTimeout(r, 460));
      img.remove();
    }

    // 3. Insertar iniciales con fade-in
    const iniciales = (_perfilDatos.nombre || 'U')
      .split(' ').slice(0,2).map(p => p[0]).join('').toUpperCase();
    const span = document.createElement('div');
    span.className = 'perfil-avatar-initials';
    span.id = 'perfil-avatar-initials';
    span.textContent = iniciales;
    span.style.opacity = '0';
    span.style.transition = 'opacity 0.35s ease';
    ring.insertBefore(span, ring.querySelector('.perfil-avatar-btn'));
    requestAnimationFrame(() => { span.style.opacity = '1'; });

    // 4. Quitar botón eliminar
    btn.remove();

    _perfilDatos.avatar_url = null;
    mostrarPerfilToast('perfil-avatar-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Foto de perfil eliminada.', 'exito');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></span> Eliminar foto';
    mostrarPerfilToast('perfil-avatar-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> ' + (err.message || 'Error al eliminar.'), 'error');
  }
}

// ── Modal teléfono — abrir ────────────────────────────────
function abrirModalTel() {
  _perfilModalStep = 1;
  document.getElementById('perfil-tel-nuevo').value = '';
  document.getElementById('perfil-pass-confirm').value = '';
  document.getElementById('pmodal-step1').style.display = '';
  document.getElementById('pmodal-step2').style.display = 'none';
  document.getElementById('pstep-1').className = 'perfil-step activo';
  document.getElementById('pstep-2').className = 'perfil-step';
  ocultarPerfilToast('perfil-modal-toast');
  document.getElementById('perfil-modal-tel').classList.add('abierto');
  setTimeout(() => document.getElementById('perfil-tel-nuevo').focus(), 280);
}

function cerrarModalTel() {
  document.getElementById('perfil-modal-tel').classList.remove('abierto');
}

// ── Step 1 → Step 2 ───────────────────────────────────────
function confirmarCambioTel() {
  const tel = document.getElementById('perfil-tel-nuevo').value.trim();
  if (!tel || tel.length < 7) {
    document.getElementById('perfil-tel-nuevo').focus();
    document.getElementById('perfil-tel-nuevo').style.borderColor = '#ef4444';
    setTimeout(() => document.getElementById('perfil-tel-nuevo').style.borderColor = '', 1800);
    return;
  }

  document.getElementById('pmodal-step1').style.display = 'none';
  document.getElementById('pmodal-step2').style.display = '';
  document.getElementById('pstep-1').className = 'perfil-step done';
  document.getElementById('pstep-2').className = 'perfil-step activo';
  setTimeout(() => document.getElementById('perfil-pass-confirm').focus(), 80);
}

function volverStep1() {
  document.getElementById('pmodal-step1').style.display = '';
  document.getElementById('pmodal-step2').style.display = 'none';
  document.getElementById('pstep-1').className = 'perfil-step activo';
  document.getElementById('pstep-2').className = 'perfil-step';
  ocultarPerfilToast('perfil-modal-toast');
}

// ── Step 2: verificar contraseña y guardar ────────────────
async function guardarCambioTel() {
  const tel      = document.getElementById('perfil-tel-nuevo').value.trim();
  const password = document.getElementById('perfil-pass-confirm').value;
  const btn      = document.getElementById('pstep2-btn');

  if (!password) {
    mostrarPerfilToast('perfil-modal-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> Ingresa tu contraseña.', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<div class="perfil-spinner"></div> Verificando…`;

  try {
    // Re-autenticar con la contraseña
    const { error: authErr } = await db.auth.signInWithPassword({
      email: _perfilDatos.email,
      password
    });

    if (authErr) throw new Error('Contraseña incorrecta. Inténtalo de nuevo.');

    // Guardar el nuevo teléfono
    const { error: dbErr } = await db
      .from('users')
      .update({ telefono: tel })
      .eq('id', _perfilDatos.uid);

    if (dbErr) throw new Error(dbErr.message);

    _perfilDatos.telefono = tel;
    document.getElementById('perfil-input-tel').value = tel;

    cerrarModalTel();
    mostrarPerfilToast('perfil-main-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Número de teléfono actualizado.', 'exito');
  } catch (err) {
    mostrarPerfilToast('perfil-modal-toast', '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Guardar cambio';
  }
}

// ── Enter en inputs del modal ─────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('pmodal-step1')?.style.display !== 'none' &&
        document.getElementById('perfil-tel-nuevo') === document.activeElement) {
      confirmarCambioTel();
    }
    if (document.getElementById('pmodal-step2')?.style.display !== 'none' &&
        document.getElementById('perfil-pass-confirm') === document.activeElement) {
      guardarCambioTel();
    }
  }
  if (e.key === 'Escape') {
    if (document.getElementById('perfil-modal-tel')?.classList.contains('abierto')) {
      cerrarModalTel();
    }
  }
});

// ── Click fuera del modal para cerrar ────────────────────
document.addEventListener('click', e => {
  const overlay = document.getElementById('perfil-modal-tel');
  if (overlay && e.target === overlay) cerrarModalTel();
});

// ── Utilidades de toast ───────────────────────────────────
function mostrarPerfilToast(id, msg, tipo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `perfil-toast ${tipo}`;
  requestAnimationFrame(() => el.classList.add('visible'));
  if (tipo === 'exito') setTimeout(() => ocultarPerfilToast(id), 4000);
}

function ocultarPerfilToast(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('visible');
  setTimeout(() => { el.textContent = ''; el.className = 'perfil-toast'; }, 300);
}
