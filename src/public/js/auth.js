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
      // Manejar callback de OAuth (Google) — crear perfil si es usuario nuevo
      const isOAuth = session.user?.app_metadata?.provider === 'google';
      if (isOAuth) {
        const { data: perfil } = await db.from('users').select('rol').eq('id', session.user.id).single();
        if (!perfil) {
          // Primera vez con Google — crear registro en tabla users
          const nombre = session.user.user_metadata?.full_name || session.user.email.split('@')[0];
          await db.from('users').insert({
            id:     session.user.id,
            nombre: nombre,
            email:  session.user.email,
            rol:    'usuario',
            telefono: null
          });
          redirigirPorRol('usuario');
        } else {
          redirigirPorRol(perfil.rol);
        }
        return;
      }
      const { data: perfil } = await db.from('users').select('rol').eq('id', session.user.id).single();
      if (perfil) redirigirPorRol(perfil.rol);
    }
  });

  // ── LOGIN CON GOOGLE ──────────────────────────────────────────────────
  window.loginConGoogle = async function() {
    try {
      const { error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/pages/index.html'
        }
      });
      if (error) throw error;
    } catch (err) {
      mostrarMensaje('msg-login', '❌ Error al conectar con Google: ' + err.message, 'error');
    }
  };

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
        mostrarMensaje('msg-login', '⚠️ Por favor completa el reCAPTCHA antes de continuar.', 'error');
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
        mostrarMensaje('msg-registro', '⚠️ Selecciona un tipo de identificación.', 'error');
        return;
      }
      if (!numId) {
        mostrarMensaje('msg-registro', '⚠️ Ingresa tu número de identificación.', 'error');
        return;
      }
      if (!/^[A-Za-z0-9\-]+$/.test(numId)) {
        mostrarMensaje('msg-registro', '⚠️ El número de identificación solo puede contener letras, números y guiones.', 'error');
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
        mostrarMensaje('msg-registro', '⚠️ Por favor completa el reCAPTCHA antes de continuar.', 'error');
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