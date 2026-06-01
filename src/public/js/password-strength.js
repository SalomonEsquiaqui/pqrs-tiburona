/* ===================================================
   password-strength.js
   PQRS La Tiburona — Indicador de fortaleza
   Pegar en /src/public/js/password-strength.js
   y linkear en index.html ANTES de cerrar </body>
   =================================================== */

(function () {
  'use strict';

  /* ── Configuración ────────────────────────────── */
  const CFG = {
    campoPass:    'reg-pass',      // id del input contraseña
    campoConfirm: 'reg-pass2',     // id del input confirmar
    insertarDespuesDe: 'reg-pass', // id del input tras el que se inyecta la barra
  };

  /* ── Requisitos evaluados ─────────────────────── */
  const REQUISITOS = [
    { id: 'len',     label: 'Mín. 8 caracteres',  test: p => p.length >= 8           },
    { id: 'upper',   label: 'Mayúscula',           test: p => /[A-Z]/.test(p)         },
    { id: 'number',  label: 'Número',              test: p => /[0-9]/.test(p)         },
    { id: 'special', label: 'Símbolo (!@#…)',      test: p => /[^A-Za-z0-9]/.test(p) },
  ];

  /* ── Calcular nivel 0-4 ───────────────────────── */
  function calcularNivel(pass) {
    if (!pass) return 0;
    const cumplidos = REQUISITOS.filter(r => r.test(pass)).length;
    // Nivel extra: longitud >= 12 sube un punto (max 4)
    const bonus = pass.length >= 12 ? 1 : 0;
    return Math.min(4, cumplidos + bonus > 0 ? cumplidos : 0);
  }

  const ETIQUETAS = ['', 'Muy débil', 'Débil', 'Media', '¡Fuerte!'];
  const COLORES   = ['nivel-0', 'nivel-1', 'nivel-2', 'nivel-3', 'nivel-4'];

  /* ── Construir HTML del widget ────────────────── */
  function crearWidget() {
    // Barra
    const segs = Array.from({ length: 4 }, (_, i) =>
      `<div class="pass-strength-seg" id="ps-seg-${i}"></div>`
    ).join('');

    // Checklist
    const items = REQUISITOS.map(r =>
      `<li class="pass-req-item" id="ps-req-${r.id}">${r.label}</li>`
    ).join('');

    return `
<div class="pass-strength-wrap" id="pass-strength-widget">
  <div class="pass-strength-bar">${segs}</div>
  <div class="pass-strength-footer">
    <span class="pass-strength-label nivel-0" id="ps-label">Escribe tu contraseña</span>
    <ul class="pass-req-list">${items}</ul>
  </div>
</div>`;
  }

  /* ── Inyectar widget en el DOM ────────────────── */
  function inyectarWidget() {
    const input = document.getElementById(CFG.insertarDespuesDe);
    if (!input) return;

    // Buscar el .input-pass-wrap padre
    const wrap = input.closest('.input-pass-wrap') || input.parentElement;
    const tmp  = document.createElement('div');
    tmp.innerHTML = crearWidget();
    wrap.insertAdjacentElement('afterend', tmp.firstElementChild);
  }

  /* ── Inyectar hint de match bajo campo confirmar ── */
  function inyectarMatchHint() {
    const input = document.getElementById(CFG.campoConfirm);
    if (!input) return;
    const wrap = input.closest('.input-pass-wrap') || input.parentElement;
    const hint = document.createElement('p');
    hint.id = 'ps-match-hint';
    hint.className = 'pass-match-hint match-empty';
    hint.textContent = ' '; // espacio para mantener altura
    wrap.insertAdjacentElement('afterend', hint);
  }

  /* ── Actualizar barra + checklist ─────────────── */
  function actualizarBarra(pass) {
    const nivel   = calcularNivel(pass);
    const label   = document.getElementById('ps-label');
    const segs    = Array.from({ length: 4 }, (_, i) => document.getElementById(`ps-seg-${i}`));

    // Limpiar niveles anteriores en los segmentos
    segs.forEach((seg, i) => {
      // Quitar todas las clases de nivel y activo
      seg.className = 'pass-strength-seg';
      if (i < nivel) {
        seg.classList.add(`nivel-${nivel}`, 'activo');
      }
    });

    // Etiqueta
    if (label) {
      label.className = `pass-strength-label ${COLORES[nivel]}`;
      label.textContent = pass.length === 0
        ? 'Escribe tu contraseña'
        : ETIQUETAS[nivel] || '';
    }

    // Checklist
    REQUISITOS.forEach(r => {
      const li = document.getElementById(`ps-req-${r.id}`);
      if (!li) return;
      li.classList.toggle('ok', r.test(pass));
    });
  }

  /* ── Actualizar hint de confirmación ──────────── */
  function actualizarMatch(pass, confirm) {
    const hint = document.getElementById('ps-match-hint');
    if (!hint) return;

    if (!confirm) {
      hint.className   = 'pass-match-hint match-empty';
      hint.textContent = ' ';
      return;
    }

    if (pass === confirm) {
      hint.className   = 'pass-match-hint match-ok';
      hint.textContent = '✓ Las contraseñas coinciden';
    } else {
      hint.className   = 'pass-match-hint match-fail';
      hint.textContent = '✕ Las contraseñas no coinciden';
    }
  }

  /* ── Inicializar listeners ────────────────────── */
  function init() {
    const inputPass    = document.getElementById(CFG.campoPass);
    const inputConfirm = document.getElementById(CFG.campoConfirm);

    if (!inputPass) return; // no estamos en la página de registro

    inyectarWidget();
    inyectarMatchHint();

    inputPass.addEventListener('input', () => {
      actualizarBarra(inputPass.value);
      if (inputConfirm) actualizarMatch(inputPass.value, inputConfirm.value);
    });

    if (inputConfirm) {
      inputConfirm.addEventListener('input', () => {
        actualizarMatch(inputPass.value, inputConfirm.value);
      });
    }
  }

  /* ── Arrancar cuando el DOM esté listo ────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
