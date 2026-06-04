// ===== AUTENTICACIÓN =====

// ── Variables globales de reCAPTCHA (FUERA de DOMContentLoaded) ──────────
// Deben ser globales para que el callback de la API de Google las encuentre
let captchaLoginWidget    = null;
let captchaRegistroWidget = null;
let captchaListo          = false;

// Este callback lo llama la API de Google cuando termina de cargar
window.onRecaptchaLoad = function () {
  captchaLoginWidget = grecaptcha.render('captcha-login', {
    sitekey: RECAPTCHA_SITE_KEY
  });
  captchaRegistroWidget = grecaptcha.render('captcha-registro', {
    sitekey: RECAPTCHA_SITE_KEY
  });
  captchaListo = true;
};

// ── Función auxiliar para obtener token de reCAPTCHA con validación ───────
function getCaptchaToken(widget) {
  if (!captchaListo || widget === null || widget === undefined) return '';
  return grecaptcha.getResponse(widget) || '';
}

document.addEventListener('DOMContentLoaded', () => {
  const { createClient } = supabase;
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── Redirigir si ya hay sesión ──────────────────────────────────────────
  db.auth.getSession().then(async ({ data: { session } }) => {
    if (session) {
      const { data: perfil } = await db.from('users').select('rol').eq('id', session.user.id).single();
      if (perfil) redirigirPorRol(perfil.rol);
    }
  });


  // ── OJO — mostrar/ocultar contraseña ──────────────────────────────────
  document.querySelectorAll('.btn-ojo').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input    = document.getElementById(targetId);
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      btn.querySelector('.ojo-abierto').style.display = visible ? '' : 'none';
      btn.querySelector('.ojo-cerrado').style.display = visible ? 'none' : '';
    });
  });

  // ── TABS ────────────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('activo'));
      btn.classList.add('activo');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('activo'));
      document.getElementById(btn.dataset.panel).classList.add('activo');
      ocultarMensaje('msg-login');
      ocultarMensaje('msg-registro');
    });
  });

  // ── Mostrar/ocultar campo PIN según rol seleccionado ──────────────────
  const selRol   = document.getElementById('reg-rol');
  const grupoPin = document.getElementById('grupo-pin');
  if (selRol) {
    selRol.addEventListener('change', () => {
      const requierePin = ['admin', 'soporte'].includes(selRol.value);
      grupoPin.style.display = requierePin ? 'block' : 'none';
      if (!requierePin) document.getElementById('reg-pin').value = '';
    });
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      ocultarMensaje('msg-login');

      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-pass').value;
      const btnEl    = document.getElementById('btn-login');

      // Validar reCAPTCHA
      const captchaToken = getCaptchaToken(captchaLoginWidget);
      if (!captchaToken) {
        mostrarMensaje('msg-login', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Por favor completa el reCAPTCHA antes de continuar.', 'error');
        return;
      }

      btnEl.disabled = true;
      btnEl.innerHTML = '<span class="spinner"></span> Ingresando...';

      try {
        const result = await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password, captchaToken })
        });

        // Resetear captcha tras envío exitoso
        grecaptcha.reset(captchaLoginWidget);

        // Guardar sesión en localStorage para uso en dashboards
        localStorage.setItem('pqrs_session', JSON.stringify(result.session));
        localStorage.setItem('pqrs_user',    JSON.stringify(result.user));

        // Iniciar sesión en el cliente Supabase del browser
        await db.auth.setSession({
          access_token:  result.session.access_token,
          refresh_token: result.session.refresh_token
        });

        redirigirPorRol(result.user.rol);
      } catch (err) {
        grecaptcha.reset(captchaLoginWidget);
        mostrarMensaje('msg-login', err.message || 'Credenciales incorrectas.', 'error');
        btnEl.disabled = false;
        btnEl.textContent = '🚀 Ingresar al sistema';
      }
    });
  }

  // ── REGISTRO ──────────────────────────────────────────────────────────
  const formRegistro = document.getElementById('form-registro');
  if (formRegistro) {
    formRegistro.addEventListener('submit', async (e) => {
      e.preventDefault();
      ocultarMensaje('msg-registro');

      const nombre    = document.getElementById('reg-nombre').value.trim();
      const email     = document.getElementById('reg-email').value.trim();
      const tel       = document.getElementById('reg-tel').value.trim();
      const tipoId    = document.getElementById('reg-tipo-id').value;
      const numId     = document.getElementById('reg-num-id').value.trim();
      const password  = document.getElementById('reg-pass').value;
      const pass2     = document.getElementById('reg-pass2').value;
      const rol       = document.getElementById('reg-rol').value;
      const pin       = document.getElementById('reg-pin').value.trim();
      const btnEl     = document.getElementById('btn-registro');

      // Validaciones frontend
      if (!tipoId) {
        mostrarMensaje('msg-registro', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Selecciona un tipo de identificación.', 'error');
        return;
      }
      if (!numId) {
        mostrarMensaje('msg-registro', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Ingresa tu número de identificación.', 'error');
        return;
      }
      if (!/^[A-Za-z0-9\-]+$/.test(numId)) {
        mostrarMensaje('msg-registro', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> El número de identificación solo puede contener letras, números y guiones.', 'error');
        return;
      }
      if (password !== pass2) {
        mostrarMensaje('msg-registro', 'Las contraseñas no coinciden.', 'error');
        return;
      }
      if (password.length < 6) {
        mostrarMensaje('msg-registro', 'La contraseña debe tener mínimo 6 caracteres.', 'error');
        return;
      }

      // Validar reCAPTCHA
      const captchaToken = getCaptchaToken(captchaRegistroWidget);
      if (!captchaToken) {
        mostrarMensaje('msg-registro', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Por favor completa el reCAPTCHA antes de continuar.', 'error');
        return;
      }

      btnEl.disabled = true;
      btnEl.innerHTML = '<span class="spinner"></span> Registrando...';

      try {
        await apiFetch('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ nombre, email, telefono: tel, tipo_identificacion: tipoId, numero_identificacion: numId, password, rol, pin, captchaToken })
        });

        // Resetear captcha tras envío exitoso
        grecaptcha.reset(captchaRegistroWidget);

        mostrarMensaje('msg-registro', '✅ ¡Registro exitoso! Ya puedes iniciar sesión.', 'exito');
        formRegistro.reset();
        if (grupoPin) grupoPin.style.display = 'none';

        // Cambiar al tab de login tras 2s
        setTimeout(() => {
          document.querySelector('[data-panel="panel-login"]').click();
        }, 2000);
      } catch (err) {
        grecaptcha.reset(captchaRegistroWidget);
        mostrarMensaje('msg-registro', err.message || 'Error al registrar. Intenta nuevamente.', 'error');
      } finally {
        btnEl.disabled = false;
        btnEl.textContent = '✅ Crear cuenta';
      }
    });
  }
});
// ══════════════════════════════════════════════════════════════════════════════
// RECUPERAR CONTRASEÑA
// ══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
//  RECUPERAR CONTRASEÑA
//  Flujo: correo → hint teléfono → verificar tel (o ID) → nueva pass
// ═══════════════════════════════════════════════════════════

let _recUserId  = null;   // ID del usuario encontrado
let _recTelReal = null;   // Teléfono real (para comparar en frontend tras recibir del backend)

function mostrarRecuperar() {
  // Ocultar paneles login y registro, mostrar recuperar
  document.getElementById('panel-login').style.display    = 'none';
  document.getElementById('panel-registro').style.display = 'none';
  document.getElementById('panel-recuperar').style.display = 'block';
  // Ocultar tabs visualmente pero sin tocar su estado interno
  const tabs = document.querySelector('.card-tabs');
  if (tabs) tabs.style.display = 'none';
  // Reset estado
  _recUserId  = null;
  _recTelReal = null;
  _mostrarPasoRec('rec-paso1');
  ocultarMensaje('msg-recuperar');
  document.getElementById('rec-correo').value = '';
}

function irALogin() {
  // Ocultar recuperar
  document.getElementById('panel-recuperar').style.display = 'none';
  // Restaurar tabs
  const tabs = document.querySelector('.card-tabs');
  if (tabs) tabs.style.display = '';
  // Activar tab login y mostrar su panel correctamente
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('activo'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('activo'));
  const btnLogin    = document.querySelector('[data-panel="panel-login"]');
  const panelLogin  = document.getElementById('panel-login');
  if (btnLogin)   btnLogin.classList.add('activo');
  if (panelLogin) { panelLogin.classList.add('activo'); panelLogin.style.display = ''; }
  // Asegurarse de que registro quede oculto
  const panelReg = document.getElementById('panel-registro');
  if (panelReg) panelReg.style.display = '';
  _recUserId  = null;
  _recTelReal = null;
}

function _mostrarPasoRec(idPaso) {
  ['rec-paso1','rec-paso2','rec-paso2b','rec-paso3','rec-paso4'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === idPaso ? 'block' : 'none';
  });
}

