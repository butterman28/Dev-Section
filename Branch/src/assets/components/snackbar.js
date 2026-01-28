// ./assets/utils/snackbar.js

let snackbarContainer = null;

function createSnackbarContainer() {
  if (snackbarContainer) return snackbarContainer;

  snackbarContainer = document.createElement('div');
  snackbarContainer.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[1000]';
  document.body.appendChild(snackbarContainer);
  return snackbarContainer;
}

export function showSnackbar(message, { duration = 3000, type = 'success' } = {}) {
  const container = createSnackbarContainer();

  // Create snackbar element
  const snackbar = document.createElement('div');
  snackbar.className = `
    px-4 py-2 rounded-lg shadow-lg text-white font-medium text-sm
    ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}
    opacity-0 transition-opacity duration-200
  `;
  snackbar.textContent = message;

  // Add to container
  container.appendChild(snackbar);

  // Trigger fade-in
  setTimeout(() => snackbar.classList.remove('opacity-0'), 10);

  // Auto-remove after duration
  setTimeout(() => {
    snackbar.classList.add('opacity-0');
    setTimeout(() => {
      snackbar.remove();
      // Clean up container if empty
      if (container.children.length === 0) {
        container.remove();
        snackbarContainer = null;
      }
    }, 200);
  }, duration);
}