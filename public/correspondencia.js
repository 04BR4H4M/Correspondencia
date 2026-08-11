document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = 'http://localhost:3000/correspondencia';
  const CONFIG_BASE = 'http://localhost:3000/configuracion';

  // --- ELEMENTOS: LAYOUT / NAV ---
  const navItems = document.querySelectorAll('.nav-item[data-section]');
  const views = document.querySelectorAll('.view');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const tipoFilter = document.getElementById('tipoFilter');

  // --- ELEMENTOS: SEGUIMIENTO (tabla) ---
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const deleteSelectedButton = document.getElementById('deleteSelectedButton');
  const tbody = document.querySelector('#section-seguimiento table tbody');
  const paginationControls = document.getElementById('pagination-controls');
  const btnNuevoDesdeSeguimiento = document.getElementById('btnNuevoDesdeSeguimiento');

  // --- ELEMENTOS: RADICACIÓN (form) ---
  const registroForm = document.getElementById('registroForm');
  const radicacionTitle = document.getElementById('radicacionTitle');
  const submitRegistroBtn = document.getElementById('submitRegistroBtn');
  const resetFormBtn = document.getElementById('resetFormBtn');
  const editingBanner = document.getElementById('editingBanner');
  const editingRadicadoLabel = document.getElementById('editingRadicadoLabel');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  // --- ELEMENTOS: MODALES ---
  const detalleModalElement = document.getElementById('detalleModal');
  const detalleModal = new bootstrap.Modal(detalleModalElement);
  const adjuntarModalElement = document.getElementById('adjuntarModal');
  const adjuntarModal = new bootstrap.Modal(adjuntarModalElement);
  const adjuntarForm = document.getElementById('adjuntarForm');

  // --- ELEMENTOS: DOCUMENTOS ---
  const docGrid = document.getElementById('docGrid');
  const docTabs = document.querySelectorAll('.doc-tab');

  // Corrige un bug conocido de Bootstrap: a veces al cerrar un modal no se
  // limpia bien el fondo oscuro (backdrop) ni el bloqueo de scroll del body,
  // dejando la pantalla en gris y todo bloqueado hasta recargar la página.
  // Este listener limpia esos residuos cada vez que CUALQUIER modal se cierra.
  document.addEventListener('hidden.bs.modal', () => {
    // Solo limpiamos si de verdad ya no queda ningún modal abierto.
    const hayModalAbierto = document.querySelector('.modal.show');
    if (hayModalAbierto) return;

    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  });

  // --- ELEMENTOS: NOTIFICACIONES / TOASTS / TUTORIAL ---
  const notifBadge = document.getElementById('notifBadge');
  const notifList = document.getElementById('notifList');
  const toastStack = document.getElementById('toastStack');
  const draftBanner = document.getElementById('draftBanner');
  const discardDraftBtn = document.getElementById('discardDraftBtn');
  const openTutorialBtn = document.getElementById('openTutorialBtn');

  // --- ESTADO ---
  let idParaAdjuntar = null;
  let idParaActualizar = null;
  let currentPage = 1;
  const limit = 10;
  let sortBy = 'id';
  let sortOrder = 'ASC';
  let docFilter = 'todos';

  const DRAFT_KEY = 'correspondencia_draft_v1';
  const TUTORIAL_KEY = 'correspondencia_tutorial_visto';

  // ==========================================================
  // NAVEGACIÓN ENTRE SECCIONES
  // ==========================================================
  function goToSection(section) {
    navItems.forEach(b => b.classList.toggle('active', b.dataset.section === section));
    views.forEach(v => v.classList.toggle('active', v.id === `section-${section}`));
    sidebar.classList.remove('open');

    if (section === 'dashboard') cargarDashboard();
    if (section === 'perfil') cargarPerfil();
    cargarNotificaciones();
    if (section === 'seguimiento') cargarCorrespondencia(1);
    if (section === 'documentos') cargarDocumentos();
  }

  navItems.forEach(btn => btn.addEventListener('click', () => goToSection(btn.dataset.section)));

  sidebarToggle?.addEventListener('click', () => sidebar.classList.toggle('open'));

  btnNuevoDesdeSeguimiento?.addEventListener('click', () => {
    resetRegistroForm();
    goToSection('radicacion');
  });

  // El buscador y el filtro de estado (barra superior) alimentan Seguimiento
  let searchDebounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      if (document.getElementById('section-seguimiento').classList.contains('active')) {
        cargarCorrespondencia(1);
      } else if (searchInput.value.trim()) {
        goToSection('seguimiento');
      }
    }, 300);
  });
  statusFilter.addEventListener('change', () => {
    if (document.getElementById('section-seguimiento').classList.contains('active')) {
      cargarCorrespondencia(1);
    } else {
      goToSection('seguimiento');
    }
  });
  tipoFilter.addEventListener('change', () => {
    if (document.getElementById('section-seguimiento').classList.contains('active')) {
      cargarCorrespondencia(1);
    } else {
      goToSection('seguimiento');
    }
  });

  // Convierte 'YYYY-MM-DD' (o 'YYYY-MM-DDTHH:mm:ss...') en un Date en la ZONA
  // HORARIA LOCAL del navegador. `new Date('YYYY-MM-DD')` interpreta ese string
  // como medianoche UTC, lo que en zonas UTC-negativas (como Bogotá, UTC-5)
  // muestra el día anterior al formatear con toLocaleDateString(). Por eso NO
  // usamos `new Date(fechaString)` directamente para mostrar o comparar fechas.
  const parseFechaLocal = (fecha) => {
    if (!fecha) return null;
    const soloFecha = fecha.toString().split('T')[0];
    const [y, m, d] = soloFecha.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const formatFechaLocal = (fecha) => {
    const d = parseFechaLocal(fecha);
    return d ? d.toLocaleDateString('es-ES') : null;
  };

  // ==========================================================
  // HELPERS COMPARTIDOS
  // ==========================================================
  const getStatusBadgeClass = (estado) => {
    switch (estado) {
      case 'En Proceso': return ['bg-warning'];
      case 'Respondido': return ['bg-secondary', 'text-white'];
      default: return ['bg-success', 'text-white'];
    }
  };

  // Urgencia según fecha de vencimiento: ok / soon (<=3 días) / overdue
  const getUrgency = (estado, fechaVencimiento) => {
    if (estado === 'Respondido' || !fechaVencimiento) return 'ok';
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const fv = parseFechaLocal(fechaVencimiento);
    const diff = Math.round((fv - hoy) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'overdue';
    if (diff <= 3) return 'soon';
    return 'ok';
  };

  const urgencyColorVar = { ok: 'var(--success)', soon: 'var(--warning)', overdue: 'var(--danger)' };
  const urgencyLabel = (estado, fechaVencimiento) => {
    const u = getUrgency(estado, fechaVencimiento);
    if (u === 'overdue') return 'Vencido';
    if (u === 'soon') return 'Por vencer';
    return 'A tiempo';
  };

  async function fetchTodos() {
    const res = await fetch(`${API_BASE}?page=1&limit=1000&sortBy=id&sortOrder=DESC`);
    if (!res.ok) throw new Error('No se pudo cargar la correspondencia');
    return res.json();
  }

  // ==========================================================
  // DASHBOARD
  // ==========================================================
  async function cargarDashboard() {
    const kpiTotal = document.getElementById('kpiTotal');
    const kpiProceso = document.getElementById('kpiProceso');
    const kpiVencidos = document.getElementById('kpiVencidos');
    const kpiRespondido = document.getElementById('kpiRespondido');
    const barChart = document.getElementById('barChart');
    const upcomingList = document.getElementById('upcomingList');

    try {
      const { data, total } = await fetchTodos();

      const counts = { 'Recibido': 0, 'En Proceso': 0, 'Respondido': 0 };
      let vencidos = 0;
      data.forEach(r => {
        counts[r.estado] = (counts[r.estado] || 0) + 1;
        if (getUrgency(r.estado, r.fechaVencimiento) === 'overdue') vencidos++;
      });

      kpiTotal.textContent = total;
      kpiProceso.textContent = counts['En Proceso'];
      kpiVencidos.textContent = vencidos;
      kpiRespondido.textContent = counts['Respondido'];
      document.getElementById('navSeguimientoCount').textContent = total;

      // Bar chart por estado
      const maxCount = Math.max(1, ...Object.values(counts));
      const barColors = { 'Recibido': 'var(--primary)', 'En Proceso': 'var(--warning)', 'Respondido': 'var(--success)' };
      barChart.innerHTML = Object.entries(counts).map(([estado, count]) => `
        <div class="bar-row">
          <div class="label">${estado}</div>
          <div class="track"><div class="fill" style="width:${(count / maxCount) * 100}%; background:${barColors[estado]};"></div></div>
          <div class="count">${count}</div>
        </div>
      `).join('');

      // Próximos a vencer (no respondidos, ordenados por fecha de vencimiento ascendente)
      const proximos = data
        .filter(r => r.estado !== 'Respondido' && r.fechaVencimiento)
        .sort((a, b) => parseFechaLocal(a.fechaVencimiento) - parseFechaLocal(b.fechaVencimiento))
        .slice(0, 6);

      if (proximos.length === 0) {
        upcomingList.innerHTML = `<div class="empty-state"><i class="fas fa-circle-check"></i>No hay radicados pendientes por vencer.</div>`;
      } else {
        const hoyMidnight = new Date(); hoyMidnight.setHours(0, 0, 0, 0);
        upcomingList.innerHTML = proximos.map(r => {
          const u = getUrgency(r.estado, r.fechaVencimiento);
          const dias = Math.round((parseFechaLocal(r.fechaVencimiento) - hoyMidnight) / (1000 * 60 * 60 * 24));
          const diasTexto = dias < 0 ? `${Math.abs(dias)} d. vencido` : (dias === 0 ? 'Vence hoy' : `${dias} d. restantes`);
          return `
            <div class="upcoming-item">
              <span class="urgency-dot bg-urgency-${u}"></span>
              <div class="upcoming-info">
                <div class="radicado mono">${r.radicado}</div>
                <div class="asunto">${r.asunto}</div>
              </div>
              <div class="due urgency-${u}">${diasTexto}</div>
            </div>`;
        }).join('');
      }
    } catch (err) {
      console.error(err);
      barChart.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i>No se pudo cargar el resumen.</div>`;
    }
  }

  // ==========================================================
  // SEGUIMIENTO (tabla)
  // ==========================================================
  const toggleDeleteButton = () => {
    const selectedCheckboxes = document.querySelectorAll('.row-checkbox:checked');
    deleteSelectedButton.classList.toggle('d-none', selectedCheckboxes.length === 0);
  };

  const renderizarPaginacion = (total) => {
    const totalPaginas = Math.ceil(total / limit);
    paginationControls.innerHTML = '';
    if (totalPaginas <= 1) return;

    paginationControls.innerHTML += `
      <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${currentPage - 1}">Anterior</a>
      </li>`;
    for (let i = 1; i <= totalPaginas; i++) {
      paginationControls.innerHTML += `
        <li class="page-item ${i === currentPage ? 'active' : ''}">
          <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>`;
    }
    paginationControls.innerHTML += `
      <li class="page-item ${currentPage === totalPaginas ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${currentPage + 1}">Siguiente</a>
      </li>`;
  };

  const cargarCorrespondencia = (page = 1) => {
    currentPage = page;
    tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4"><div class="loading-spinner"></div> Cargando...</td></tr>';

    const searchTerm = searchInput.value.trim();
    const status = statusFilter.value;
    const tipo = tipoFilter.value;

    let url = `${API_BASE}?page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
    if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
    if (status) url += `&estado=${encodeURIComponent(status)}`;
    if (tipo) url += `&tipoSolicitud=${encodeURIComponent(tipo)}`;

    fetch(url)
      .then(res => res.json())
      .then(({ data, total }) => {
        tbody.innerHTML = '';
        if (data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-muted">No se encontraron registros.</td></tr>';
        }
        data.forEach(registro => {
          const u = getUrgency(registro.estado, registro.fechaVencimiento);
          const fila = `
<tr class="align-middle" style="--row-color:${urgencyColorVar[u]}">
  <td><input class="form-check-input row-checkbox" type="checkbox" value="${registro.id}"></td>
  <td>${registro.id}</td>
  <td class="radicado-cell">${registro.radicado}</td>

  <td>
    <div class="text-truncate-custom" title="${registro.remitente}">
      ${registro.remitente.length > 30
        ? registro.remitente.substring(0, 30) + `... <a href="#" class="ver-mas" data-id="${registro.id}">Ver más</a>`
        : registro.remitente}
    </div>
  </td>

  <td>
    <div class="text-truncate-custom" title="${registro.asunto}">
      ${registro.asunto.length > 40
        ? registro.asunto.substring(0, 40) + `... <a href="#" class="ver-mas" data-id="${registro.id}">Ver más</a>`
        : registro.asunto}
    </div>
  </td>

  <td>${formatFechaLocal(registro.fechaRecibido) || 'N/A'}</td>
  <td>${registro.fechaVencimiento ? formatFechaLocal(registro.fechaVencimiento) : 'N/A'}</td>
  <td>${registro.fechaContestacion ? formatFechaLocal(registro.fechaContestacion) : 'N/A'}</td>

  <td>
    <div class="text-truncate-custom" title="${registro.observaciones || 'Sin observaciones'}">
      ${(registro.observaciones && registro.observaciones.length > 40)
        ? registro.observaciones.substring(0, 40) + `... <a href="#" class="ver-mas" data-id="${registro.id}">Ver más</a>`
        : (registro.observaciones || '<em class="text-muted">Sin observaciones</em>')}
    </div>
  </td>

  <td>
    <select class="form-select form-select-sm status-select ${getStatusBadgeClass(registro.estado).join(' ')}" data-id="${registro.id}">
      <option value="Recibido" ${registro.estado === 'Recibido' ? 'selected' : ''}>📥 Recibido</option>
      <option value="En Proceso" ${registro.estado === 'En Proceso' ? 'selected' : ''}>⚙️ En Proceso</option>
      <option value="Respondido" ${registro.estado === 'Respondido' ? 'selected' : ''}>✅ Respondido</option>
    </select>
  </td>

  <td>
    <div class="btn-group-actions">
      <button class="btn btn-info btn-sm btn-ver" data-id="${registro.id}" title="Ver detalle"><i class="fas fa-eye"></i></button>
      <button class="btn btn-success btn-sm btn-contestar" data-id="${registro.id}" title="Responder"><i class="fas fa-reply"></i></button>
      <button class="btn btn-warning btn-sm btn-editar" data-id="${registro.id}" title="Editar"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger btn-sm btn-eliminar" data-id="${registro.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
    </div>
  </td>
  <td>
    <div class="btn-group-actions">
      <button class="btn btn-secondary btn-sm btn-adjuntar" data-id="${registro.id}" title="Adjuntar archivo"><i class="fas fa-paperclip"></i></button>
      ${registro.archivosAnexos ? `<button class="btn btn-outline-danger btn-sm btn-eliminar-adjunto" data-id="${registro.id}" title="Eliminar archivo adjunto"><i class="fas fa-file-circle-xmark"></i></button>` : ''}
    </div>
  </td>
</tr>`;
          tbody.innerHTML += fila;
        });
        renderizarPaginacion(total);
        toggleDeleteButton();
      })
      .catch(err => {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-danger py-4">Error al cargar los datos</td></tr>';
      });
  };

  selectAllCheckbox.addEventListener('click', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = isChecked);
    toggleDeleteButton();
  });

  tbody.addEventListener('change', (e) => {
    if (e.target.classList.contains('row-checkbox')) toggleDeleteButton();
  });

  deleteSelectedButton.addEventListener('click', () => {
    const selectedIds = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => parseInt(cb.value));
    if (selectedIds.length === 0) return showToast('No hay registros seleccionados.', 'info');
    if (confirm(`¿Eliminar ${selectedIds.length} registros seleccionados?`)) {
      fetch(`${API_BASE}/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      }).then(res => {
        if (!res.ok) throw new Error('Falló el borrado masivo.');
        selectAllCheckbox.checked = false;
        toggleDeleteButton();
        cargarCorrespondencia(currentPage);
        showToast('Registros eliminados con éxito', 'success');
      }).catch(err => {
        console.error(err);
        showToast('No se pudieron eliminar los registros.', 'error');
      });
    }
  });

  paginationControls.addEventListener('click', (e) => {
    e.preventDefault();
    if (e.target.tagName === 'A' && !e.target.parentElement.classList.contains('disabled')) {
      cargarCorrespondencia(parseInt(e.target.dataset.page));
    }
  });

  tbody.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-id]') || event.target;

    if (target.classList.contains('ver-mas')) {
      event.preventDefault();
    }

    if (target.classList.contains('btn-ver') || target.closest('.btn-ver')) {
      const btn = target.classList.contains('btn-ver') ? target : target.closest('.btn-ver');
      const id = btn.dataset.id;
      try {
        const response = await fetch(`${API_BASE}/${id}`);
        const registro = await response.json();
        document.getElementById('detalle-id').textContent = registro.id;
        document.getElementById('detalle-radicado').textContent = registro.radicado;
        document.getElementById('detalle-remitente').textContent = registro.remitente;
        document.getElementById('detalle-tipoSolicitud').textContent = registro.tipoSolicitud;
        document.getElementById('detalle-asunto').textContent = registro.asunto;
        document.getElementById('detalle-fechaRecibido').textContent = registro.fechaRecibido;
        document.getElementById('detalle-fechaVencimiento').textContent = registro.fechaVencimiento || 'N/A';
        document.getElementById('detalle-estado').textContent = registro.estado;
        document.getElementById('detalle-cargoEntidad').textContent = registro.cargoEntidad || 'N/A';
        document.getElementById('detalle-formaEnvio').textContent = registro.formaEnvio || 'N/A';
        document.getElementById('detalle-fechaContestacion').textContent = registro.fechaContestacion || 'N/A';
        document.getElementById('detalle-observaciones').textContent = registro.observaciones || 'N/A';

        const adjuntoContainer = document.getElementById('detalle-adjunto');
        if (registro.archivosAnexos) {
          adjuntoContainer.innerHTML = `<a href="${registro.archivosAnexos}" target="_blank">Ver Archivo en Drive</a>`;
        } else {
          adjuntoContainer.textContent = 'No hay archivos adjuntos.';
        }

        const respuestaWrap = document.getElementById('detalle-respuesta-wrap');
        if (registro.respuestaMensaje) {
          respuestaWrap.classList.remove('d-none');
          document.getElementById('detalle-respuestaFecha').textContent = registro.respuestaEnviadaEn
            ? new Date(registro.respuestaEnviadaEn).toLocaleString('es-ES')
            : 'N/A';
          document.getElementById('detalle-respuestaMensaje').textContent = registro.respuestaMensaje;
          document.getElementById('detalle-respuestaArchivo').innerHTML = registro.archivoRespuesta
            ? `<a href="${registro.archivoRespuesta}" target="_blank">Ver archivo enviado</a>`
            : 'Sin archivo adjunto';
        } else {
          respuestaWrap.classList.add('d-none');
        }

        detalleModal.show();
      } catch (err) {
        console.error(err);
      }
      return;
    }

    if (target.classList.contains('btn-editar') || target.closest('.btn-editar')) {
      const btn = target.classList.contains('btn-editar') ? target : target.closest('.btn-editar');
      const id = btn.dataset.id;
      try {
        const response = await fetch(`${API_BASE}/${id}`);
        const registro = await response.json();
        cargarRegistroEnFormulario(registro);
        goToSection('radicacion');
      } catch (err) {
        console.error(err);
      }
      return;
    }

    if (target.classList.contains('btn-eliminar') || target.closest('.btn-eliminar')) {
      const btn = target.classList.contains('btn-eliminar') ? target : target.closest('.btn-eliminar');
      const id = btn.dataset.id;
      if (confirm(`¿Eliminar registro ID ${id}?`)) {
        fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
          .then(res => {
            if (!res.ok) throw new Error('Error al eliminar el registro.');
            if (tbody.rows.length === 1 && currentPage > 1) currentPage--;
            cargarCorrespondencia(currentPage);
            cargarNotificaciones();
            showToast('Registro eliminado', 'success');
          })
          .catch(err => {
            console.error(err);
            showToast('Error al eliminar el registro.', 'error');
          });
      }
      return;
    }

    if (target.classList.contains('btn-adjuntar') || target.closest('.btn-adjuntar')) {
      const btn = target.classList.contains('btn-adjuntar') ? target : target.closest('.btn-adjuntar');
      abrirModalAdjuntar(btn.dataset.id);
      return;
    }

    if (target.classList.contains('btn-eliminar-adjunto') || target.closest('.btn-eliminar-adjunto')) {
      const btn = target.classList.contains('btn-eliminar-adjunto') ? target : target.closest('.btn-eliminar-adjunto');
      eliminarArchivoAdjunto(btn.dataset.id, () => cargarCorrespondencia(currentPage));
      return;
    }

    if (target.classList.contains('btn-contestar') || target.closest('.btn-contestar')) {
      const btn = target.classList.contains('btn-contestar') ? target : target.closest('.btn-contestar');
      abrirModalContestar(btn.dataset.id);
    }
  });

  tbody.addEventListener('change', async (event) => {
    if (event.target.classList.contains('status-select')) {
      const selectElement = event.target;
      const id = selectElement.dataset.id;
      const nuevoEstado = selectElement.value;

      fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
        .then(res => {
          if (!res.ok) throw new Error('Error al actualizar estado.');
          selectElement.className = `form-select form-select-sm status-select ${getStatusBadgeClass(nuevoEstado).join(' ')}`;
          cargarCorrespondencia(currentPage);
          cargarNotificaciones();
        })
        .catch(err => {
          console.error(err);
          showToast('No se pudo actualizar el estado.', 'error');
        });
    }
  });

  // ==========================================================
  // RADICACIÓN (form: crear / editar)
  // ==========================================================
  function resetRegistroForm() {
    registroForm.reset();
    idParaActualizar = null;
    radicacionTitle.textContent = 'Radicar nueva correspondencia';
    submitRegistroBtn.innerHTML = '<i class="fas fa-save me-2"></i>Guardar Registro';
    editingBanner.classList.remove('show');
    borrarDraft();
  }

  function cargarRegistroEnFormulario(registro) {
    document.getElementById('radicado').value = registro.radicado;
    document.getElementById('remitente').value = registro.remitente;
    document.getElementById('correoRemitente').value = registro.correoRemitente || '';
    document.getElementById('asunto').value = registro.asunto;
    document.getElementById('tipoSolicitud').value = registro.tipoSolicitud;
    document.getElementById('cargoEntidad').value = registro.cargoEntidad || '';
    document.getElementById('formaEnvio').value = registro.formaEnvio || '';
    document.getElementById('observaciones').value = registro.observaciones || '';
    document.getElementById('fechaRecibido').value = registro.fechaRecibido || '';
    document.getElementById('fechaContestacion').value = registro.fechaContestacion
      ? registro.fechaContestacion.toString().split('T')[0] : '';

    idParaActualizar = registro.id;
    radicacionTitle.textContent = 'Editar radicado';
    submitRegistroBtn.innerHTML = '<i class="fas fa-save me-2"></i>Actualizar Registro';
    editingRadicadoLabel.textContent = registro.radicado;
    editingBanner.classList.add('show');
  }

  resetFormBtn.addEventListener('click', resetRegistroForm);
  cancelEditBtn.addEventListener('click', resetRegistroForm);

  registroForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const originalText = submitRegistroBtn.innerHTML;
    submitRegistroBtn.innerHTML = '<div class="loading-spinner"></div> Guardando...';
    submitRegistroBtn.disabled = true;

    const datos = {
      radicado: document.getElementById('radicado').value,
      fechaRecibido: document.getElementById('fechaRecibido').value,
      remitente: document.getElementById('remitente').value,
      correoRemitente: document.getElementById('correoRemitente').value,
      asunto: document.getElementById('asunto').value,
      tipoSolicitud: document.getElementById('tipoSolicitud').value,
      cargoEntidad: document.getElementById('cargoEntidad').value,
      formaEnvio: document.getElementById('formaEnvio').value,
      observaciones: document.getElementById('observaciones').value,
    };

    const fechaContestacion = document.getElementById('fechaContestacion').value;
    if (fechaContestacion) datos.fechaContestacion = fechaContestacion;

    const esActualizacion = idParaActualizar !== null;
    const url = esActualizacion ? `${API_BASE}/${idParaActualizar}` : API_BASE;
    const method = esActualizacion ? 'PATCH' : 'POST';

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
      .then(res => res.ok ? res.json() : res.json().then(e => Promise.reject(e)))
      .then(() => {
        const eraActualizacion = esActualizacion;
        resetRegistroForm();
        showToast(eraActualizacion ? 'Registro actualizado con éxito' : 'Registro radicado con éxito', 'success');
        cargarNotificaciones();
        goToSection('seguimiento');
        if (!eraActualizacion) {
          // Deja ver el nuevo registro primero en la lista
          sortBy = 'id'; sortOrder = 'DESC';
          cargarCorrespondencia(1);
        }
      })
      .catch(err => {
        console.error(err);
        const msg = err && err.message ? err.message : 'Error al guardar el registro';
        showToast(msg, 'error');
      })
      .finally(() => {
        submitRegistroBtn.innerHTML = originalText;
        submitRegistroBtn.disabled = false;
      });
  });

  // ==========================================================
  // ADJUNTAR ARCHIVO (modal compartido por Seguimiento y Documentos)
  // ==========================================================
  function abrirModalAdjuntar(id) {
    idParaAdjuntar = id;
    document.getElementById('adjuntar-id').textContent = idParaAdjuntar;
    adjuntarModal.show();
  }

  adjuntarForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitBtn = document.querySelector('button[form="adjuntarForm"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="loading-spinner"></div> Subiendo...';
    submitBtn.disabled = true;

    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file || !idParaAdjuntar) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/${idParaAdjuntar}/adjuntar`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Falló la subida del archivo');

      adjuntarModal.hide();
      adjuntarForm.reset();
      showToast('Archivo subido con éxito', 'success');

      if (document.getElementById('section-seguimiento').classList.contains('active')) cargarCorrespondencia(currentPage);
      if (document.getElementById('section-documentos').classList.contains('active')) cargarDocumentos();
    } catch (err) {
      console.error(err);
      showToast('No se pudo subir el archivo.', 'error');
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  });

  // ==========================================================
  // DOCUMENTOS
  // ==========================================================
  docTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      docTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      docFilter = tab.dataset.docFilter;
      cargarDocumentos();
    });
  });

  async function cargarDocumentos() {
    docGrid.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div><div class="mt-2">Cargando documentos...</div></div>';
    try {
      const { data } = await fetchTodos();
      let filtrados = data;
      if (docFilter === 'con') filtrados = data.filter(r => !!r.archivosAnexos);
      if (docFilter === 'sin') filtrados = data.filter(r => !r.archivosAnexos);

      if (filtrados.length === 0) {
        docGrid.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i>No hay documentos para este filtro.</div>`;
        return;
      }

      docGrid.innerHTML = filtrados.map(r => {
        const u = getUrgency(r.estado, r.fechaVencimiento);
        return `
        <div class="card doc-card" style="--row-color:${urgencyColorVar[u]}">
          <div class="doc-radicado">${r.radicado}</div>
          <div class="doc-asunto text-truncate-custom">${r.asunto}</div>
          <div class="doc-meta"><i class="fas fa-user me-1"></i>${r.remitente}</div>
          <div class="doc-meta"><i class="fas fa-flag me-1"></i>${r.estado} · ${urgencyLabel(r.estado, r.fechaVencimiento)}</div>
          <div class="doc-actions">
            ${r.archivosAnexos
              ? `<a href="${r.archivosAnexos}" target="_blank" class="btn btn-info btn-sm"><i class="fas fa-eye me-1"></i>Ver</a>
                 <button class="btn btn-outline-danger btn-sm btn-eliminar-adjunto" data-id="${r.id}"><i class="fas fa-trash me-1"></i>Eliminar</button>`
              : `<button class="btn btn-secondary btn-sm btn-adjuntar-doc" data-id="${r.id}"><i class="fas fa-paperclip me-1"></i>Adjuntar</button>`}
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      console.error(err);
      docGrid.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i>No se pudieron cargar los documentos.</div>`;
    }
  }

  docGrid.addEventListener('click', (e) => {
    const btnAdjuntar = e.target.closest('.btn-adjuntar-doc');
    if (btnAdjuntar) return abrirModalAdjuntar(btnAdjuntar.dataset.id);

    const btnEliminar = e.target.closest('.btn-eliminar-adjunto');
    if (btnEliminar) return eliminarArchivoAdjunto(btnEliminar.dataset.id, cargarDocumentos);
  });

  // ==========================================================
  // TOASTS
  // ==========================================================
  function showToast(message, type = 'info') {
    const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `app-toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    toastStack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 250);
    }, 3800);
  }

  // ==========================================================
  // NOTIFICACIONES (campana en la barra superior)
  // ==========================================================
  async function cargarNotificaciones() {
    try {
      const { data } = await fetchTodos();
      const alertas = data
        .filter(r => r.estado !== 'Respondido')
        .map(r => ({ ...r, urgencia: getUrgency(r.estado, r.fechaVencimiento) }))
        .filter(r => r.urgencia === 'overdue' || r.urgencia === 'soon')
        .sort((a, b) => parseFechaLocal(a.fechaVencimiento) - parseFechaLocal(b.fechaVencimiento));

      if (alertas.length === 0) {
        notifBadge.classList.add('d-none');
        notifList.innerHTML = `<div class="notif-empty"><i class="fas fa-circle-check mb-1 d-block"></i>Sin pendientes urgentes.</div>`;
        return;
      }

      notifBadge.textContent = alertas.length > 9 ? '9+' : alertas.length;
      notifBadge.classList.remove('d-none');

      notifList.innerHTML = alertas.slice(0, 8).map(r => `
        <div class="notif-item" data-id="${r.id}" role="button">
          <span class="urgency-dot bg-urgency-${r.urgencia}"></span>
          <div>
            <div class="n-title">${r.radicado} · ${r.remitente}</div>
            <div class="n-sub urgency-${r.urgencia}">${r.urgencia === 'overdue' ? 'Vencido' : 'Vence pronto'} — ${r.asunto.substring(0, 46)}${r.asunto.length > 46 ? '…' : ''}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error(err);
      notifList.innerHTML = `<div class="notif-empty">No se pudieron cargar las notificaciones.</div>`;
    }
  }

  notifList.addEventListener('click', (e) => {
    const item = e.target.closest('.notif-item');
    if (!item) return;
    searchInput.value = '';
    statusFilter.value = '';
    tipoFilter.value = '';
    goToSection('seguimiento');
  });

  // ==========================================================
  // GUARDADO EN CACHÉ DEL FORMULARIO DE RADICACIÓN (borrador)
  // ==========================================================
  const draftFieldIds = ['radicado', 'tipoSolicitud', 'fechaRecibido', 'fechaContestacion', 'remitente', 'correoRemitente', 'cargoEntidad', 'formaEnvio', 'asunto', 'observaciones'];

  function guardarDraft() {
    if (idParaActualizar !== null) return; // no cachear mientras se edita un registro existente
    const draft = {};
    draftFieldIds.forEach(id => { draft[id] = document.getElementById(id).value; });
    const tieneContenido = Object.values(draft).some(v => v && v.trim() !== '');
    if (tieneContenido) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  }

  function borrarDraft() {
    localStorage.removeItem(DRAFT_KEY);
    draftBanner.classList.remove('show');
  }

  function restaurarDraftSiExiste() {
    if (idParaActualizar !== null) return;
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      draftFieldIds.forEach(id => {
        if (draft[id]) document.getElementById(id).value = draft[id];
      });
      draftBanner.classList.add('show');
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }

  let draftDebounce;
  registroForm.addEventListener('input', () => {
    clearTimeout(draftDebounce);
    draftDebounce = setTimeout(guardarDraft, 400);
  });

  discardDraftBtn.addEventListener('click', () => {
    registroForm.reset();
    borrarDraft();
  });

  // ==========================================================
  // TUTORIAL DE PRIMER USO
  // ==========================================================
  const tutorialModalElement = document.getElementById('tutorialModal');
  const tutorialModal = new bootstrap.Modal(tutorialModalElement);
  const tutorialBody = document.getElementById('tutorialBody');
  const tutorialDots = document.getElementById('tutorialDots');
  const tutorialPrevBtn = document.getElementById('tutorialPrevBtn');
  const tutorialNextBtn = document.getElementById('tutorialNextBtn');
  const tutorialSkipBtn = document.getElementById('tutorialSkipBtn');

  const tutorialSlides = [
    { icon: 'fa-chart-pie', title: 'Dashboard', text: 'Aquí ves el resumen general: cuántos radicados hay, cuántos están vencidos y los que están por vencer, ordenados por urgencia.' },
    { icon: 'fa-file-circle-plus', title: 'Radicación', text: 'Registra cada documento que llega a la entidad. El sistema calcula solo la fecha de vencimiento según el tipo de solicitud.' },
    { icon: 'fa-list-check', title: 'Seguimiento', text: 'La lista completa de radicados. Cambia el estado, edítalos o elimínalos. El color a la izquierda de cada fila indica su urgencia: verde a tiempo, ámbar por vencer, rojo vencido.' },
    { icon: 'fa-paperclip', title: 'Documentos', text: 'Revisa qué radicados tienen archivo adjunto y cuáles no, para no dejar ninguno sin soporte.' },
    { icon: 'fa-bell', title: 'Notificaciones', text: 'La campana en la parte superior te avisa de los radicados vencidos o próximos a vencer, sin tener que entrar al Dashboard.' },
  ];
  let tutorialStep = 0;

  function renderTutorialStep() {
    const s = tutorialSlides[tutorialStep];
    tutorialBody.innerHTML = `
      <div class="tutorial-icon"><i class="fas ${s.icon}"></i></div>
      <h5 class="fw-bold mb-2">${s.title}</h5>
      <p class="text-muted mb-0" style="font-size:.88rem;">${s.text}</p>
    `;
    tutorialDots.innerHTML = tutorialSlides.map((_, i) => `<span class="${i === tutorialStep ? 'active' : ''}"></span>`).join('');
    tutorialPrevBtn.classList.toggle('d-none', tutorialStep === 0);
    tutorialNextBtn.textContent = tutorialStep === tutorialSlides.length - 1 ? 'Entendido, empezar' : 'Siguiente';
  }

  function abrirTutorial() {
    tutorialStep = 0;
    renderTutorialStep();
    tutorialModal.show();
  }

  tutorialNextBtn.addEventListener('click', () => {
    if (tutorialStep < tutorialSlides.length - 1) {
      tutorialStep++;
      renderTutorialStep();
    } else {
      localStorage.setItem(TUTORIAL_KEY, '1');
      tutorialModal.hide();
    }
  });
  tutorialPrevBtn.addEventListener('click', () => {
    if (tutorialStep > 0) { tutorialStep--; renderTutorialStep(); }
  });
  tutorialSkipBtn.addEventListener('click', () => {
    localStorage.setItem(TUTORIAL_KEY, '1');
    tutorialModal.hide();
  });
  openTutorialBtn.addEventListener('click', abrirTutorial);

  // ==========================================================
  // ELIMINAR ARCHIVO ADJUNTO (Drive)
  // ==========================================================
  async function eliminarArchivoAdjunto(id, onDone) {
    if (!confirm('¿Eliminar el archivo adjunto de este radicado? Esto también lo borra de Google Drive.')) return;
    try {
      const res = await fetch(`${API_BASE}/${id}/adjunto`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo eliminar el archivo.');
      showToast('Archivo eliminado de Drive', 'success');
      if (onDone) onDone();
    } catch (err) {
      console.error(err);
      showToast('No se pudo eliminar el archivo.', 'error');
    }
  }

  // ==========================================================
  // MÓDULO DE CONTESTACIÓN
  // ==========================================================
  const contestarModalElement = document.getElementById('contestarModal');
  const contestarModal = new bootstrap.Modal(contestarModalElement);
  const contestarForm = document.getElementById('contestarForm');
  const contestarSinCorreo = document.getElementById('contestarSinCorreo');
  const contestarSubmitBtn = document.getElementById('contestarSubmitBtn');
  let idParaContestar = null;

  async function abrirModalContestar(id) {
    try {
      const res = await fetch(`${API_BASE}/${id}`);
      const registro = await res.json();
      idParaContestar = id;

      document.getElementById('contestar-radicado').textContent = registro.radicado;
      document.getElementById('contestar-correo').textContent = registro.correoRemitente || 'sin correo registrado';
      document.getElementById('contestarMensaje').value = registro.respuestaMensaje || '';

      const tieneCorreo = !!registro.correoRemitente;
      contestarSinCorreo.classList.toggle('d-none', tieneCorreo);
      contestarSubmitBtn.disabled = !tieneCorreo;

      contestarModal.show();
    } catch (err) {
      console.error(err);
      showToast('No se pudo cargar el radicado.', 'error');
    }
  }

  contestarForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!idParaContestar) return;

    const originalText = contestarSubmitBtn.innerHTML;
    contestarSubmitBtn.innerHTML = '<div class="loading-spinner"></div> Enviando...';
    contestarSubmitBtn.disabled = true;

    const formData = new FormData();
    formData.append('mensaje', document.getElementById('contestarMensaje').value);
    const file = document.getElementById('contestarFile').files[0];
    if (file) formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/${idParaContestar}/contestar`, { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'No se pudo enviar la respuesta.');
      }
      contestarModal.hide();
      contestarForm.reset();
      showToast('Respuesta enviada y registrada con éxito', 'success');
      cargarNotificaciones();
      if (document.getElementById('section-seguimiento').classList.contains('active')) cargarCorrespondencia(currentPage);
      if (document.getElementById('section-dashboard').classList.contains('active')) cargarDashboard();
    } catch (err) {
      console.error(err);
      showToast(Array.isArray(err.message) ? err.message.join(' ') : err.message, 'error');
    } finally {
      contestarSubmitBtn.innerHTML = originalText;
      contestarSubmitBtn.disabled = false;
    }
  });

  // ==========================================================
  // PERFIL Y CORREO (Configuración)
  // ==========================================================
  const perfilFotoPreview = document.getElementById('perfilFotoPreview');
  const perfilFotoInput = document.getElementById('perfilFotoInput');
  const perfilNombre = document.getElementById('perfilNombre');
  const guardarPerfilBtn = document.getElementById('guardarPerfilBtn');

  const cfgNombreRemitente = document.getElementById('cfgNombreRemitente');
  const cfgSmtpUser = document.getElementById('cfgSmtpUser');
  const cfgSmtpPass = document.getElementById('cfgSmtpPass');
  const cfgPassEstado = document.getElementById('cfgPassEstado');
  const cfgSmtpHost = document.getElementById('cfgSmtpHost');
  const cfgSmtpPort = document.getElementById('cfgSmtpPort');
  const cfgSmtpSecure = document.getElementById('cfgSmtpSecure');
  const guardarConfigBtn = document.getElementById('guardarConfigBtn');

  function iniciales(nombre) {
    if (!nombre) return 'CN';
    const partes = nombre.trim().split(/\s+/);
    return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || 'CN';
  }

  function aplicarAvatarGlobal(config) {
    const avatares = [document.querySelector('.topbar-user'), perfilFotoPreview].filter(Boolean);
    avatares.forEach(el => {
      if (config.fotoPerfilId) {
        // El webViewLink de Drive abre una página HTML, no sirve como imagen embebida.
        // El endpoint de miniatura sí devuelve la imagen directamente.
        el.style.backgroundImage = `url('https://drive.google.com/thumbnail?id=${config.fotoPerfilId}&sz=w200')`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
      } else {
        el.style.backgroundImage = '';
        el.textContent = iniciales(config.nombreAdministrador);
      }
    });
  }

  async function cargarPerfil() {
    try {
      const res = await fetch(CONFIG_BASE);
      const config = await res.json();

      perfilNombre.value = config.nombreAdministrador || '';
      cfgNombreRemitente.value = config.nombreRemitente || '';
      cfgSmtpUser.value = config.smtpUser || '';
      cfgSmtpHost.value = config.smtpHost || '';
      cfgSmtpPort.value = config.smtpPort || '';
      cfgSmtpSecure.checked = config.smtpSecure !== false;
      cfgPassEstado.textContent = config.tieneClaveConfigurada
        ? 'Ya hay una contraseña guardada — déjalo vacío para conservarla.'
        : 'Aún no has guardado ninguna contraseña de aplicación.';

      aplicarAvatarGlobal(config);
    } catch (err) {
      console.error(err);
      showToast('No se pudo cargar la configuración.', 'error');
    }
  }

  perfilFotoInput.addEventListener('change', async () => {
    const file = perfilFotoInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${CONFIG_BASE}/foto`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error();
      const config = await res.json();
      aplicarAvatarGlobal(config);
      showToast('Foto de perfil actualizada', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo subir la foto.', 'error');
    }
  });

  guardarPerfilBtn.addEventListener('click', async () => {
    const originalText = guardarPerfilBtn.innerHTML;
    guardarPerfilBtn.innerHTML = '<div class="loading-spinner"></div> Guardando...';
    guardarPerfilBtn.disabled = true;
    try {
      const res = await fetch(CONFIG_BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreAdministrador: perfilNombre.value }),
      });
      if (!res.ok) throw new Error();
      const config = await res.json();
      aplicarAvatarGlobal(config);
      showToast('Perfil guardado', 'success');
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar el perfil.', 'error');
    } finally {
      guardarPerfilBtn.innerHTML = originalText;
      guardarPerfilBtn.disabled = false;
    }
  });

  guardarConfigBtn.addEventListener('click', async () => {
    const originalText = guardarConfigBtn.innerHTML;
    guardarConfigBtn.innerHTML = '<div class="loading-spinner"></div> Guardando...';
    guardarConfigBtn.disabled = true;

    const payload = {
      nombreRemitente: cfgNombreRemitente.value,
      smtpUser: cfgSmtpUser.value,
      smtpHost: cfgSmtpHost.value,
      smtpPort: cfgSmtpPort.value ? parseInt(cfgSmtpPort.value, 10) : undefined,
      smtpSecure: cfgSmtpSecure.checked,
    };
    if (cfgSmtpPass.value) payload.smtpPass = cfgSmtpPass.value;

    try {
      const res = await fetch(CONFIG_BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(Array.isArray(err.message) ? err.message.join(' ') : err.message);
      }
      cfgSmtpPass.value = '';
      showToast('Configuración de correo guardada', 'success');
      cargarPerfil();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'No se pudo guardar la configuración.', 'error');
    } finally {
      guardarConfigBtn.innerHTML = originalText;
      guardarConfigBtn.disabled = false;
    }
  });

  // ==========================================================
  // SESIÓN (login con Google)
  // ==========================================================
  const loginGate = document.getElementById('loginGate');
  const appShell = document.getElementById('appShell');
  const loginError = document.getElementById('loginError');
  const sesionCorreo = document.getElementById('sesionCorreo');
  const cerrarSesionBtn = document.getElementById('cerrarSesionBtn');

  const MENSAJES_ERROR_LOGIN = {
    no_autorizado: 'Esa cuenta de Google no está autorizada para entrar a este panel.',
    sin_configurar: 'Aún no se ha configurado ningún correo autorizado en el servidor.',
  };

  function mostrarErrorLoginSiAplica() {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('auth_error');
    if (error) {
      loginError.textContent = MENSAJES_ERROR_LOGIN[error] || 'No se pudo iniciar sesión.';
      loginError.classList.add('show');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  cerrarSesionBtn.addEventListener('click', async () => {
    try {
      await fetch('/auth/logout', { method: 'POST' });
    } finally {
      window.location.reload();
    }
  });

  async function verificarSesionYArrancar() {
    mostrarErrorLoginSiAplica();
    try {
      const res = await fetch('/auth/me');
      if (!res.ok) throw new Error('sin sesión');
      const usuario = await res.json();

      loginGate.classList.add('hidden');
      appShell.classList.add('ready');
      sesionCorreo.innerHTML = `<i class="fas fa-circle-user me-1"></i>${usuario.email}`;

      cargarDashboard();
      cargarNotificaciones();
      restaurarDraftSiExiste();
      fetch(CONFIG_BASE).then(r => r.json()).then(aplicarAvatarGlobal).catch(() => {});
      if (!localStorage.getItem(TUTORIAL_KEY)) {
        setTimeout(abrirTutorial, 500);
      }
    } catch {
      // No hay sesión: se queda mostrando la pantalla de login, no hacemos nada más.
    }
  }

  // --- INICIO ---
  verificarSesionYArrancar();
});