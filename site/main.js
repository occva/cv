const MIN_SCALE = 1;
const MAX_SCALE = 1.3;
const STEP = 0.1;
const DEFAULT_SCALE = 1;
const MOBILE_BREAKPOINT = 767;
const TABLET_BREAKPOINT = 1024;

const root = document.documentElement;
const shell = document.querySelector('.page-shell');
const page = document.getElementById('resumePage');
const toolbar = document.querySelector('.floating-toolbar');
const contactActions = document.querySelectorAll('.identity-action[data-copy]');
const buttons = {
  zoomIn: document.querySelector('[data-action="zoom-in"]'),
  zoomOut: document.querySelector('[data-action="zoom-out"]'),
  reset: document.querySelector('[data-action="reset"]')
};
const copyFeedbackTimers = new WeakMap();

let currentScale = DEFAULT_SCALE;

function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
}

function getLayoutMode() {
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    return 'mobile';
  }

  if (window.innerWidth <= TABLET_BREAKPOINT) {
    return 'tablet';
  }

  return 'desktop';
}

function getShellContentWidth() {
  if (!shell) {
    return window.innerWidth;
  }

  const styles = window.getComputedStyle(shell);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  return shell.clientWidth - paddingLeft - paddingRight;
}

function getAutoScale(layoutMode = getLayoutMode()) {
  if (!page) {
    return 1;
  }

  if (layoutMode === 'tablet') {
    return Math.min(1, getShellContentWidth() / page.offsetWidth);
  }

  return 1;
}

function getEffectiveScale(layoutMode = getLayoutMode()) {
  if (layoutMode === 'mobile') {
    return 1;
  }

  return Number((currentScale * getAutoScale(layoutMode)).toFixed(4));
}

function updateStageSize() {
  if (!page) {
    return;
  }

  const layoutMode = getLayoutMode();
  const autoScale = getAutoScale(layoutMode);
  const effectiveScale = getEffectiveScale(layoutMode);

  root.style.setProperty('--auto-scale', autoScale.toString());
  root.style.setProperty('--effective-scale', effectiveScale.toString());

  if (layoutMode === 'mobile') {
    root.style.setProperty('--stage-width', '100%');
    root.style.setProperty('--stage-height', 'auto');
    return;
  }

  const stageWidth = Math.ceil(page.offsetWidth * effectiveScale);
  const stageHeight = Math.ceil(page.offsetHeight * effectiveScale);

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

function updateToolbarState() {
  if (!buttons.zoomIn || !buttons.zoomOut || !buttons.reset) {
    return;
  }

  buttons.zoomIn.disabled = currentScale >= MAX_SCALE;
  buttons.zoomOut.disabled = currentScale <= MIN_SCALE;
  buttons.reset.disabled = currentScale === DEFAULT_SCALE;
  buttons.reset.textContent = `${Math.round(currentScale * 100)}%`;
}

function updateScale(nextScale, preserveCenter = false) {
  const previousEffectiveScale = getEffectiveScale();
  const anchor = preserveCenter ? getViewportAnchor(previousEffectiveScale) : null;

  currentScale = clampScale(nextScale);
  root.style.setProperty('--page-scale', currentScale.toString());
  updateStageSize();
  updateToolbarState();

  if (anchor) {
    requestAnimationFrame(() => {
      const metrics = getPageMetrics();
      if (!metrics) {
        return;
      }

      const nextEffectiveScale = getEffectiveScale();
      const scaleRatio = nextEffectiveScale / anchor.scale;
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

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function flashCopiedState(element) {
  const originalLabel = element.dataset.label || element.textContent.trim();
  if (!element.dataset.label) {
    element.dataset.label = originalLabel;
  }

  const textNode = element.querySelector('span');
  if (!textNode) {
    return;
  }

  textNode.textContent = '已复制';
  window.clearTimeout(copyFeedbackTimers.get(element));

  const timer = window.setTimeout(() => {
    textNode.textContent = originalLabel;
  }, 1200);

  copyFeedbackTimers.set(element, timer);
}

function bindContactActions() {
  contactActions.forEach((element) => {
    element.addEventListener('click', async () => {
      const value = element.dataset.copy;
      if (!value) {
        return;
      }

      try {
        await copyText(value);
        flashCopiedState(element);
      } catch (error) {
        console.error('Copy failed:', error);
      }
    });
  });
}

if (page) {
  window.addEventListener('resize', updateStageSize);
  window.addEventListener('load', updateStageSize);
}

if (toolbar && page && buttons.zoomIn && buttons.zoomOut && buttons.reset) {
  toolbar.addEventListener('click', handleToolbarClick);
  updateScale(DEFAULT_SCALE);
}

if (contactActions.length > 0) {
  bindContactActions();
}
