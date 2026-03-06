(function () {
  const tableId = parseInt(window.location.pathname.split('/').pop());
  const socket = io();
  let currentStep = 'create';

  const badge = document.getElementById('table-badge');
  const promptInput = document.getElementById('prompt-input');
  const sendBtn = document.getElementById('send-btn');
  const codeDisplay = document.querySelector('#code-display code');
  const charCount = document.getElementById('char-count');
  const toggleCode = document.getElementById('toggle-code');
  const previewFrame = document.getElementById('preview-frame');
  const buildingOverlay = document.getElementById('building-overlay');
  const stepBtns = document.querySelectorAll('.step-btn');

  badge.textContent = `Table ${tableId}`;
  document.title = `Table ${tableId} — Claude Code Demo`;

  // Load existing preview and code on page load
  fetch(`/api/table/${tableId}/code`).then(r => r.text()).then(code => {
    if (code) {
      previewFrame.src = `/preview/${tableId}`;
      codeDisplay.textContent = code;
      charCount.textContent = `${code.length.toLocaleString()} characters generated`;
      if (typeof Prism !== 'undefined') Prism.highlightElement(codeDisplay);
    }
  });

  // Step buttons
  stepBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      stepBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStep = btn.dataset.step;
    });
  });

  // Send prompt
  sendBtn.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    socket.emit('submit-prompt', { table: tableId, prompt, step: currentStep });
    sendBtn.disabled = true;
  });

  // Toggle code panel
  let codeVisible = true;
  toggleCode.addEventListener('click', () => {
    const pre = document.getElementById('code-display');
    codeVisible = !codeVisible;
    pre.style.display = codeVisible ? 'block' : 'none';
    toggleCode.textContent = codeVisible ? 'Hide' : 'Show';
  });

  // Status updates
  socket.on('status-update', (data) => {
    if (data.table !== tableId) return;
    if (data.status === 'building') {
      buildingOverlay.classList.remove('hidden');
      sendBtn.disabled = true;
      // Clear code display for fresh stream
      codeDisplay.textContent = '';
      charCount.textContent = 'Generating...';
    } else {
      buildingOverlay.classList.add('hidden');
      sendBtn.disabled = false;
      if (data.status === 'done') {
        previewFrame.src = `/preview/${tableId}?t=${Date.now()}`;
        // Final highlight after streaming completes
        if (typeof Prism !== 'undefined') Prism.highlightElement(codeDisplay);
      }
    }
  });

  // Streaming code chunks
  let streamScrollInterval = null;
  socket.on('code-stream', (data) => {
    if (data.table !== tableId) return;
    codeDisplay.textContent = data.full;
    charCount.textContent = `${data.full.length.toLocaleString()} characters generated`;

    // Auto-scroll code panel to bottom during streaming
    const pre = document.getElementById('code-display');
    pre.scrollTop = pre.scrollHeight;
  });

  // Final code update (after extractHtml processing)
  socket.on('code-update', (data) => {
    if (data.table !== tableId) return;
    codeDisplay.textContent = data.code;
    charCount.textContent = `${data.code.length.toLocaleString()} characters generated`;
    if (typeof Prism !== 'undefined') Prism.highlightElement(codeDisplay);
  });
})();
