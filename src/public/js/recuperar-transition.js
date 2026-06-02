/* ===================================================
   recuperar-transition.js
   PQRS La Tiburona — Animación "¿Olvidaste tu contraseña?"
   Pegar en /src/public/js/recuperar-transition.js
   Linkear en index.html DESPUÉS de auth.js
   =================================================== */

(function () {
  'use strict';

  /* ── Referencias DOM ── */
  function getTabs()       { return document.querySelector('.tabs'); }
  function getViewport()   { return document.querySelector('.tabs-viewport'); }
  function getRecuperar()  { return document.getElementById('panel-recuperar'); }
  function getPanelLogin() { return document.getElementById('panel-login'); }

  /* ── Duración base en ms ── */
  const DUR = 320;

  /* ────────────────────────────────────────────────
     MOSTRAR RECUPERAR
     1. Tabs se encogen y desvanecen hacia arriba
     2. El viewport colapsa su altura
     3. Panel recuperar aparece deslizando desde abajo
  ──────────────────────────────────────────────── */
  function mostrarRecuperarAnimado() {
    const tabs      = getTabs();
    const viewport  = getViewport();
    const recuperar = getRecuperar();

    if (!tabs || !recuperar) return;

    /* — Ocultar tabs con fade + slide hacia arriba — */
    tabs.style.overflow   = 'hidden';
    tabs.style.transition = `max-height ${DUR}ms cubic-bezier(0.4,0,0.2,1),
                              opacity    ${DUR * 0.8}ms ease,
                              margin-bottom ${DUR}ms ease`;
    tabs.style.maxHeight     = tabs.scrollHeight + 'px';
    tabs.style.opacity       = '1';
    tabs.getBoundingClientRect(); // reflow
    tabs.style.maxHeight     = '0px';
    tabs.style.opacity       = '0';
    tabs.style.marginBottom  = '0';

    /* — Preparar panel recuperar: fuera de flujo, invisible, abajo — */
    recuperar.style.display   = 'block';
    recuperar.style.opacity   = '0';
    recuperar.style.transform = 'translateY(24px)';
    recuperar.style.transition = 'none';
    recuperar.getBoundingClientRect();

    /* — Animar entrada del panel recuperar tras un pequeño delay — */
    setTimeout(() => {
      recuperar.style.transition = `opacity ${DUR}ms ease,
                                    transform ${DUR}ms cubic-bezier(0.34,1.1,0.64,1)`;
      recuperar.style.opacity   = '1';
      recuperar.style.transform = 'translateY(0)';
    }, DUR * 0.4);

    /* — Limpiar estilos tras la animación — */
    setTimeout(() => {
      tabs.style.display = 'none'; // ya invisible, sacarlo del flujo
      tabs.style.transition    = '';
      tabs.style.maxHeight     = '';
      tabs.style.opacity       = '';
      tabs.style.marginBottom  = '';
      tabs.style.overflow      = '';

      recuperar.style.transition = '';
      recuperar.style.opacity    = '';
      recuperar.style.transform  = '';
    }, DUR * 1.6);
  }

  /* ────────────────────────────────────────────────
     VOLVER AL LOGIN
     1. Panel recuperar se desvanece hacia abajo
     2. Tabs vuelven a aparecer deslizando desde arriba
  ──────────────────────────────────────────────── */
  function irALoginAnimado() {
    const tabs      = getTabs();
    const recuperar = getRecuperar();

    if (!tabs || !recuperar) return;

    /* — Salida del panel recuperar — */
    recuperar.style.transition = `opacity ${DUR * 0.7}ms ease,
                                  transform ${DUR * 0.7}ms cubic-bezier(0.4,0,1,1)`;
    recuperar.style.opacity   = '0';
    recuperar.style.transform = 'translateY(16px)';

    /* — Restaurar tabs desde display:none y animar entrada — */
    setTimeout(() => {
      recuperar.style.display = 'none';
      recuperar.style.transition = '';
      recuperar.style.opacity    = '';
      recuperar.style.transform  = '';

      /* Restaurar estado de tabs */
      tabs.style.display      = '';
      tabs.style.overflow     = 'hidden';
      tabs.style.maxHeight    = '0px';
      tabs.style.opacity      = '0';
      tabs.style.marginBottom = '0';
      tabs.style.transition   = 'none';
      tabs.getBoundingClientRect();

      const alturaReal = (() => {
        tabs.style.maxHeight = 'none';
        const h = tabs.scrollHeight;
        tabs.style.maxHeight = '0px';
        return h;
      })();

      tabs.style.transition   = `max-height ${DUR}ms cubic-bezier(0.34,1.1,0.64,1),
                                  opacity    ${DUR * 0.9}ms ease,
                                  margin-bottom ${DUR}ms ease`;
      tabs.style.maxHeight    = alturaReal + 'px';
      tabs.style.opacity      = '1';
      tabs.style.marginBottom = ''; // restaura el valor CSS original

      setTimeout(() => {
        tabs.style.transition   = '';
        tabs.style.maxHeight    = '';
        tabs.style.opacity      = '';
        tabs.style.overflow     = '';
      }, DUR * 1.2);

    }, DUR * 0.6);
  }

  /* ── Patch de las funciones globales de auth.js ── */
  function patchear() {
    const origMostrar = window.mostrarRecuperar;
    const origVolver  = window.irALogin;

    if (typeof origMostrar !== 'function' || typeof origVolver !== 'function') {
      return false;
    }

    window.mostrarRecuperar = function () {
      /* Ejecutar la lógica original de auth.js (estado, reset form, etc.)
         EXCEPTO el show/hide de tabs que usa '.card-tabs' (clase inexistente) */
      origMostrar.apply(this, arguments);
      /* El original no encontró '.card-tabs' así que los tabs siguen visibles.
         Nosotros los animamos aquí: */
      mostrarRecuperarAnimado();
    };

    window.irALogin = function () {
      /* Animamos la salida ANTES de que auth.js restaure los paneles */
      irALoginAnimado();
      /* Llamar al original con un pequeño delay para que coincida
         con cuando el panel recuperar ya está oculto */
      setTimeout(() => {
        origVolver.apply(this, arguments);
      }, DUR * 0.6);
    };

    return true;
  }

  /* ── Init con reintentos (auth.js puede cargar después) ── */
  function init() {
    if (!patchear()) {
      let intentos = 0;
      const iv = setInterval(() => {
        intentos++;
        if (patchear() || intentos > 40) clearInterval(iv);
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
