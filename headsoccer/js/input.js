const keys = {};

function initInput() {
  document.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    // Prevent scrolling on game keys
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
    }
  });

  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });
}
