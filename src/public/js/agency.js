document.addEventListener('DOMContentLoaded', () => {
  
  // ==========================================
  // Intersection Observer for Fade-Up Animations
  // ==========================================
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-up').forEach(el => {
    observer.observe(el);
  });

  // ==========================================
  // Command Palette Logic (Cmd/Ctrl + K)
  // ==========================================
  const paletteOverlay = document.getElementById('cmd-palette');
  const paletteInput = document.getElementById('cmd-input');
  const paletteItems = document.querySelectorAll('.cmd-item');
  let activeIndex = -1;

  function togglePalette() {
    const isActive = paletteOverlay.classList.contains('active');
    if (isActive) {
      paletteOverlay.classList.remove('active');
      paletteInput.blur();
    } else {
      paletteOverlay.classList.add('active');
      paletteInput.value = '';
      filterItems('');
      paletteInput.focus();
      activeIndex = -1;
      updateActiveItem();
    }
  }

  // Keyboard listener for Cmd/Ctrl + K
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      togglePalette();
    }
    
    // Esc to close
    if (e.key === 'Escape' && paletteOverlay.classList.contains('active')) {
      togglePalette();
    }
    
    // Arrow navigation inside palette
    if (paletteOverlay.classList.contains('active')) {
      const visibleItems = Array.from(paletteItems).filter(item => item.style.display !== 'none');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % visibleItems.length;
        updateActiveItem(visibleItems);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + visibleItems.length) % visibleItems.length;
        updateActiveItem(visibleItems);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < visibleItems.length) {
          visibleItems[activeIndex].click();
        }
      }
    }
  });

  // Close on click outside
  paletteOverlay.addEventListener('click', (e) => {
    if (e.target === paletteOverlay) {
      togglePalette();
    }
  });

  // Filter items
  paletteInput.addEventListener('input', (e) => {
    filterItems(e.target.value);
    activeIndex = -1;
    updateActiveItem();
  });

  function filterItems(query) {
    const lowerQuery = query.toLowerCase();
    paletteItems.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(lowerQuery)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  function updateActiveItem(visibleItems = Array.from(paletteItems).filter(i => i.style.display !== 'none')) {
    paletteItems.forEach(item => item.classList.remove('active'));
    if (activeIndex >= 0 && activeIndex < visibleItems.length) {
      visibleItems[activeIndex].classList.add('active');
      visibleItems[activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // Handle clicking items
  paletteItems.forEach(item => {
    item.addEventListener('click', () => {
      const action = item.getAttribute('data-action');
      if (action.startsWith('#')) {
        // Scroll to section
        const section = document.querySelector(action);
        if (section) {
          section.scrollIntoView({ behavior: 'smooth' });
        }
      } else if (action.startsWith('/')) {
        // Navigate
        window.location.href = action;
      }
      togglePalette();
    });
  });

  // FAB click opens palette
  const fab = document.getElementById('fab-command');
  if (fab) {
    fab.addEventListener('click', togglePalette);
  }

});
