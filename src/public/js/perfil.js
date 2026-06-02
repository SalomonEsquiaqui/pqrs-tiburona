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
        <div class="page-header"><h1>⚙️ Mi cuenta</h1></div>
        <div class="perfil-card">
          <div class="perfil-card-body" style="text-align:center;padding:32px;color:#94a3b8;">
            ⚠️ No se pudo cargar la información del perfil.<br>
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
        <div class="perfil-card-header-icon" style="background:${rol==='admin'?'#e0e7ff':'#ede9fe'};color:${rol==='admin'?'#4f46e5':'#7c3aed'};">${rol==='admin'?'👑':'🛠'}</div>
        <div>
          <h3>${rol==='admin'?'Descripción del administrador':'Descripción de soporte'}</h3>
          <p>${rol==='admin'?'Descripción visible en tu perfil de administrador (máx. 300 caracteres)':'Áreas asignadas y funciones como agente de soporte'}</p>
        </div>
      </div>
      <div class="perfil-card-body">
        <div class="perfil-field">
          <label>Descripción (visible para los usuarios)</label>
          <textarea id="perfil-input-descripcion" rows="3" maxlength="300"
            placeholder="Ej: Área de facturación y cobranzas. Atiendo solicitudes de pagos, ajustes de cuenta y reclamos relacionados con el servicio…"
            style="resize:vertical;font-family:inherit;font-size:0.9rem;line-height:1.5;">${perfil.descripcion || ''}</textarea>
          <span style="font-size:0.72rem;color:#94a3b8;text-align:right;display:block;margin-top:4px;"><span id="desc-count">${(perfil.descripcion||'').length}</span>/300</span>
        </div>
        <button class="perfil-save-btn" id="perfil-btn-desc" onclick="guardarDescripcion()" type="button" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);">
          💾 Guardar descripción
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
      <h1>⚙️ Mi cuenta</h1>
    </div>

    <!-- ── CARD AVATAR + NOMBRE ── -->
    <div class="perfil-card">
      <div class="perfil-card-header">
        <div class="perfil-card-header-icon icon-azul">👤</div>
        <div>
          <h3>Foto de perfil</h3>
          <p>Imagen visible en tu cuenta</p>
        </div>
      </div>
      <div class="perfil-card-body">
        <div class="perfil-avatar-hero">
          <div class="perfil-avatar-ring" onclick="document.getElementById('perfil-file-input').click()" title="Cambiar foto" style="cursor:pointer;">
            ${avatarHTML}
            <button class="perfil-avatar-btn" type="button" tabindex="-1">✏️</button>
          </div>
          <div class="perfil-avatar-info">
            <h2 id="perfil-nombre-display">${perfil.nombre || '—'}</h2>
            <span class="perfil-badge-rol rol-${rol}">${rolLabel}</span>
            <p class="perfil-avatar-hint">Toca la foto para cambiarla · JPG, PNG o WEBP · Máx. 2 MB</p>
            ${perfil.avatar_url ? `
            <button id="btn-eliminar-foto" onclick="eliminarFotoPerfil()" type="button"
              style="margin-top:10px;background:none;border:1px solid #fca5a5;color:#ef4444;padding:5px 13px;border-radius:7px;font-size:0.75rem;font-weight:600;cursor:pointer;transition:background .18s,color .18s;"
              onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">
              🗑 Eliminar foto
            </button>` : ''}
          </div>
        </div>
        <div id="perfil-avatar-toast" class="perfil-toast"></div>
      </div>
    </div>

    <!-- ── CARD DATOS PERSONALES ── -->
    <div class="perfil-card">
      <div class="perfil-card-header">
        <div class="perfil-card-header-icon icon-verde">📋</div>
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
            <span class="perfil-lock-hint">🔒 No editable</span>
          </div>
          <div class="perfil-field">
            <label>Identificación</label>
            <input type="text" value="${perfil.numero_identificacion || '—'}" class="perfil-readonly" disabled>
            <span class="perfil-lock-hint">🔒 No editable</span>
          </div>
        </div>
        <div class="perfil-field">
          <label>Número de teléfono</label>
          <div class="perfil-tel-wrap">
            <input type="tel" id="perfil-input-tel" value="${perfil.telefono || ''}" placeholder="+57 300 000 0000" maxlength="20" readonly>
            <button class="perfil-tel-edit-btn" onclick="abrirModalTel()" type="button">✏️ Editar</button>
          </div>
        </div>
        <button class="perfil-save-btn" id="perfil-btn-guardar" onclick="guardarPerfil()" type="button">
          💾 Guardar cambios
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
        <div class="perfil-modal-icon modal-icon-warning">⚠️</div>
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
        <div class="perfil-modal-icon modal-icon-lock">🔐</div>
        <h3>Confirma tu contraseña</h3>
        <p>Por seguridad, ingresa tu contraseña actual para aplicar este cambio.</p>
        <div class="perfil-field">
          <label>Contraseña actual</label>
          <input type="password" id="perfil-pass-confirm" placeholder="Tu contraseña" autocomplete="current-password">
        </div>
        <div id="perfil-modal-toast" class="perfil-toast"></div>
        <div class="perfil-modal-actions" style="margin-top:14px;">
          <button class="btn-modal-primary" id="pstep2-btn" onclick="guardarCambioTel()" type="button">
            ✅ Guardar cambio
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
    mostrarPerfilToast('perfil-main-toast', '❌ El nombre no puede estar vacío.', 'error');
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

    mostrarPerfilToast('perfil-main-toast', '✅ Cambios guardados correctamente.', 'exito');
  } catch (e) {
    mostrarPerfilToast('perfil-main-toast', '❌ ' + (e.message || 'Error al guardar.'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '💾 Guardar cambios';
  }
}

// ── Guardar descripción soporte ────────────────────────────
async function guardarDescripcion() {
  const btn  = document.getElementById('perfil-btn-desc');
  const desc = document.getElementById('perfil-input-descripcion')?.value.trim();
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '⏳ Guardando…';
  try {
    await apiFetch(`/users/${_perfilDatos.uid}/perfil`, {
      method: 'PATCH',
      body: JSON.stringify({ descripcion: desc })
    });
    _perfilDatos.descripcion = desc;
    mostrarPerfilToast('perfil-desc-toast', '✅ Descripción guardada correctamente.', 'exito');
  } catch (e) {
    mostrarPerfilToast('perfil-desc-toast', '❌ ' + (e.message || 'Error al guardar.'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '💾 Guardar descripción';
  }
}

// ── Subir foto de perfil ───────────────────────────────────
async function subirFotoPerfil(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    mostrarPerfilToast('perfil-avatar-toast', '❌ La imagen no debe superar 2 MB.', 'error');
    return;
  }

  const ext   = file.name.split('.').pop();
  const path  = `avatars/${_perfilDatos.uid}.${ext}`;

  mostrarPerfilToast('perfil-avatar-toast', '⏳ Subiendo imagen…', '');

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

    mostrarPerfilToast('perfil-avatar-toast', '✅ Foto actualizada correctamente.', 'exito');
  } catch (err) {
    mostrarPerfilToast('perfil-avatar-toast', '❌ ' + (err.message || 'Error al subir la imagen.'), 'error');
  }

  e.target.value = '';
}

// ── Eliminar foto de perfil ─────────────────────────────────
async function eliminarFotoPerfil() {
  const btn = document.getElementById('btn-eliminar-foto');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '⏳ Eliminando…';

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
    mostrarPerfilToast('perfil-avatar-toast', '✅ Foto de perfil eliminada.', 'exito');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '🗑 Eliminar foto';
    mostrarPerfilToast('perfil-avatar-toast', '❌ ' + (err.message || 'Error al eliminar.'), 'error');
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
    mostrarPerfilToast('perfil-modal-toast', '❌ Ingresa tu contraseña.', 'error');
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
    mostrarPerfilToast('perfil-main-toast', '✅ Número de teléfono actualizado.', 'exito');
  } catch (err) {
    mostrarPerfilToast('perfil-modal-toast', '❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✅ Guardar cambio';
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
