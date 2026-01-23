// search.js

/**
 * Creates and injects a search bar above #folder-overview
 * @param {HTMLElement} container - Parent container (e.g., div.w-\[50\%\])
 * @param {Function} onSearch - Callback(searchTerm: string)
 */
export function createSearchBar(container, onSearch) {
  // Don’t create twice
  if (container.querySelector('#folder-search')) return;

  const searchBar = document.createElement('div');
  searchBar.className = 'mb-3';
  searchBar.innerHTML = `
    <input
      type="text"
      id="folder-search"
      placeholder="Search folders..."
      class="w-full px-3 py-1.5 text-sm border rounded-md border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  `;

  container.insertBefore(searchBar, container.firstChild);

  const input = searchBar.querySelector('#folder-search');
  input.addEventListener('input', (e) => {
    const term = e.target.value.trim().toLowerCase();
    onSearch(term);
  });

  return input;
}