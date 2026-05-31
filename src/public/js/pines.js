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
            ${p.rol === 'admin' ? '👑 Admin' : '🛠 Soporte'}
          </span>
        </td>
        <td style="color:#666;font-size:0.85rem;">${p.descripcion || '—'}</td>
        <td>
          ${p.activo
            ? '<span class="estado estado-resuelto">✅ Activo</span>'
            : '<span class="estado estado-cerrado">🔒 Inactivo</span>'
          }
        </td>
        <td style="font-size:0.8rem;color:#aaa;">${new Date(p.created_at).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${p.activo ? `
              <button class="btn btn-sm"
                style="background:#fff7ed;color:#9a3412;"
                onclick="desactivarPin('${p.id}')">
                🔒 Desactivar
              </button>` : ''}
            <button class="btn btn-sm btn-peligro"
              onclick="eliminarPin('${p.id}')">
              🗑 Eliminar
            </button>
          </div>
        </td>
      </tr>
    `).join('');

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
    document.getElementById('pin-rol-label').textContent = `Rol: ${data.pin.rol === 'admin' ? '👑 Administrador' : '🛠 Soporte técnico'}`;
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
    btnEl.innerHTML = '🎲 Generar PIN';
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