function volverPaso2() {
  ocultarMensaje('msg-recuperar');
  _mostrarPasoRec('rec-paso2');
  document.getElementById('rec-num-id').value = '';
}

function irAMetodoId() {
  ocultarMensaje('msg-recuperar');
  _mostrarPasoRec('rec-paso2b');
  document.getElementById('rec-num-id').value = '';
}

// PASO 1: buscar cuenta por correo y mostrar hint del teléfono
async function buscarCuenta() {
  const correo = document.getElementById('rec-correo').value.trim().toLowerCase();
  if (!correo) {
    mostrarMensaje('msg-recuperar', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Ingresa tu correo electrónico.', 'error');
    return;
  }

  const btn = document.querySelector('#rec-paso1 .btn-primario');
  if (btn) { btn.disabled = true; btn.textContent = 'Buscando...'; }

  try {
    const res = await apiFetch('/auth/buscar-cuenta', {
      method: 'POST',
      body: JSON.stringify({ email: correo })
    });

    if (res.error) {
      mostrarMensaje('msg-recuperar', '❌ ' + res.error, 'error');
      return;
    }

    // Mostrar hint enmascarado del teléfono
    _recUserId = res.userId;
    document.getElementById('rec-tel-hint').textContent = res.telefonoHint;
    document.getElementById('rec-tel-completo').value = '';
    ocultarMensaje('msg-recuperar');
    _mostrarPasoRec('rec-paso2');

  } catch (err) {
    mostrarMensaje('msg-recuperar', '❌ Error de conexión. Verifica tu internet e intenta de nuevo.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Continuar →'; }
  }
}

// PASO 2: verificar teléfono completo
async function verificarTelefono() {
  const telIngresado = document.getElementById('rec-tel-completo').value.trim();
  if (!telIngresado) {
    mostrarMensaje('msg-recuperar', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Ingresa el número de teléfono completo.', 'error');
    return;
  }

  const btn = document.querySelector('#rec-paso2 .btn-primario');
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }

  try {
    const res = await apiFetch('/auth/verify-identity', {
      method: 'POST',
      body: JSON.stringify({ metodo: 'telefono', userId: _recUserId, valor: telIngresado })
    });

    if (res.error) {
      mostrarMensaje('msg-recuperar', '❌ ' + res.error, 'error');
      return;
    }

    document.getElementById('rec-pass-nueva').value = '';
    document.getElementById('rec-pass-confirm').value = '';
    ocultarMensaje('msg-recuperar');
    _mostrarPasoRec('rec-paso3');

  } catch (err) {
    mostrarMensaje('msg-recuperar', '❌ Error de conexión. Intenta de nuevo.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Verificar número'; }
  }
}

// PASO 2B: verificar por número de identificación
async function verificarId() {
  const numId = document.getElementById('rec-num-id').value.trim();
  if (!numId) {
    mostrarMensaje('msg-recuperar', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Ingresa tu número de identificación.', 'error');
    return;
  }

  const btn = document.querySelector('#rec-paso2b .btn-primario');
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }

  try {
    const res = await apiFetch('/auth/verify-identity', {
      method: 'POST',
      body: JSON.stringify({ metodo: 'id', userId: _recUserId, valor: numId })
    });

    if (res.error) {
      mostrarMensaje('msg-recuperar', '❌ ' + res.error, 'error');
      return;
    }

    document.getElementById('rec-pass-nueva').value = '';
    document.getElementById('rec-pass-confirm').value = '';
    ocultarMensaje('msg-recuperar');
    _mostrarPasoRec('rec-paso3');

  } catch (err) {
    mostrarMensaje('msg-recuperar', '❌ Error de conexión. Intenta de nuevo.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Verificar identificación'; }
  }
}

// PASO 3: cambiar contraseña
async function cambiarContrasena() {
  if (!_recUserId) {
    mostrarMensaje('msg-recuperar', '❌ Sesión expirada. Vuelve a verificar tu identidad.', 'error');
    _mostrarPasoRec('rec-paso1');
    return;
  }

  const pass1 = document.getElementById('rec-pass-nueva').value;
  const pass2 = document.getElementById('rec-pass-confirm').value;

  if (!pass1 || pass1.length < 6) {
    mostrarMensaje('msg-recuperar', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> La contraseña debe tener mínimo 6 caracteres.', 'error');
    return;
  }
  if (pass1 !== pass2) {
    mostrarMensaje('msg-recuperar', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Las contraseñas no coinciden.', 'error');
    return;
  }

  const btn = document.querySelector('#rec-paso3 .btn-verde');
  if (btn) { btn.disabled = true; btn.textContent = 'Cambiando...'; }

  try {
    const res = await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId: _recUserId, newPassword: pass1 })
    });

    if (res.error) throw new Error(res.error);

    _recUserId = null;
    _mostrarPasoRec('rec-paso4');
    ocultarMensaje('msg-recuperar');

  } catch (err) {
    mostrarMensaje('msg-recuperar', '❌ ' + (err.message || 'Error al cambiar la contraseña.'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🔐 Cambiar contraseña'; }
  }
}

// Paso 3 — cambiar contraseña
async function cambiarContrasena() {
  if (!_recUserId) {
    mostrarMensaje('msg-recuperar', '❌ Sesión expirada. Vuelve a verificar tu identidad.', 'error');
    volverPaso1();
    return;
  }

  const pass1 = document.getElementById('rec-pass-nueva').value;
  const pass2 = document.getElementById('rec-pass-confirm').value;

  if (!pass1 || pass1.length < 6) {
    mostrarMensaje('msg-recuperar', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> La contraseña debe tener mínimo 6 caracteres.', 'error');
    return;
  }
  if (pass1 !== pass2) {
    mostrarMensaje('msg-recuperar', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline;width:16px;height:16px;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Las contraseñas no coinciden.', 'error');
    return;
  }

  try {
    const res = await apiFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId: _recUserId, newPassword: pass1 })
    });

    if (res.error) throw new Error(res.error);

    // Éxito
    _recUserId = null;
    _mostrarPasoRec('rec-paso4');
    ocultarMensaje('msg-recuperar');

  } catch (err) {
    mostrarMensaje('msg-recuperar', '❌ ' + (err.message || 'Error al cambiar la contraseña.'), 'error');
  }
}
