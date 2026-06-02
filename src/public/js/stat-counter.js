/* ===================================================
   stat-counter.js
   PQRS La Tiburona — Counters animados en stats
   Pegar en /src/public/js/stat-counter.js
   Linkear en dashboard-admin.html ANTES de cerrar </body>
   =================================================== */

(function () {
  'use strict';

  /* ── Configuración ─────────────────────────────── */
  const DURACION_MS  = 900;   // duración total de la animación
  const FPS          = 60;
  const INTERVALO_MS = 1000 / FPS;

  /* Easing: ease-out cúbico — rápido al inicio, suave al final */
  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /* ── Animar un único elemento ─────────────────── */
  function animarContador(el, valorFinal, duracion) {
    if (!el) return;

    const valorInicial = parseInt(el.textContent, 10) || 0;
    const diferencia   = valorFinal - valorInicial;

    // Si no hay cambio, poner directo y salir
    if (diferencia === 0) {
      el.textContent = valorFinal;
      return;
    }

    const inicio = performance.now();
    let rafId;

    function frame(ahora) {
      const transcurrido = ahora - inicio;
      const progreso     = Math.min(transcurrido / duracion, 1);
      const valorActual  = Math.round(valorInicial + diferencia * easeOut(progreso));

      el.textContent = valorActual;

      if (progreso < 1) {
        rafId = requestAnimationFrame(frame);
      } else {
        el.textContent = valorFinal; // asegurar valor exacto al final
        /* Pequeño "pop" al llegar al final */
        el.style.transform = 'scale(1.12)';
        el.style.transition = 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1)';
        setTimeout(() => {
          el.style.transform = 'scale(1)';
          setTimeout(() => {
            el.style.transition = '';
          }, 200);
        }, 20);
      }
    }

    // Cancelar cualquier animación previa en este elemento
    if (el._rafId) cancelAnimationFrame(el._rafId);
    el._rafId = requestAnimationFrame(frame);
  }

  /* ── IDs de los stat-cards ─────────────────────── */
  const STATS_IDS = ['g-total', 'g-pendientes', 'g-en-proceso', 'g-resueltos'];

  /* ── Parchar actualizarStats() de admin.js ──────
     Esperamos a que admin.js defina la función global,
     luego la envolvemos (monkey-patch no-destructivo).
  ─────────────────────────────────────────────────── */
  function patchActualizarStats() {
    const original = window.actualizarStats;
    if (typeof original !== 'function') return false;

    window.actualizarStats = function () {
      /* 1. Capturar valores ANTES de que original los escriba */
      const previos = {};
      STATS_IDS.forEach(id => {
        const el = document.getElementById(id);
        previos[id] = el ? (parseInt(el.textContent, 10) || 0) : 0;
      });

      /* 2. Llamar a la función original — escribe los valores nuevos */
      original.apply(this, arguments);

      /* 3. Leer los valores nuevos y reanimar desde los previos */
      STATS_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const valorNuevo = parseInt(el.textContent, 10) || 0;
        /* Resetear al valor previo para que la animación arranque desde ahí */
        el.textContent = previos[id];
        /* Pequeño delay escalonado entre tarjetas para efecto en cascada */
        const indice = STATS_IDS.indexOf(id);
        setTimeout(() => {
          animarContador(el, valorNuevo, DURACION_MS);
        }, indice * 80); // 80ms entre cada tarjeta
      });
    };

    return true;
  }

  /* ── Añadir clase de animación de entrada a las tarjetas ── */
  function animarEntradaTarjetas() {
    document.querySelectorAll('.stat-card').forEach((card, i) => {
      card.style.opacity   = '0';
      card.style.transform = 'translateY(16px)';
      card.style.transition = `opacity 0.4s ease ${i * 70}ms, transform 0.4s cubic-bezier(0.34,1.3,0.64,1) ${i * 70}ms`;
      /* Forzar reflow */
      card.getBoundingClientRect();
      card.style.opacity   = '1';
      card.style.transform = 'translateY(0)';
      /* Limpiar estilos inline tras la animación para no interferir con hover */
      setTimeout(() => {
        card.style.transition = '';
        card.style.opacity    = '';
        card.style.transform  = '';
      }, 600 + i * 70);
    });
  }

  /* ── Init ──────────────────────────────────────── */
  function init() {
    /* Animar entrada de tarjetas al cargar */
    animarEntradaTarjetas();

    /* Intentar patchear actualizarStats.
       Si admin.js aún no la definió, reintentamos cada 100ms hasta 3s */
    if (!patchActualizarStats()) {
      let intentos = 0;
      const intervalo = setInterval(() => {
        intentos++;
        if (patchActualizarStats() || intentos > 30) {
          clearInterval(intervalo);
        }
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
