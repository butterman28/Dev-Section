// src/assets/components/snackbar.js

let snackbarContainer = null;

export function createSnackbarContainer() {
  if (snackbarContainer) return snackbarContainer;

  snackbarContainer = document.createElement('div');
  // Changed z-[1000] → z-[10000] to appear above sidebar (z-[9998])
  snackbarContainer.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[10000]';
  document.body.appendChild(snackbarContainer);
  return snackbarContainer;
}

export function showSnackbar(message, { duration = 3000, type = 'success', actions = [] } = {}) {
  const container = createSnackbarContainer();

  const snackbar = document.createElement('div');
  snackbar.className = `
    px-4 py-2 rounded-lg shadow-lg text-white font-medium text-sm
    ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}
    opacity-0 transition-opacity duration-200
    flex items-center gap-3
  `;

  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  snackbar.appendChild(msgSpan);

  if (actions.length > 0) {
    const btnGroup = document.createElement('div');
    btnGroup.className = 'flex gap-2';
    actions.forEach(({ label, callback }) => {
      const btn = document.createElement('button');
      btn.className = 'bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-xs font-medium transition-colors';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        callback();
        closeSnackbar(snackbar);
      });
      btnGroup.appendChild(btn);
    });
    snackbar.appendChild(btnGroup);
    if (actions.length > 0) duration = Math.max(duration, 8000);
  }

  container.appendChild(snackbar);
  setTimeout(() => snackbar.classList.remove('opacity-0'), 10);

  const timeoutId = setTimeout(() => {
    closeSnackbar(snackbar);
  }, duration);

  snackbar.dataset.timeoutId = timeoutId;

  function closeSnackbar(el) {
    if (!el || el.parentNode === null) return;
    clearTimeout(parseInt(el.dataset.timeoutId));
    el.classList.add('opacity-0');
    setTimeout(() => {
      el.remove();
      if (container.children.length === 0) {
        container.remove();
        snackbarContainer = null;
      }
    }, 200);
  }
}