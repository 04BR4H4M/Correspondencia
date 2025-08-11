document.addEventListener('DOMContentLoaded', () => {
  // --- ELEMENTOS PRINCIPALES ---
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const deleteSelectedButton = document.getElementById('deleteSelectedButton');
  const tbody = document.querySelector('table tbody');
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const paginationControls = document.getElementById('pagination-controls');

  const registroModalElement = document.getElementById('registroModal');
  const registroModal = new bootstrap.Modal(registroModalElement);
  const registroForm = document.getElementById('registroForm');
  const modalTitle = document.getElementById('registroModalLabel');

  const detalleModalElement = document.getElementById('detalleModal');
  const detalleModal = new bootstrap.Modal(detalleModalElement);

  const adjuntarModalElement = document.getElementById('adjuntarModal');
  const adjuntarModal = new bootstrap.Modal(adjuntarModalElement);
  const adjuntarForm = document.getElementById('adjuntarForm');

  let idParaAdjuntar = null;
  let currentPage = 1;
  const limit = 10;
  let sortBy = 'id';
  let sortOrder = 'ASC';
  let idParaActualizar = null;

  // --- FUNCIONES AUXILIARES ---
  const getStatusBadge = (estado) => {
    switch (estado) {
      case 'En Proceso': return ['bg-warning'];
      case 'Respondido': return ['bg-secondary', 'text-white'];
      default: return ['bg-success', 'text-white'];
    }
  };

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

    tbody.innerHTML = '<tr><td colspan="12" class="text-center"><div class="loading-spinner"></div> Cargando...</td></tr>';

    const searchTerm = searchInput.value.trim();
    const status = statusFilter.value;

    let url = `http://localhost:3000/correspondencia?page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
    if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
    if (status) url += `&estado=${encodeURIComponent(status)}`;

    fetch(url)
      .then(res => res.json())
      .then(({ data, total }) => {
        tbody.innerHTML = '';
        data.forEach(registro => {
          const fila = `
<tr class="align-middle fade-in">
  <td><input class="form-check-input row-checkbox" type="checkbox" value="${registro.id}"></td>
  <td>${registro.id}</td>
  <td>${registro.radicado}</td>

  <td>
    <div class="text-truncate-custom" title="${registro.remitente}">
      ${registro.remitente.length > 30
        ? registro.remitente.substring(0, 30) + '... <a href="#" class="ver-mas" data-id="${registro.id}">Ver más</a>'
        : registro.remitente}
    </div>
  </td>

  <td>
    <div class="text-truncate-custom" title="${registro.asunto}">
      ${registro.asunto.length > 40
        ? registro.asunto.substring(0, 40) + '... <a href="#" class="ver-mas" data-id="${registro.id}">Ver más</a>'
        : registro.asunto}
    </div>
  </td>

  <td>${new Date(registro.fechaRecibido).toLocaleDateString('es-ES')}</td>
  <td>${registro.fechaVencimiento ? new Date(registro.fechaVencimiento).toLocaleDateString('es-ES') : 'N/A'}</td>
  <td>${registro.fechaContestacion ? new Date(registro.fechaContestacion).toLocaleDateString('es-ES') : 'N/A'}</td>

  <td>
    <div class="text-truncate-custom" title="${registro.observaciones || 'Sin observaciones'}">
      ${(registro.observaciones && registro.observaciones.length > 40)
        ? registro.observaciones.substring(0, 40) + '... <a href="#" class="ver-mas" data-id="${registro.id}">Ver más</a>'
        : (registro.observaciones || '<em class="text-muted">Sin observaciones</em>')}
    </div>
  </td>

  <td>
    <select class="form-select form-select-sm status-select ${getStatusBadge(registro.estado).join(' ')}" data-id="${registro.id}">
      <option value="Recibido" ${registro.estado === 'Recibido' ? 'selected' : ''}>📥 Recibido</option>
      <option value="En Proceso" ${registro.estado === 'En Proceso' ? 'selected' : ''}>⚙️ En Proceso</option>
      <option value="Respondido" ${registro.estado === 'Respondido' ? 'selected' : ''}>✅ Respondido</option>
    </select>
  </td>

  <td>
    <div class="btn-group-actions">
      <button class="btn btn-info btn-sm btn-ver" data-id="${registro.id}"><i class="fas fa-eye"></i></button>
      <button class="btn btn-warning btn-sm btn-editar" data-id="${registro.id}"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger btn-sm btn-eliminar" data-id="${registro.id}"><i class="fas fa-trash"></i></button>
    </div>
  </td>
  <td>
    <button class="btn btn-secondary btn-sm btn-adjuntar" data-id="${registro.id}"><i class="fas fa-paperclip"></i></button>
  </td>
</tr>`;
          tbody.innerHTML += fila;
        });
        renderizarPaginacion(total);
      })
      .catch(err => {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-danger">Error al cargar los datos</td></tr>';
      });
  };

  // --- EVENTOS ---
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
      fetch('http://localhost:3000/correspondencia/bulk-delete', {
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

  searchInput.addEventListener('input', () => cargarCorrespondencia(1));
  statusFilter.addEventListener('change', () => cargarCorrespondencia(1));

  document.querySelector('table thead').addEventListener('click', (e) => {
    if (e.target.tagName === 'TH' && e.target.dataset.sort) {
      const clickedSort = e.target.dataset.sort;
      sortOrder = (sortBy === clickedSort) ? (sortOrder === 'ASC' ? 'DESC' : 'ASC') : 'ASC';
      sortBy = clickedSort;
      cargarCorrespondencia(1);
    }
  });

tbody.addEventListener('click', (event) => {
  const target = event.target;

  if (target.classList.contains('ver-mas')) {
    event.preventDefault();
    const row = target.closest('tr');
    const btn = row?.querySelector('.btn-ver');

    if (btn) {
      btn.click();
    } else {
      console.warn('No se encontró botón "ver" en la fila actual');
    }
  }
});

  // --- EVENTOS DEL BODY ---
  tbody.addEventListener('click', async (event) => {
    const target = event.target;

    if (target.classList.contains('btn-ver')) {
      const id = target.dataset.id;
      try {
        const response = await fetch(`http://localhost:3000/correspondencia/${id}`);
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
    }

    if (target.classList.contains('btn-editar')) {
      const id = target.dataset.id;
      try {
        const response = await fetch(`http://localhost:3000/correspondencia/${id}`);
        const registro = await response.json();
        document.getElementById('radicado').value = registro.radicado;
        document.getElementById('remitente').value = registro.remitente;
        document.getElementById('asunto').value = registro.asunto;
        document.getElementById('tipoSolicitud').value = registro.tipoSolicitud;
        document.getElementById('cargoEntidad').value = registro.cargoEntidad || '';
        document.getElementById('formaEnvio').value = registro.formaEnvio || '';
        document.getElementById('observaciones').value = registro.observaciones || '';
        document.getElementById('fechaRecibido').value = registro.fechaRecibido || '';
        document.getElementById('fechaContestacion').value = registro.fechaContestacion ? new Date(registro.fechaContestacion).toISOString().split('T')[0] : '';

        modalTitle.textContent = `Editando Registro ID: ${id}`;
        idParaActualizar = id;
        registroModal.show();
      } catch (err) {
        console.error(err);
      }
    }

    if (target.classList.contains('btn-eliminar')) {
      const id = target.dataset.id;
      if (confirm(`¿Eliminar registro ID ${id}?`)) {
        fetch(`http://localhost:3000/correspondencia/${id}`, {
          method: 'DELETE'
        })
          .then(res => {
            if (!res.ok) throw new Error('Error al eliminar el registro.');
            if (tbody.rows.length === 1 && currentPage > 1) {
              currentPage--;
            }
            cargarCorrespondencia(currentPage);
          })
          .catch(err => {
            console.error(err);
            alert('Error al eliminar el registro.');
          });
      }
    }

    if (target.classList.contains('btn-adjuntar')) {
      idParaAdjuntar = target.dataset.id;
      document.getElementById('adjuntar-id').textContent = idParaAdjuntar;
      adjuntarModal.show();
    }
  });

  // --- CAMBIAR ESTADO ---
  tbody.addEventListener('change', async (event) => {
    if (event.target.classList.contains('status-select')) {
      const selectElement = event.target;
      const id = selectElement.dataset.id;
      const nuevoEstado = selectElement.value;

      fetch(`http://localhost:3000/correspondencia/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
        .then(res => {
          if (!res.ok) throw new Error('Error al actualizar estado.');
          selectElement.className = `form-select form-select-sm status-select ${getStatusBadge(nuevoEstado).join(' ')}`;
        })
        .catch(err => {
          console.error(err);
          alert('No se pudo actualizar el estado.');
        });
    }
  });

  // --- SUBIR ARCHIVO ADJUNTO ---
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
      const res = await fetch(`http://localhost:3000/correspondencia/${idParaAdjuntar}/adjuntar`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Falló la subida del archivo');

      adjuntarModal.hide();
      adjuntarForm.reset();
      alert('Archivo subido con éxito');
      cargarCorrespondencia(currentPage);
    } catch (err) {
      console.error(err);
      alert('No se pudo subir el archivo.');
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  });

  // --- GUARDAR REGISTRO ---
  registroForm.addEventListener('submit', (event) => {
    event.preventDefault();
    
    // Mostrar indicador de carga en el botón
    const submitBtn = document.querySelector('button[form="registroForm"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="loading-spinner"></div> Guardando...';
    submitBtn.disabled = true;
    
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
    if (fechaContestacion) {
      datos.fechaContestacion = fechaContestacion;
    }

    const esActualizacion = idParaActualizar !== null;
    const url = esActualizacion
      ? `http://localhost:3000/correspondencia/${idParaActualizar}`
      : 'http://localhost:3000/correspondencia';

    const method = esActualizacion ? 'PATCH' : 'POST';

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
      .then(res => res.ok ? res.json() : Promise.reject('Error al guardar'))
      .then(() => {
        registroModal.hide();
        cargarCorrespondencia();
      })
      .catch(err => {
        console.error(err);
        alert('Error al guardar el registro');
      })
      .finally(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      });
  });

  registroModalElement.addEventListener('hidden.bs.modal', () => {
    registroForm.reset();
    modalTitle.textContent = 'Registrar Nueva Correspondencia';
    idParaActualizar = null;
  });

  cargarCorrespondencia();
});
