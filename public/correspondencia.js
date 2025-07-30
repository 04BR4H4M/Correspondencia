document.addEventListener('DOMContentLoaded', () => {
  // --- CONSTANTES DE ELEMENTOS DEL DOM ---
  const tbody = document.querySelector('table tbody');
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const paginationControls = document.getElementById('pagination-controls');

  // Modal de Registro/Edición
  const registroModalElement = document.getElementById('registroModal');
  const registroModal = new bootstrap.Modal(registroModalElement);
  const registroForm = document.getElementById('registroForm');
  const modalTitle = document.getElementById('registroModalLabel');

  // Modal de Detalles
  const detalleModalElement = document.getElementById('detalleModal');
  const detalleModal = new bootstrap.Modal(detalleModalElement);

  // Modal de Adjuntar
  const adjuntarModalElement = document.getElementById('adjuntarModal');
  const adjuntarModal = new bootstrap.Modal(adjuntarModalElement);
  const adjuntarForm = document.getElementById('adjuntarForm');
  let idParaAdjuntar = null;

  // --- ESTADO DE LA APLICACIÓN ---
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
      case 'Recibido':
      default: return ['bg-success', 'text-white'];
    }
  };

  // --- FUNCIÓN PRINCIPAL PARA CARGAR DATOS ---
  const cargarCorrespondencia = (page = 1) => {
    currentPage = page;
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
            <tr class="align-middle">
              <td>${registro.id}</td>
              <td>${registro.radicado}</td>
              <td>${registro.fechaRecibido}</td>
              <td>${registro.remitente}</td>
              <td>${registro.cargoEntidad || ''}</td>
              <td>${registro.formaEnvio || ''}</td>
              <td>${registro.tipoSolicitud}</td>
              <td>${registro.asunto}</td>
              <td>${registro.fechaVencimiento || 'N/A'}</td>
              <td>
                <select class="form-select form-select-sm status-select ${getStatusBadge(registro.estado)} ${registro.estado === 'Respondido' ? 'text-white' : ''}" data-id="${registro.id}">
                  <option value="Recibido">Recibido</option>
                  <option value="En Proceso">En Proceso</option>
                  <option value="Respondido">Respondido</option>
                </select>
              </td>
              <td class="d-grid gap-1 d-md-flex">
                <button class="btn btn-info btn-sm btn-ver" data-id="${registro.id}">Ver</button>
                <button class="btn btn-warning btn-sm btn-editar" data-id="${registro.id}">Editar</button>
                <button class="btn btn-danger btn-sm btn-eliminar" data-id="${registro.id}">Eliminar</button>
              </td>
              <td>
                <button class="btn btn-secondary btn-sm btn-adjuntar" data-id="${registro.id}">Adjuntar</button>
              </td>
            </tr>
          `;
          tbody.innerHTML += fila;
        });
        renderizarPaginacion(total);
      })
      .catch(err => console.error('Error:', err));
  };

  // --- FUNCIÓN PARA RENDERIZAR PAGINACIÓN ---
  const renderizarPaginacion = (total) => {
    const totalPaginas = Math.ceil(total / limit);
    paginationControls.innerHTML = '';

    if (totalPaginas <= 1) return;

    paginationControls.innerHTML += `
      <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${currentPage - 1}">Anterior</a>
      </li>
    `;

    for (let i = 1; i <= totalPaginas; i++) {
      paginationControls.innerHTML += `
        <li class="page-item ${i === currentPage ? 'active' : ''}">
          <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>
      `;
    }

    paginationControls.innerHTML += `
      <li class="page-item ${currentPage === totalPaginas ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${currentPage + 1}">Siguiente</a>
      </li>
    `;
  };

  // --- EVENT LISTENERS ---
  searchInput.addEventListener('input', () => cargarCorrespondencia(1));
  statusFilter.addEventListener('change', () => cargarCorrespondencia(1));

  paginationControls.addEventListener('click', (event) => {
    event.preventDefault();
    if (event.target.tagName === 'A' && !event.target.parentElement.classList.contains('disabled')) {
      const page = parseInt(event.target.dataset.page);
      cargarCorrespondencia(page);
    }
  });

  document.querySelector('table thead').addEventListener('click', (event) => {
    if (event.target.tagName === 'TH' && event.target.dataset.sort) {
      const clickedSort = event.target.dataset.sort;
      if (sortBy === clickedSort) {
        sortOrder = sortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        sortBy = clickedSort;
        sortOrder = 'ASC';
      }
      cargarCorrespondencia(1);
    }
  });

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

        // Mostrar enlace de archivo adjunto
        const adjuntoContainer = document.getElementById('detalle-adjunto');
        if (registro.archivosAnexos) {
          adjuntoContainer.innerHTML = `<a href="${registro.archivosAnexos}" target="_blank">Ver Archivo en Drive</a>`;
        } else {
          adjuntoContainer.textContent = 'No hay archivos adjuntos.';
        }

        detalleModal.show();
      } catch (error) {
        console.error('Error al obtener detalles:', error);
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

        modalTitle.textContent = `Editando Registro ID: ${id}`;
        idParaActualizar = id;
        registroModal.show();
      } catch (error) {
        console.error('Error al obtener datos para editar:', error);
      }
    }

    if (target.classList.contains('btn-eliminar')) {
      const id = target.dataset.id;
      if (confirm(`¿Eliminar registro ID ${id}?`)) {
        fetch(`http://localhost:3000/correspondencia/${id}`, { method: 'DELETE' })
          .then(res => {
            if (!res.ok) throw new Error('Error al eliminar.');
            cargarCorrespondencia(currentPage);
          })
          .catch(err => {
            console.error(err);
            alert('Error al eliminar.');
          });
      }
    }

    // --- Botón Adjuntar ---
    if (target.classList.contains('btn-adjuntar')) {
      idParaAdjuntar = target.dataset.id;
      document.getElementById('adjuntar-id').textContent = idParaAdjuntar;
      adjuntarModal.show();
    }
  });

  // Cambiar estado
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
          selectElement.classList.remove('bg-success', 'bg-warning', 'bg-secondary', 'text-white');
          selectElement.classList.add(...getStatusBadge(nuevoEstado));
        })
        .catch(err => {
          console.error(err);
          alert('No se pudo actualizar el estado.');
        });
    }
  });

  // Subir archivo adjunto
  adjuntarForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file || !idParaAdjuntar) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`http://localhost:3000/correspondencia/${idParaAdjuntar}/adjuntar`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Falló la subida del archivo');

      adjuntarModal.hide();
      adjuntarForm.reset();
      alert('Archivo subido con éxito!');
      cargarCorrespondencia(currentPage);
    } catch (error) {
      console.error('Error:', error);
      alert('No se pudo subir el archivo.');
    }
  });

  // Guardar formulario
  registroForm.addEventListener('submit', (event) => {
    event.preventDefault();

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

    const esActualizacion = idParaActualizar !== null;
    const url = esActualizacion ? `http://localhost:3000/correspondencia/${idParaActualizar}` : 'http://localhost:3000/correspondencia';
    const method = esActualizacion ? 'PATCH' : 'POST';

    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
      .then(response => response.ok ? response.json() : Promise.reject('Error al guardar'))
      .then(() => {
        registroModal.hide();
        cargarCorrespondencia();
      })
      .catch(error => console.error('Error al guardar:', error));
  });

  registroModalElement.addEventListener('hidden.bs.modal', () => {
    registroForm.reset();
    modalTitle.textContent = 'Registrar Nueva Correspondencia';
    idParaActualizar = null;
  });

  cargarCorrespondencia();
});
