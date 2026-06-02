/* ===================================================
   tab-transition.js
   PQRS La Tiburona — Transición suave entre tabs
   Pegar en /src/public/js/tab-transition.js
   Linkear en index.html DESPUÉS de auth.js
   =================================================== */

(function () {
  'use strict';

  /* ── Estado ── */
  let transicionando = false;

  /* ── Obtener índice actual activo ── */
  function indexActivo() {
    const btn = document.querySelector('.tab-btn.activo');
    return btn ? parseInt(btn.dataset.index || '0', 10) : 0;
  }

  /* ── Animar cambio de panel ── */
  function cambiarPanel(btnDestino) {
    if (transicionando) return;

    const panelDestinoId = btnDestino.dataset.panel;
    const panelDestino   = document.getElementById(panelDestinoId);
    const panelActual    = document.querySelector('.panel.activo');

    // Si ya está activo, no hacer nada
    if (!panelDestino || panelActual === panelDestino) return;

    const indexActualNum  = indexActivo();
    const indexDestinoNum = parseInt(btnDestino.dataset.index || '0', 10);
    const vaHaciaDerecha  = indexDestinoNum > indexActualNum;

    transicionando = true;

    /* 1. Actualizar tabs visualmente */
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('activo'));
    btnDestino.classList.add('activo');

    /* 2. Fijar la altura del viewport al tamaño del panel actual
          para que no colapse mientras el saliente aún ocupa espacio */
    const viewport = document.querySelector('.tabs-viewport');
    if (viewport) {
      viewport.style.height = panelActual.offsetHeight + 'px';
    }

    /* 3. Preparar panel entrante: lo hacemos visible pero fuera
          del flujo (position:absolute) con el translateX inicial */
    panelDestino.style.position   = 'absolute';
    panelDestino.style.opacity    = '0';
    panelDestino.style.transform  = vaHaciaDerecha ? 'translateX(40px)' : 'translateX(-40px)';
    panelDestino.style.transition = 'none'; // sin transición en la posición inicial
    panelDestino.style.display    = '';     // asegurarse que sea visible para medir

    /* 4. Forzar reflow antes de aplicar las clases de animación */
    panelDestino.getBoundingClientRect();

    /* 5. Aplicar clases de salida al panel actual */
    panelActual.classList.remove('activo');
    panelActual.classList.add('saliendo');
    if (!vaHaciaDerecha) panelActual.classList.add('hacia-derecha');

    /* 6. Activar la transición del entrante en el próximo frame */
    requestAnimationFrame(() => {
      panelDestino.style.transition = ''; // restaurar transición CSS
      panelDestino.classList.add('activo');

      /* 7. Animar la altura del viewport hacia la del panel entrante */
      if (viewport) {
        // Medir la altura real del destino en modo activo
        const alturaDestino = panelDestino.scrollHeight;
        viewport.style.height = alturaDestino + 'px';
      }
    });

    /* 8. Limpiar tras la transición */
    const DURACION = 300; // ms — un poco más que los 280ms del CSS
    setTimeout(() => {
      panelActual.classList.remove('saliendo', 'hacia-derecha');

      // Resetear estilos inline del panel que entró
      panelDestino.style.position  = '';
      panelDestino.style.opacity   = '';
      panelDestino.style.transform = '';
      panelDestino.style.display   = '';

      // Liberar altura fija del viewport
      if (viewport) viewport.style.height = '';

      transicionando = false;

      // Limpiar mensajes de error del panel anterior
      const msgLogin    = document.getElementById('msg-login');
      const msgRegistro = document.getElementById('msg-registro');
      if (msgLogin)    msgLogin.className    = 'mensaje';
      if (msgRegistro) msgRegistro.className = 'mensaje';

    }, DURACION);
  }

  /* ── Parchar el listener de tabs en auth.js ── */
  /*
    auth.js asigna sus listeners en DOMContentLoaded.
    Nosotros esperamos a que el DOM esté listo y luego
    reemplazamos el comportamiento con un capture listener
    que corre PRIMERO y llama a cambiarPanel().
    El listener original de auth.js (que hace classList toggle)
    se ejecuta igualmente — pero nosotros ya manejamos la
    animación antes. Para evitar doble trabajo, prevenimos
    el toggle nativo usando un flag de estado.
  */
  function init() {
    const tabs = document.querySelector('.tabs');
    if (!tabs) return;

    /* Reemplazar completamente la lógica de tabs del auth.js
       usando capture:true para correr antes */
    tabs.addEventListener('click', function (e) {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;

      /* Evitar que auth.js haga su toggle directo */
      e.stopImmediatePropagation();

      cambiarPanel(btn);

      /* Sincronizar mensajes de error */
      const msgLogin    = document.getElementById('msg-login');
      const msgRegistro = document.getElementById('msg-registro');
      if (msgLogin)    { msgLogin.textContent = '';    msgLogin.className    = 'mensaje'; }
      if (msgRegistro) { msgRegistro.textContent = ''; msgRegistro.className = 'mensaje'; }

    }, true /* capture — corre antes que los listeners de bubble */);
  }

  /* ── Exponer cambiarPanel para uso externo (auth.js lo llama al hacer login) ── */
  window.tabTransition = { cambiarPanel };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
