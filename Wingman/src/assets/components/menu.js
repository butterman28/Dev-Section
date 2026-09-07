// src/assets/components/menu.js

document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.getElementById('menu-toggle');
  const dropdownMenu = document.getElementById('dropdown-menu');
  
  // Safety check in case elements aren't found
  if (!menuToggle || !dropdownMenu) return;

  // Toggle dropdown visibility
  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('hidden');
  });

  // Close dropdown when clicking anywhere outside of it
  document.addEventListener('click', (e) => {
    if (!dropdownMenu.contains(e.target) && !menuToggle.contains(e.target)) {
      dropdownMenu.classList.add('hidden');
    }
  });

  // Close dropdown immediately when a menu action is clicked
  dropdownMenu.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      dropdownMenu.classList.add('hidden');
    });
  });

  // Close dropdown when the Escape key is pressed
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdownMenu.classList.add('hidden');
    }
  });
});