const MIN_SCALE = 1;
const MAX_SCALE = 1.3;
const STEP = 0.1;
const DEFAULT_SCALE = 1;
const MOBILE_BREAKPOINT = 767;
const TABLET_BREAKPOINT = 1024;
const PAGINATION_OVERFLOW_TOLERANCE = 72;

const root = document.documentElement;
const shell = document.querySelector('.page-shell');
const resumeDocument = document.getElementById('resumeDocument');
const resumeSource = document.getElementById('resumeSource');
const resumePages = document.getElementById('resumePages');
const toolbar = document.querySelector('.floating-toolbar');
const resumeMenuTrigger = document.getElementById('resumeMenuTrigger');
const resumeMenuPanel = document.getElementById('resumeMenuPanel');
const blankResumeTemplate = document.getElementById('resumeTemplateBlank');
const buttons = {
  zoomIn: document.querySelector('[data-action="zoom-in"]'),
  zoomOut: document.querySelector('[data-action="zoom-out"]'),
  reset: document.querySelector('[data-action="reset"]')
};
const copyFeedbackTimers = new WeakMap();
const defaultResumeMarkup = resumeSource ? resumeSource.innerHTML : '';
const defaultTitle = document.title;
const resumeVariants = [
  { title: defaultTitle, markup: defaultResumeMarkup },
  { title: 'AI_Dev 简历', markup: blankResumeTemplate ? blankResumeTemplate.innerHTML : defaultResumeMarkup }
];

let currentScale = DEFAULT_SCALE;
let currentLayoutMode = 'desktop';
let currentResumeIndex = 0;
let isResumeMenuPinned = false;

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

function getRenderRoot() {
  if (!resumeDocument) {
    return null;
  }

  if (currentLayoutMode !== 'mobile' && resumePages && resumePages.childElementCount > 0) {
    return resumePages;
  }

  return resumeSource || resumeDocument;
}

function getAutoScale(layoutMode = currentLayoutMode) {
  const renderRoot = getRenderRoot();
  if (!renderRoot) {
    return 1;
  }

  if (layoutMode === 'tablet') {
    return Math.min(1, getShellContentWidth() / renderRoot.offsetWidth);
  }

  return 1;
}

function getEffectiveScale(layoutMode = currentLayoutMode) {
  if (layoutMode === 'mobile') {
    return 1;
  }

  return Number((currentScale * getAutoScale(layoutMode)).toFixed(4));
}

function updateStageSize() {
  const renderRoot = getRenderRoot();
  if (!renderRoot) {
    return;
  }

  const effectiveScale = getEffectiveScale(currentLayoutMode);
  root.style.setProperty('--effective-scale', effectiveScale.toString());

  if (currentLayoutMode === 'mobile') {
    root.style.setProperty('--stage-width', '100%');
    root.style.setProperty('--stage-height', 'auto');
    return;
  }

  const stageWidth = Math.ceil(renderRoot.offsetWidth * effectiveScale);
  const stageHeight = Math.ceil(renderRoot.offsetHeight * effectiveScale);

  root.style.setProperty('--stage-width', `${stageWidth}px`);
  root.style.setProperty('--stage-height', `${stageHeight}px`);
}

