// Estado global
let registros = [];
let seleccionados = new Set();

// ── Inicialización ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    cargarUsuarios();

    document.getElementById('btn-buscar').addEventListener('click', buscarRegistros);
    document.getElementById('btn-sel-todos-usuarios').addEventListener('click', () => toggleTodosUsuarios(true));
    document.getElementById('btn-desel-todos-usuarios').addEventListener('click', () => toggleTodosUsuarios(false));
    document.getElementById('btn-modificar').addEventListener('click', abrirModalModificar);
    document.getElementById('btn-borrar').addEventListener('click', borrarSeleccionados);
    document.getElementById('btn-modal-cerrar').addEventListener('click', cerrarModal);
    document.getElementById('btn-modal-cancelar').addEventListener('click', cerrarModal);
    document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-overlay')) cerrarModal();
    });
    document.getElementById('form-modificar').addEventListener('submit', guardarModificacion);
    document.getElementById('btn-deselect').addEventListener('click', deseleccionarTodo);
    document.getElementById('check-all').addEventListener('change', toggleTodosRegistros);

    // Cerrar modal con Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') cerrarModal();
    });
});

// ── Usuarios ──────────────────────────────────────────────────────────────────

function cargarUsuarios() {
    fetch(BASE_PATH + '/api/usuarios')
        .then(r => r.json())
        .then(data => {
            const lista = document.getElementById('usuarios-lista');
            if (!data.usuarios || !data.usuarios.length) {
                lista.innerHTML = '<p class="sin-responsables">No hay usuarios disponibles.</p>';
                return;
            }
            lista.innerHTML = data.usuarios.map(u => `
                <label class="check-item">
                    <input type="checkbox" class="cb-usuario" value="${u.id}">
                    <span>${escHtml(u.name)}</span>
                    ${u.login ? `<span class="usuario-login">${escHtml(u.login)}</span>` : ''}
                </label>
            `).join('');

            lista.querySelectorAll('.cb-usuario').forEach(cb => {
                cb.addEventListener('change', actualizarContadorUsuarios);
            });
        })
        .catch(() => {
            document.getElementById('usuarios-lista').innerHTML =
                '<p class="alerta error" style="margin-bottom:0">Error al cargar los usuarios.</p>';
        });
}

function toggleTodosUsuarios(marcar) {
    document.querySelectorAll('.cb-usuario').forEach(cb => { cb.checked = marcar; });
    actualizarContadorUsuarios();
}

function actualizarContadorUsuarios() {
    const n  = document.querySelectorAll('.cb-usuario:checked').length;
    const el = document.getElementById('usuarios-contador');
    el.textContent = n > 0 ? `${n} usuario${n !== 1 ? 's' : ''} seleccionado${n !== 1 ? 's' : ''}` : '';
}

// ── Búsqueda de registros ─────────────────────────────────────────────────────

function buscarRegistros() {
    const usuarios     = [...document.querySelectorAll('.cb-usuario:checked')].map(cb => cb.value);
    const fechaInicio  = document.getElementById('fecha-inicio').value;
    const fechaFin     = document.getElementById('fecha-fin').value;

    if (!usuarios.length) {
        alert('Selecciona al menos un usuario.');
        return;
    }
    if (!fechaInicio || !fechaFin) {
        alert('Introduce el rango de fechas.');
        return;
    }
    if (fechaInicio > fechaFin) {
        alert('La fecha de inicio no puede ser posterior a la fecha fin.');
        return;
    }

    const seccion = document.getElementById('registros-seccion');
    seccion.style.display = 'block';
    document.getElementById('registros-cargando').style.display = 'block';
    document.getElementById('tabla-wrapper').style.display     = 'none';
    document.getElementById('registros-vacio').style.display   = 'none';

    seleccionados.clear();
    actualizarAcciones();

    const params = new URLSearchParams();
    usuarios.forEach(id => params.append('usuarios', id));
    params.set('fecha_inicio', fechaInicio);
    params.set('fecha_fin', fechaFin);

    fetch(BASE_PATH + '/api/registros?' + params.toString())
        .then(r => r.json())
        .then(data => {
            document.getElementById('registros-cargando').style.display = 'none';
            registros = data.registros || [];

            if (!registros.length) {
                document.getElementById('registros-vacio').style.display = 'block';
                document.getElementById('registros-titulo').textContent  = 'Registros de horas';
                return;
            }

            document.getElementById('registros-titulo').textContent = `Registros de horas (${registros.length})`;
            renderTabla();
        })
        .catch(() => {
            document.getElementById('registros-cargando').style.display  = 'none';
            const vacio = document.getElementById('registros-vacio');
            vacio.textContent  = 'Error al cargar los registros.';
            vacio.style.display = 'block';
        });
}

