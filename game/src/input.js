// SOLMAR BAY — keyboard and mouse input. Held keys give movement; one-shot
// presses (enter car, action, pause, mute) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or counted
// twice. Mouse movement steers the third-person camera; click shoots.
export const ACTION_ENTER = 1;
export const ACTION_USE = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let locked = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && !event.repeat) actions |= ACTION_ENTER;
    else if (event.code === 'KeyF' && !event.repeat) actions |= ACTION_USE;
    else if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) actions |= ACTION_PAUSE;
    else if (event.code === 'KeyM' && !event.repeat) actions |= ACTION_MUTE;
    else if (event.code === 'KeyR' && !event.repeat) actions |= ACTION_RESTART;
    keys.add(event.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });

  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    mouseDX += event.movementX || 0;
    mouseDY += event.movementY || 0;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('click', () => {
    if (!locked && document.body.dataset.playing === '1') {
      try {
        canvas.requestPointerLock();
      } catch {
        // Pointer lock can fail in headless runs; the game still plays.
      }
    }
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) mouseDown = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });

  function has(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  return {
    /** Forward/back/left/right as -1, 0 or 1 each, plus run and mouse deltas. */
    move() {
      return {
        f: (has(FORWARD) ? 1 : 0) - (has(BACK) ? 1 : 0),
        s: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0),
        run: has(RUN),
        dx: mouseDX,
        dy: mouseDY,
      };
    },
    consumeMouse() {
      mouseDX = 0;
      mouseDY = 0;
    },
    get firing() {
      return mouseDown;
    },
    get space() {
      return keys.has('Space');
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
