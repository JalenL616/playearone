const keys = {};

function initInput() {
  window.addEventListener('keydown', (event) => {
    keys[event.key] = true;

    // Prevent arrow keys from scrolling the page
    if (['ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    keys[event.key] = false;
  });
}