function getPageMetrics() {
  const renderRoot = getRenderRoot();
  if (!renderRoot) {
    return null;
  }

  const rect = renderRoot.getBoundingClientRect();
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
  const previousEffectiveScale = getEffectiveScale(currentLayoutMode);
  const anchor = preserveCenter ? getViewportAnchor(previousEffectiveScale) : null;

  currentScale = clampScale(nextScale);
  updateStageSize();
  updateToolbarState();

  if (anchor) {
    requestAnimationFrame(() => {
      const metrics = getPageMetrics();
      if (!metrics) {
        return;
      }

      const nextEffectiveScale = getEffectiveScale(currentLayoutMode);
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

function createPage(pageNumber) {
  const page = document.createElement('section');
  page.className = 'resume-page';

  if (pageNumber > 1) {
    page.classList.add('resume-page--continuation');

    const banner = document.createElement('header');
    banner.className = 'resume-page-banner';
    banner.setAttribute('aria-label', '分页信息');

    const label = document.createElement('span');
    banner.append(label);
    page.append(banner);
  }

  const content = document.createElement('div');
  content.className = 'resume-page-content';
  page.append(content);
  resumePages.append(page);

  return {
    page,
    content,
    sections: new Map()
  };
}

function cloneSectionShell(sectionSource) {
  const section = sectionSource.cloneNode(false);
  const heading = Array.from(sectionSource.children).find((child) => child.classList?.contains('section-heading'));

  if (heading) {
    section.append(heading.cloneNode(true));
  }

  return section;
}

function ensureSectionShell(pageState, sectionSource, sectionIndex) {
  if (pageState.sections.has(sectionIndex)) {
    return pageState.sections.get(sectionIndex);
  }

  const section = cloneSectionShell(sectionSource);
  pageState.content.append(section);
  pageState.sections.set(sectionIndex, section);
  return section;
}

function isOverflowing(pageState) {
  return pageState.content.scrollHeight > pageState.content.clientHeight + PAGINATION_OVERFLOW_TOLERANCE;
}

function updatePageBanners() {
  const pages = Array.from(resumePages.children);
  const total = pages.length;

  pages.forEach((page, index) => {
    if (index === 0) {
      return;
    }

    const label = page.querySelector('.resume-page-banner span');
    if (label) {
      label.textContent = `第 ${index + 1} 页 / 共 ${total} 页`;
    }
  });
}

function paginateResume() {
  if (!resumeSource || !resumePages) {
    return;
  }

  resumePages.replaceChildren();

  const header = resumeSource.querySelector('.resume-header');
  if (!header) {
    return;
  }

  const pageStates = [];
  let currentPage = createPage(1);
  pageStates.push(currentPage);
  currentPage.content.append(header.cloneNode(true));

  const sections = Array.from(resumeSource.children).filter((child) => child.classList?.contains('resume-section'));

  sections.forEach((sectionSource, sectionIndex) => {
    const items = Array.from(sectionSource.children).filter((child) => !child.classList?.contains('section-heading'));

    items.forEach((itemSource) => {
      let sectionShell = ensureSectionShell(currentPage, sectionSource, sectionIndex);
      const itemClone = itemSource.cloneNode(true);
      sectionShell.append(itemClone);

      if (isOverflowing(currentPage)) {
        sectionShell.removeChild(itemClone);

        if (sectionShell.children.length === 1) {
          sectionShell.remove();
          currentPage.sections.delete(sectionIndex);
        }

        currentPage = createPage(pageStates.length + 1);
        pageStates.push(currentPage);
        sectionShell = ensureSectionShell(currentPage, sectionSource, sectionIndex);
        sectionShell.append(itemClone);
      }
    });
  });

  updatePageBanners();
}

function syncResumeLayout() {
  if (!resumeDocument) {
    return;
  }

  currentLayoutMode = getLayoutMode();
  resumeDocument.dataset.layoutMode = currentLayoutMode;

  if (currentLayoutMode === 'mobile') {
    if (resumePages) {
      resumePages.replaceChildren();
    }
    resumeDocument.dataset.jsReady = 'true';
    return;
  }

  paginateResume();
  resumeDocument.dataset.jsReady = 'true';
}

function handleViewportChange() {
  syncResumeLayout();
  updateStageSize();
}

function updateMenuState() {
  if (!resumeMenuPanel) {
    return;
  }

  resumeMenuPanel.querySelectorAll('[data-resume-index]').forEach((item) => {
    const index = Number(item.dataset.resumeIndex);
    item.classList.toggle('is-active', index === currentResumeIndex);
  });
}

function openResumeMenu() {
  if (!resumeMenuPanel || !resumeMenuTrigger) {
    return;
  }

  resumeMenuPanel.hidden = false;
  resumeMenuTrigger.setAttribute('aria-expanded', 'true');
}

function closeResumeMenu() {
  if (!resumeMenuPanel || !resumeMenuTrigger) {
    return;
  }

  resumeMenuPanel.hidden = true;
  resumeMenuTrigger.setAttribute('aria-expanded', 'false');
}

function pinResumeMenu() {
  isResumeMenuPinned = true;
  openResumeMenu();
}

function unpinResumeMenu() {
  isResumeMenuPinned = false;
  closeResumeMenu();
}

function switchResume(index) {
  const variant = resumeVariants[index];
  if (!variant || !resumeSource || !resumeDocument) {
    return;
  }

  currentResumeIndex = index;
  document.title = variant.title;
  resumeDocument.dataset.jsReady = 'false';
  resumeSource.innerHTML = variant.markup;
  updateMenuState();
  handleViewportChange();
}

function bindResumeMenu() {
  if (!resumeMenuTrigger || !resumeMenuPanel) {
    return;
  }

  const menuRoot = resumeMenuTrigger.closest('.resume-menu');
  if (!menuRoot) {
    return;
  }

  menuRoot.addEventListener('mouseenter', openResumeMenu);
  menuRoot.addEventListener('mouseleave', () => {
    if (!isResumeMenuPinned) {
      closeResumeMenu();
    }
  });

  menuRoot.addEventListener('focusin', openResumeMenu);
  menuRoot.addEventListener('focusout', (event) => {
    const nextFocused = event.relatedTarget;
    if ((!nextFocused || !menuRoot.contains(nextFocused)) && !isResumeMenuPinned) {
      closeResumeMenu();
    }
  });

  resumeMenuTrigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (isResumeMenuPinned) {
      unpinResumeMenu();
      return;
    }

    pinResumeMenu();
  });

  resumeMenuPanel.addEventListener('click', (event) => {
    const target = event.target.closest('[data-resume-index]');
    if (!target) {
      return;
    }

    const nextIndex = Number(target.dataset.resumeIndex);
    if (Number.isNaN(nextIndex)) {
      return;
    }

    switchResume(nextIndex);
  });

  document.addEventListener('click', (event) => {
    if (!isResumeMenuPinned) {
      return;
    }

    if (!menuRoot.contains(event.target)) {
      unpinResumeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      unpinResumeMenu();
    }
  });
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

function bindCopyActions() {
  document.addEventListener('click', async (event) => {
    const element = event.target.closest('.identity-action[data-copy]');
    if (!element) {
      return;
    }

    event.preventDefault();

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
}

if (resumeDocument) {
  updateMenuState();
  bindResumeMenu();
  handleViewportChange();
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('load', handleViewportChange);
}

if (toolbar && buttons.zoomIn && buttons.zoomOut && buttons.reset) {
  toolbar.addEventListener('click', handleToolbarClick);
  updateScale(DEFAULT_SCALE);
}

bindCopyActions();
