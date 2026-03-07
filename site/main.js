const MIN_SCALE = 1;
const MAX_SCALE = 1.3;
const STEP = 0.1;
const DEFAULT_SCALE = 1;

const root = document.documentElement;
const page = document.getElementById('resumePage');
const toolbar = document.querySelector('.floating-toolbar');
const buttons = {
  zoomIn: document.querySelector('[data-action="zoom-in"]'),
  zoomOut: document.querySelector('[data-action="zoom-out"]'),
  reset: document.querySelector('[data-action="reset"]')
};

let currentScale = DEFAULT_SCALE;

function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
}

function updateStageSize() {
  if (!page) {
    return;
  }

  const stageWidth = Math.ceil(page.offsetWidth * currentScale);
  const stageHeight = Math.ceil(page.offsetHeight * currentScale);

  root.style.setProperty('--stage-width', `${stageWidth}px`);
  root.style.setProperty('--stage-height', `${stageHeight}px`);
}

function getPageMetrics() {
  if (!page) {
    return null;
  }

  const rect = page.getBoundingClientRect();
  return {
    left: rect.left + window.scrollX,
    top: rect.top + window.scrollY
  };
}

function getViewportAnchor(scale) {
  const metrics = getPageMetrics();
  if (!metrics) {
    return null;
  }

  return {
    offsetX: window.scrollX + window.innerWidth / 2 - metrics.left,
    offsetY: window.scrollY - metrics.top,
    scale
  };
}

function updateScale(nextScale, preserveCenter = false) {
  const previousScale = currentScale;
  const anchor = preserveCenter ? getViewportAnchor(previousScale) : null;

  currentScale = clampScale(nextScale);
  root.style.setProperty('--page-scale', currentScale.toString());
  updateStageSize();

  buttons.zoomIn.disabled = currentScale >= MAX_SCALE;
  buttons.zoomOut.disabled = currentScale <= MIN_SCALE;
  buttons.reset.disabled = currentScale === DEFAULT_SCALE;
  buttons.reset.textContent = `${Math.round(currentScale * 100)}%`;

  if (anchor) {
    requestAnimationFrame(() => {
      const metrics = getPageMetrics();
      if (!metrics) {
        return;
      }

      const scaleRatio = currentScale / anchor.scale;
      const targetScrollX = metrics.left + anchor.offsetX * scaleRatio - window.innerWidth / 2;
      const targetScrollY = metrics.top + anchor.offsetY * scaleRatio;

      window.scrollTo({
        left: Math.max(0, targetScrollX),
        top: Math.max(0, targetScrollY),
        behavior: 'auto'
      });
    });
  }
}

function handleToolbarClick(event) {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) {
    return;
  }

  if (action === 'zoom-in') {
    updateScale(currentScale + STEP, true);
    return;
  }

  if (action === 'zoom-out') {
    updateScale(currentScale - STEP, true);
    return;
  }

  updateScale(DEFAULT_SCALE, true);
}

if (page) {
  window.addEventListener('resize', updateStageSize);
  window.addEventListener('load', updateStageSize);
}

if (toolbar && page && buttons.zoomIn && buttons.zoomOut && buttons.reset) {
  toolbar.addEventListener('click', handleToolbarClick);
  updateScale(DEFAULT_SCALE);
}