// ── Tabla ─────────────────────────────────────────────────────────────────────

function renderTabla() {
    const tbody = document.getElementById('registros-tbody');
    tbody.innerHTML = registros.map(r => `
        <tr data-id="${r.id}" class="${seleccionados.has(String(r.id)) ? 'fila-seleccionada' : ''}">
            <td style="text-align:center;">
                <input type="checkbox" class="cb-registro" value="${r.id}"
                       ${seleccionados.has(String(r.id)) ? 'checked' : ''}>
            </td>
            <td>${escHtml(r.fecha)}</td>
            <td class="celda-persona">${escHtml(r.usuario)}</td>
            <td>${escHtml(r.proyecto)}</td>
            <td>${escHtml(r.actividad)}</td>
            <td class="celda-paquete">${escHtml(r.paquete)}</td>
            <td class="col-horas">${Number(r.horas).toFixed(2)}</td>
            <td class="celda-comentario">${escHtml(r.comentario)}</td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.cb-registro').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) seleccionados.add(cb.value);
            else seleccionados.delete(cb.value);
            cb.closest('tr').classList.toggle('fila-seleccionada', cb.checked);
            actualizarAcciones();
        });
    });

    document.getElementById('tabla-wrapper').style.display = 'block';
    document.getElementById('check-all').checked           = false;
    document.getElementById('check-all').indeterminate     = false;
    actualizarAcciones();
}

function toggleTodosRegistros() {
    const checked = document.getElementById('check-all').checked;
    seleccionados.clear();
    document.querySelectorAll('.cb-registro').forEach(cb => {
        cb.checked = checked;
        cb.closest('tr').classList.toggle('fila-seleccionada', checked);
        if (checked) seleccionados.add(cb.value);
    });
    actualizarAcciones();
}

function deseleccionarTodo() {
    seleccionados.clear();
    document.querySelectorAll('.cb-registro').forEach(cb => {
        cb.checked = false;
        cb.closest('tr').classList.remove('fila-seleccionada');
    });
    document.getElementById('check-all').checked       = false;
    document.getElementById('check-all').indeterminate = false;
    actualizarAcciones();
}

function actualizarAcciones() {
    const n        = seleccionados.size;
    const total    = document.querySelectorAll('.cb-registro').length;
    const btnMod   = document.getElementById('btn-modificar');
    const btnBor   = document.getElementById('btn-borrar');
    const selInfo  = document.getElementById('sel-info');
    const checkAll = document.getElementById('check-all');

    btnMod.disabled = n !== 1;
    btnBor.disabled = n === 0;

    if (n > 0) {
        selInfo.style.display = 'flex';
        document.getElementById('sel-cuenta').textContent =
            `${n} registro${n !== 1 ? 's' : ''} seleccionado${n !== 1 ? 's' : ''}`;
    } else {
        selInfo.style.display = 'none';
    }

    if (n === 0)         { checkAll.checked = false; checkAll.indeterminate = false; }
    else if (n === total) { checkAll.checked = true;  checkAll.indeterminate = false; }
    else                  { checkAll.indeterminate = true; }
}

// ── Modal modificar ───────────────────────────────────────────────────────────

function abrirModalModificar() {
    if (seleccionados.size !== 1) return;
    const id      = [...seleccionados][0];
    const registro = registros.find(r => String(r.id) === String(id));
    if (!registro) return;

    document.getElementById('mod-id').value          = registro.id;
    document.getElementById('mod-lock').value        = registro.lockVersion;
    document.getElementById('mod-fecha').value       = registro.fecha;
    document.getElementById('mod-horas').value       = registro.horas;
    document.getElementById('mod-comentario').value  = registro.comentario;
    document.getElementById('modal-error').style.display = 'none';

    const btnGuardar = document.getElementById('btn-modal-guardar');
    btnGuardar.disabled    = false;
    btnGuardar.textContent = 'Guardar cambios';

    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('mod-fecha').focus();
}

function cerrarModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

function guardarModificacion(e) {
    e.preventDefault();

    const id      = document.getElementById('mod-id').value;
    const payload = {
        lockVersion: parseInt(document.getElementById('mod-lock').value, 10),
        fecha:       document.getElementById('mod-fecha').value,
        horas:       parseFloat(document.getElementById('mod-horas').value),
        comentario:  document.getElementById('mod-comentario').value
    };

    const btnGuardar = document.getElementById('btn-modal-guardar');
    btnGuardar.disabled    = true;
    btnGuardar.textContent = 'Guardando…';

    fetch(BASE_PATH + '/api/registro/' + id, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(data => {
        btnGuardar.disabled    = false;
        btnGuardar.textContent = 'Guardar cambios';

        if (data.ok) {
            cerrarModal();
            const idx = registros.findIndex(r => String(r.id) === String(id));
            if (idx !== -1) {
                registros[idx].fecha      = payload.fecha;
                registros[idx].horas      = payload.horas;
                registros[idx].comentario = payload.comentario;
            }
            renderTabla();
        } else {
            mostrarErrorModal(data.error || 'Error al modificar el registro.');
        }
    })
    .catch(() => {
        btnGuardar.disabled    = false;
        btnGuardar.textContent = 'Guardar cambios';
        mostrarErrorModal('Error de conexión.');
    });
}

function mostrarErrorModal(msg) {
    const el = document.getElementById('modal-error');
    el.textContent    = msg;
    el.style.display  = 'flex';
}

// ── Borrar seleccionados ──────────────────────────────────────────────────────

function borrarSeleccionados() {
    const ids = [...seleccionados];
    if (!ids.length) return;

    const msg = ids.length === 1
        ? '¿Estás seguro de que quieres borrar este registro?'
        : `¿Estás seguro de que quieres borrar estos ${ids.length} registros?`;
    if (!confirm(msg)) return;

    const btn = document.getElementById('btn-borrar');
    btn.disabled    = true;
    btn.textContent = 'Borrando…';

    Promise.all(ids.map(id =>
        fetch(BASE_PATH + '/api/registro/' + id, { method: 'DELETE' })
            .then(r => ({ id, ok: r.ok }))
            .catch(() => ({ id, ok: false }))
    )).then(results => {
        btn.textContent = 'Borrar seleccionados';

        const borrados = new Set(results.filter(r => r.ok).map(r => String(r.id)));
        const fallidos = results.filter(r => !r.ok).length;

        registros = registros.filter(r => !borrados.has(String(r.id)));
        seleccionados.clear();

        if (registros.length === 0) {
            document.getElementById('tabla-wrapper').style.display  = 'none';
            document.getElementById('registros-vacio').style.display = 'block';
            document.getElementById('registros-titulo').textContent  = 'Registros de horas';
        } else {
            document.getElementById('registros-titulo').textContent = `Registros de horas (${registros.length})`;
            renderTabla();
        }

        if (fallidos > 0) {
            alert(`No se pudieron borrar ${fallidos} registro${fallidos !== 1 ? 's' : ''}.`);
        }
    });
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
