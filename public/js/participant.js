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

  previewFrame.src = `/preview/${tableId}`;

  fetch(`/api/table/${tableId}/code`)
    .then(r => r.text())
    .then(code => {
      if (code) {
        codeDisplay.textContent = code;
        charCount.textContent = `${code.length.toLocaleString()} characters generated`;
        if (typeof Prism !== 'undefined') Prism.highlightElement(codeDisplay);
      }
    });

  stepBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      stepBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStep = btn.dataset.step;
    });
  });

  sendBtn.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    socket.emit('submit-prompt', { table: tableId, prompt, step: currentStep });
    sendBtn.disabled = true;
  });

  let codeVisible = true;
  toggleCode.addEventListener('click', () => {
    const pre = document.getElementById('code-display');
    codeVisible = !codeVisible;
    pre.style.display = codeVisible ? 'block' : 'none';
    toggleCode.textContent = codeVisible ? 'Hide' : 'Show';
  });

  socket.on('status-update', (data) => {
    if (data.table !== tableId) return;
    if (data.status === 'building') {
      buildingOverlay.classList.remove('hidden');
      sendBtn.disabled = true;
    } else {
      buildingOverlay.classList.add('hidden');
      sendBtn.disabled = false;
      if (data.status === 'done') {
        previewFrame.src = `/preview/${tableId}?t=${Date.now()}`;
        fetch(`/api/table/${tableId}/code`)
          .then(r => r.text())
          .then(code => {
            codeDisplay.textContent = code;
            charCount.textContent = `${code.length.toLocaleString()} characters generated`;
            if (typeof Prism !== 'undefined') Prism.highlightElement(codeDisplay);
          });
      }
    }
  });

  socket.on('code-update', (data) => {
    if (data.table !== tableId) return;
    codeDisplay.textContent = data.code;
    charCount.textContent = `${data.code.length.toLocaleString()} characters generated`;
    if (typeof Prism !== 'undefined') Prism.highlightElement(codeDisplay);
  });
})();
