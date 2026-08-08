document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = 'http://localhost:3000/correspondencia';

  // --- ELEMENTOS: LAYOUT / NAV ---
  const navItems = document.querySelectorAll('.nav-item[data-section]');
  const views = document.querySelectorAll('.view');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');

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

  // --- ESTADO ---
  let idParaAdjuntar = null;
  let idParaActualizar = null;
  let currentPage = 1;
  const limit = 10;
  let sortBy = 'id';
  let sortOrder = 'ASC';
  let docFilter = 'todos';

  // ==========================================================
  // NAVEGACIÓN ENTRE SECCIONES
  // ==========================================================
  function goToSection(section) {
    navItems.forEach(b => b.classList.toggle('active', b.dataset.section === section));
    views.forEach(v => v.classList.toggle('active', v.id === `section-${section}`));
    sidebar.classList.remove('open');

    if (section === 'dashboard') cargarDashboard();
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
    const fv = new Date(fechaVencimiento); fv.setHours(0, 0, 0, 0);
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
        .sort((a, b) => new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento))
        .slice(0, 6);

      if (proximos.length === 0) {
        upcomingList.innerHTML = `<div class="empty-state"><i class="fas fa-circle-check"></i>No hay radicados pendientes por vencer.</div>`;
      } else {
        upcomingList.innerHTML = proximos.map(r => {
          const u = getUrgency(r.estado, r.fechaVencimiento);
          const dias = Math.round((new Date(r.fechaVencimiento) - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
          const diasTexto = dias < 0 ? `${Math.abs(dias)} d. vencido` : (dias === 0 ? 'Vence hoy' : `${dias} d. restantes`);
          return `
            <div class="upcoming-item">
              <span class="urgency-dot bg-urgency-${u}"></span>
              <div>
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

    let url = `${API_BASE}?page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
    if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
    if (status) url += `&estado=${encodeURIComponent(status)}`;

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

  <td>${new Date(registro.fechaRecibido).toLocaleDateString('es-ES')}</td>
  <td>${registro.fechaVencimiento ? new Date(registro.fechaVencimiento).toLocaleDateString('es-ES') : 'N/A'}</td>
  <td>${registro.fechaContestacion ? new Date(registro.fechaContestacion).toLocaleDateString('es-ES') : 'N/A'}</td>

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
      <button class="btn btn-warning btn-sm btn-editar" data-id="${registro.id}" title="Editar"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger btn-sm btn-eliminar" data-id="${registro.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
    </div>
  </td>
  <td>
    <button class="btn btn-secondary btn-sm btn-adjuntar" data-id="${registro.id}" title="Adjuntar archivo"><i class="fas fa-paperclip"></i></button>
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
    if (selectedIds.length === 0) return alert('No hay registros seleccionados.');
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
      }).catch(err => {
        console.error(err);
        alert('No se pudieron eliminar los registros.');
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
          })
          .catch(err => {
            console.error(err);
            alert('Error al eliminar el registro.');
          });
      }
      return;
    }

    if (target.classList.contains('btn-adjuntar') || target.closest('.btn-adjuntar')) {
      const btn = target.classList.contains('btn-adjuntar') ? target : target.closest('.btn-adjuntar');
      abrirModalAdjuntar(btn.dataset.id);
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
        })
        .catch(err => {
          console.error(err);
          alert('No se pudo actualizar el estado.');
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
  }

  function cargarRegistroEnFormulario(registro) {
    document.getElementById('radicado').value = registro.radicado;
    document.getElementById('remitente').value = registro.remitente;
    document.getElementById('asunto').value = registro.asunto;
    document.getElementById('tipoSolicitud').value = registro.tipoSolicitud;
    document.getElementById('cargoEntidad').value = registro.cargoEntidad || '';
    document.getElementById('formaEnvio').value = registro.formaEnvio || '';
    document.getElementById('observaciones').value = registro.observaciones || '';
    document.getElementById('fechaRecibido').value = registro.fechaRecibido || '';
    document.getElementById('fechaContestacion').value = registro.fechaContestacion
      ? new Date(registro.fechaContestacion).toISOString().split('T')[0] : '';

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
        alert(msg);
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
      alert('Archivo subido con éxito');

      if (document.getElementById('section-seguimiento').classList.contains('active')) cargarCorrespondencia(currentPage);
      if (document.getElementById('section-documentos').classList.contains('active')) cargarDocumentos();
    } catch (err) {
      console.error(err);
      alert('No se pudo subir el archivo.');
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
              ? `<a href="${r.archivosAnexos}" target="_blank" class="btn btn-info btn-sm"><i class="fas fa-eye me-1"></i>Ver archivo</a>`
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
    const btn = e.target.closest('.btn-adjuntar-doc');
    if (btn) abrirModalAdjuntar(btn.dataset.id);
  });

  // --- INICIO ---
  cargarDashboard();
});