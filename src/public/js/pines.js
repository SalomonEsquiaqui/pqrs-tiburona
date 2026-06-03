// ===== GESTIÓN DE PINes — ADMIN =====

let ultimoPinGenerado = null;

// ── Cargar tabla de PINes ─────────────────────────────────────────────────
async function cargarPines() {
  const tbody = document.getElementById('tabla-pines');
  if (!tbody) return;

  const rol = document.getElementById('filtro-pin-rol')?.value || '';
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#aaa;">Cargando...</td></tr>';

  try {
    const url = rol ? `/pines?rol=${rol}` : '/pines';
    const data = await apiFetch(url);

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#aaa;">No hay PINes creados aún.</td></tr>';
      return;
    }

    if (window.innerWidth <= 768) {
      _renderPinesMobile(data, tbody);
    } else {
      const tablaWrap = tbody.closest('.tabla-wrap');
      if (tablaWrap) tablaWrap.style.display = '';
      const cards = document.getElementById('cards-mobile-pines');
      if (cards) cards.style.display = 'none';
      tbody.innerHTML = data.map(p => `
        <tr>
          <td>
            <span style="font-family:'Courier New',monospace;font-size:1.2rem;font-weight:900;
                  letter-spacing:0.15em;color:${p.activo ? 'var(--azul-rey)' : '#aaa'};">
              ${p.pin}
            </span>
          </td>
          <td>
            <span class="badge ${p.rol === 'admin' ? 'badge-admin' : 'badge-soporte'}">
              ${p.rol === 'admin' ? '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="5" y1="20" x2="19" y2="20"/></svg></span> Admin' : '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span> Soporte'}
            </span>
          </td>
          <td style="color:#666;font-size:0.85rem;">${p.descripcion || '—'}</td>
          <td>
            ${p.activo
              ? '<span class="estado estado-resuelto">✅ Activo</span>'
              : '<span class="estado estado-cerrado"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> Inactivo</span>'
            }
          </td>
          <td style="font-size:0.8rem;color:#aaa;">${new Date(p.created_at).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}</td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${p.activo ? `
                <button class="btn btn-sm"
                  style="background:#fff7ed;color:#9a3412;"
                  onclick="desactivarPin('${p.id}')">
                  <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> Desactivar
                </button>` : ''}
              <button class="btn btn-sm btn-peligro"
                onclick="eliminarPin('${p.id}')">
                <span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></span> Eliminar
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#dc2626;">Error cargando PINes: ${err.message}</td></tr>`;
  }
}

// ── Generar nuevo PIN ─────────────────────────────────────────────────────
async function generarPin() {
  const rol      = document.getElementById('pin-rol').value;
  const desc     = document.getElementById('pin-desc').value.trim();
  const btnEl    = document.getElementById('btn-gen-pin');
  const msgEl    = document.getElementById('msg-pines');
  const resEl    = document.getElementById('pin-resultado');

  // Ocultar resultado anterior
  resEl.style.display = 'none';
  msgEl.className = 'mensaje';
  msgEl.textContent = '';

  btnEl.disabled = true;
  btnEl.innerHTML = '<span class="spinner" style="border-top-color:var(--verde-campo);border-color:rgba(0,0,0,0.1);"></span> Generando...';

  try {
    const data = await apiFetch('/pines', {
      method: 'POST',
      body: JSON.stringify({ rol, descripcion: desc || null })
    });

    ultimoPinGenerado = data.pin.pin;

    // Mostrar resultado destacado
    document.getElementById('pin-valor').textContent    = data.pin.pin;
    document.getElementById('pin-rol-label').textContent = `Rol: ${data.pin.rol === 'admin' ? '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="5" y1="20" x2="19" y2="20"/></svg></span> Administrador' : '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span> Soporte técnico'}`;
    document.getElementById('pin-desc-label').textContent = desc ? `"${desc}"` : '';
    resEl.style.display = 'block';

    // Limpiar formulario
    document.getElementById('pin-desc').value = '';

    // Recargar tabla
    await cargarPines();

  } catch (err) {
    msgEl.className = 'mensaje error';
    msgEl.textContent = err.message || 'Error generando el PIN.';
  } finally {
    btnEl.disabled = false;
    btnEl.innerHTML = '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg></span> Generar PIN';
  }
}

// ── Copiar PIN al portapapeles ────────────────────────────────────────────
function copiarPin() {
  if (!ultimoPinGenerado) return;
  navigator.clipboard.writeText(ultimoPinGenerado).then(() => {
    const btn = event.target.closest('button');
    const original = btn.innerHTML;
    btn.innerHTML = '✅ ¡Copiado!';
    setTimeout(() => { btn.innerHTML = original; }, 2000);
  });
}

// ── Desactivar PIN ────────────────────────────────────────────────────────
async function desactivarPin(id) {
  if (!confirm('¿Desactivar este PIN? Ya no podrá usarse para registrarse.')) return;
  try {
    await apiFetch(`/pines/${id}/desactivar`, { method: 'PATCH' });
    await cargarPines();
  } catch (err) {
    alert('Error desactivando: ' + err.message);
  }
}

// ── Eliminar PIN ──────────────────────────────────────────────────────────
async function eliminarPin(id) {
  if (!confirm('¿Eliminar este PIN permanentemente?')) return;
  try {
    await apiFetch(`/pines/${id}`, { method: 'DELETE' });
    await cargarPines();
  } catch (err) {
    alert('Error eliminando: ' + err.message);
  }
}

// ── Inicializar cuando se carga la sección ────────────────────────────────
// Se llama desde mostrarSeccionAdmin en admin.js cuando se activa la sección pines
document.addEventListener('DOMContentLoaded', () => {
  // Si la sección pines ya está visible al cargar (poco probable), cargar datos
  if (document.getElementById('sec-pines')?.style.display !== 'none') {
    cargarPines();
  }
});

// ── RENDER MÓVIL PINES ───────────────────────────────────────────────────────
function _renderPinesMobile(data, tbody) {
  const tablaWrap = tbody.closest('.tabla-wrap');
  if (tablaWrap) tablaWrap.style.display = 'none';

  let cardsWrap = document.getElementById('cards-mobile-pines');
  if (!cardsWrap) {
    cardsWrap = document.createElement('div');
    cardsWrap.id = 'cards-mobile-pines';
    cardsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    if (tablaWrap) tablaWrap.parentNode.insertBefore(cardsWrap, tablaWrap);
    else tbody.parentNode.insertBefore(cardsWrap, tbody);
  }
  cardsWrap.style.display = 'flex';

  cardsWrap.innerHTML = data.map(p => `
    <div style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(15,23,42,.08);border:1px solid #e2e8f0;border-left:4px solid ${p.activo ? '#3b82f6' : '#94a3b8'};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-family:'Courier New',monospace;font-size:1.6rem;font-weight:900;letter-spacing:0.2em;color:${p.activo ? '#1e40af' : '#94a3b8'};">${p.pin}</span>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <span class="badge ${p.rol === 'admin' ? 'badge-admin' : 'badge-soporte'}" style="font-size:0.68rem;">
            ${p.rol === 'admin' ? '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="5" y1="20" x2="19" y2="20"/></svg></span> Admin' : '<span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span> Soporte'}
          </span>
          ${p.activo
            ? '<span style="background:#05966918;color:#059669;border:1px solid #05966940;padding:2px 8px;border-radius:99px;font-size:0.65rem;font-weight:700;">✅ Activo</span>'
            : '<span style="background:#94a3b818;color:#94a3b8;border:1px solid #94a3b840;padding:2px 8px;border-radius:99px;font-size:0.65rem;font-weight:700;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> Inactivo</span>'
          }
        </div>
      </div>
      ${p.descripcion ? `<p style="font-size:0.8rem;color:#64748b;margin-bottom:8px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></span> ${p.descripcion}</p>` : ''}
      <p style="font-size:0.75rem;color:#94a3b8;margin-bottom:12px;"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span> ${new Date(p.created_at).toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'})}</p>
      <div style="display:flex;gap:8px;">
        ${p.activo ? `
        <button class="btn btn-sm" style="flex:1;justify-content:center;min-height:40px;background:#fff7ed;color:#9a3412;border:1.5px solid #fed7aa;"
          onclick="desactivarPin('${p.id}')"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span> Desactivar</button>` : ''}
        <button class="btn btn-sm btn-peligro" style="${p.activo?'':'flex:1;'}justify-content:center;min-height:40px;"
          onclick="eliminarPin('${p.id}')"><span class="ni" style="display:inline-flex;align-items:center;width:1em;height:1em;vertical-align:-0.15em;flex-shrink:0;" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></span> Eliminar</button>
      </div>
    </div>
  `).join('');
}
