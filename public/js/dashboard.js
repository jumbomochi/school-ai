(function () {
  const socket = io();
  const grid = document.getElementById('grid');
  const modal = document.getElementById('modal');
  const modalFrame = document.getElementById('modal-frame');
  const modalClose = document.getElementById('modal-close');
  const resetAllBtn = document.getElementById('reset-all-btn');

  let maxTables = 25;
  let tables = {};
  const tableCountInput = document.getElementById('table-count');
  const setTablesBtn = document.getElementById('set-tables-btn');

  function autoGridColumns() {
    // Pick columns: aim for 5, but adjust for small counts
    const cols = maxTables <= 4 ? maxTables : maxTables <= 9 ? Math.min(maxTables, 5) : 5;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  }

  function createCard(id) {
    const card = document.createElement('div');
    card.className = 'table-card';
    card.dataset.table = id;
    card.innerHTML = `
      <button class="card-reset" title="Reset table">&times;</button>
      <div class="card-thumbnail">
        <span class="no-preview">No preview</span>
      </div>
      <div class="card-footer">
        <span class="card-label">Table ${id}</span>
        <span class="card-status"><span class="dot idle"></span> <span class="status-text">Idle</span></span>
      </div>
    `;

    card.querySelector('.card-thumbnail').addEventListener('click', () => {
      modalFrame.src = `/preview/${id}?t=${Date.now()}`;
      modal.classList.remove('hidden');
    });

    card.querySelector('.card-reset').addEventListener('click', (e) => {
      e.stopPropagation();
      socket.emit('reset-table', { table: id });
    });

    return card;
  }

  function renderGrid() {
    grid.innerHTML = '';
    for (let i = 1; i <= maxTables; i++) {
      grid.appendChild(createCard(i));
    }
    autoGridColumns();
  }

  function updateCard(id, status) {
    const card = grid.querySelector(`[data-table="${id}"]`);
    if (!card) return;
    const dot = card.querySelector('.card-status .dot');
    const text = card.querySelector('.status-text');
    dot.className = `dot ${status}`;
    text.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }

  function updateScreenshot(id, url) {
    const card = grid.querySelector(`[data-table="${id}"]`);
    if (!card) return;
    const thumb = card.querySelector('.card-thumbnail');
    thumb.innerHTML = `<img src="${url}" alt="Table ${id} preview">`;
  }

  function clearScreenshot(id) {
    const card = grid.querySelector(`[data-table="${id}"]`);
    if (!card) return;
    const thumb = card.querySelector('.card-thumbnail');
    thumb.innerHTML = `<span class="no-preview">No preview</span>`;
  }

  function updateCounters() {
    let done = 0, building = 0, active = 0;
    for (const [id, state] of Object.entries(tables)) {
      if (state.status === 'done') { done++; active++; }
      else if (state.status === 'building') { building++; active++; }
      else if (state.status === 'error') { active++; }
    }
    document.getElementById('count-done').textContent = done;
    document.getElementById('count-building').textContent = building;
    document.getElementById('count-active').textContent = active;
    document.getElementById('count-total').textContent = maxTables;
  }

  // Set table count
  setTablesBtn.addEventListener('click', () => {
    const count = parseInt(tableCountInput.value);
    if (count >= 1 && count <= 50) {
      socket.emit('set-tables', { count });
    }
  });

  tableCountInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setTablesBtn.click();
  });

  socket.on('state-sync', (data) => {
    maxTables = data.maxTables;
    tableCountInput.value = maxTables;
    tables = data.tables;
    renderGrid();
    for (const [id, state] of Object.entries(tables)) {
      updateCard(id, state.status);
      if (state.status === 'done') {
        updateScreenshot(id, `/screenshots/table-${id}.png?t=${state.timestamp}`);
      }
    }
    updateCounters();
  });

  socket.on('status-update', (data) => {
    tables[data.table] = { status: data.status, timestamp: Date.now() };
    updateCard(data.table, data.status);
    if (data.status === 'idle') clearScreenshot(data.table);
    updateCounters();
  });

  socket.on('screenshot-ready', (data) => {
    updateScreenshot(data.table, data.url);
  });

  modalClose.addEventListener('click', () => {
    modal.classList.add('hidden');
    modalFrame.src = '';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      modalFrame.src = '';
    }
  });

  resetAllBtn.addEventListener('click', () => {
    if (confirm('Reset all tables?')) {
      socket.emit('reset-table', { all: true });
    }
  });
})();
