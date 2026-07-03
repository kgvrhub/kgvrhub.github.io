(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ══════════════ Preloader / page transition ══════════════ */
  const overlay = document.getElementById('pageTransition');

  function revealPage() {
    if (!overlay) return;
    if (reduceMotion) { overlay.style.display = 'none'; return; }
    setTimeout(() => { overlay.style.transform = 'translateX(-100%)'; }, 1150);
  }
  revealPage();

  function goTo(href) {
    if (!overlay || reduceMotion) { window.location.href = href; return; }
    overlay.classList.add('no-transition');
    overlay.style.transform = 'translateX(100%)';
    overlay.offsetWidth; // force reflow
    overlay.classList.remove('no-transition');
    requestAnimationFrame(() => { overlay.style.transform = 'translateX(0)'; });
    setTimeout(() => { window.location.href = href; }, 680);
  }

  document.querySelectorAll('a[data-transition]').forEach(link => {
    link.addEventListener('click', e => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || link.target === '_blank') return;
      e.preventDefault();
      goTo(href);
    });
  });

  /* ══════════════ Custom cursor ══════════════ */
  const cursor = document.getElementById('cursorDot');
  if (fine && cursor) {
    window.addEventListener('mousemove', e => {
      cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
    });
  }
  function bindHoverCursor(root) {
    if (!fine || !cursor) return;
    root.querySelectorAll('.hoverable').forEach(el => {
      if (el.dataset.cursorBound) return;
      el.dataset.cursorBound = '1';
      el.addEventListener('mouseenter', () => cursor.classList.add('grow'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('grow'));
    });
  }
  bindHoverCursor(document);

  /* ══════════════ Lightbox (shared) ══════════════ */
  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  function openLightbox(src, alt) {
    if (!lightbox || !lbImg) return;
    lbImg.src = src;
    lbImg.alt = alt || 'Enlarged view';
    lightbox.classList.add('active');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('active');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    setTimeout(() => { if (lbImg) lbImg.src = ''; }, 250);
  }
  function bindLightbox(root) {
    root.querySelectorAll('.gallery-item img, .overlay-item img').forEach(img => {
      if (img.dataset.lbBound) return;
      img.dataset.lbBound = '1';
      img.addEventListener('click', e => {
        e.stopPropagation();
        openLightbox(img.getAttribute('data-full') || img.src, img.alt);
      });
    });
  }
  bindLightbox(document);
  if (lightbox) {
    lightbox.addEventListener('click', e => {
      if (e.target === lbImg) return;
      closeLightbox();
    });
  }

  /* ══════════════ Floating pill nav (menu open/close) ══════════════ */
  const navPill = document.getElementById('navPill');
  const toggle = document.getElementById('toggle');
  const menu = document.getElementById('menu');

  function positionMenu() {
    if (!navPill || !menu) return;
    const pillRect = navPill.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const margin = 12;
    let top = pillRect.bottom + margin;
    let left = pillRect.left;
    let originV = 'top';
    if (top + menuRect.height > window.innerHeight - margin) {
      top = pillRect.top - menuRect.height - margin;
      originV = 'bottom';
    }
    if (left + menuRect.width > window.innerWidth - margin) {
      left = window.innerWidth - menuRect.width - margin;
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    menu.style.transformOrigin = originV + ' left';
  }

  function openMenu() {
    if (!toggle || !menu) return;
    positionMenu();
    toggle.classList.add('active');
    toggle.setAttribute('aria-expanded', 'true');
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
  }
  function closeMenu() {
    if (!toggle || !menu) return;
    toggle.classList.remove('active');
    toggle.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
  }
  if (toggle && menu && navPill) {
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      menu.classList.contains('open') ? closeMenu() : openMenu();
    });
    document.addEventListener('click', e => {
      if (menu.classList.contains('open') && !menu.contains(e.target) && !navPill.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    window.addEventListener('resize', () => { if (menu.classList.contains('open')) positionMenu(); });
  }

  /* ══════════════ Draggable pills ══════════════
     Distinguishes a tap (click passes through normally) from a drag
     (moves the pill and suppresses the resulting click). Position
     persists for the session via sessionStorage. */
  function makeDraggable(el, opts) {
    if (!el) return null;
    const mode = opts.mode || 'fixed'; // 'fixed' (viewport) or 'absolute' (within container)
    const container = opts.container || null;
    const storageKey = opts.storageKey;
    const clearsTransform = !!opts.clearsTransform;
    const THRESHOLD = 6;

    let pointerId = null;
    let dragging = false, moved = false;
    let startClientX = 0, startClientY = 0;
    let baseLeft = 0, baseTop = 0;

    function containerRect() {
      return container ? container.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }

    function maxLeftTop() {
      const elRect = el.getBoundingClientRect();
      if (mode === 'fixed') {
        return { maxLeft: window.innerWidth - elRect.width, maxTop: window.innerHeight - elRect.height };
      }
      const cRect = containerRect();
      return { maxLeft: cRect.width - elRect.width, maxTop: cRect.height - elRect.height };
    }

    function setPosition(left, top, save) {
      const { maxLeft, maxTop } = maxLeftTop();
      left = Math.min(Math.max(left, 0), Math.max(maxLeft, 0));
      top = Math.min(Math.max(top, 0), Math.max(maxTop, 0));
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      if (clearsTransform) el.style.transform = 'none';
      if (save && storageKey) {
        try { sessionStorage.setItem(storageKey, JSON.stringify({ left, top })); } catch (e) {}
      }
      return { left, top };
    }

    function restorePosition() {
      if (!storageKey) return false;
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return false;
        const pos = JSON.parse(raw);
        setPosition(pos.left, pos.top, false);
        return true;
      } catch (e) { return false; }
    }

    el.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      pointerId = e.pointerId;
      dragging = true;
      moved = false;
      startClientX = e.clientX;
      startClientY = e.clientY;
      try { el.setPointerCapture(pointerId); } catch (err) {}
    });

    el.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== pointerId) return;
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (!moved && Math.hypot(dx, dy) > THRESHOLD) {
        moved = true;
        el.classList.add('dragging');
        const elRect = el.getBoundingClientRect();
        const refRect = containerRect();
        baseLeft = elRect.left - refRect.left;
        baseTop = elRect.top - refRect.top;
      }
      if (moved) setPosition(baseLeft + dx, baseTop + dy, false);
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      if (moved) {
        const dx = (e.clientX || startClientX) - startClientX;
        const dy = (e.clientY || startClientY) - startClientY;
        setPosition(baseLeft + dx, baseTop + dy, true);
        const suppressClick = evt => {
          evt.preventDefault();
          evt.stopPropagation();
          el.removeEventListener('click', suppressClick, true);
        };
        el.addEventListener('click', suppressClick, true);
      }
      moved = false;
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    window.addEventListener('resize', () => {
      if (el.style.left && el.style.top) {
        setPosition(parseFloat(el.style.left), parseFloat(el.style.top), !!storageKey);
      }
    });

    return { restorePosition, setPosition };
  }

  if (navPill) {
    const navDrag = makeDraggable(navPill, { mode: 'fixed', storageKey: 'kgvr_navpill_pos' });
    navDrag && navDrag.restorePosition();
  }

  const teaserWrap = document.getElementById('teaserWrap');
  const enterArchivePill = document.getElementById('enterArchivePill');
  if (teaserWrap && enterArchivePill) {
    const archiveDrag = makeDraggable(enterArchivePill, {
      mode: 'absolute', container: teaserWrap, storageKey: 'kgvr_enterpill_pos', clearsTransform: true
    });
    archiveDrag && archiveDrag.restorePosition();
  }

  /* ══════════════ Category overlay (archive page only) ══════════════ */
  const categoryOverlay = document.getElementById('categoryOverlay');
  const overlayHeading = document.getElementById('overlayHeading');
  const overlayGrid = document.getElementById('overlayGrid');
  const overlayClose = document.getElementById('overlayClose');

  const CATEGORIES = {
    branding: {
      label: 'Branding',
      items: [
        { src: 'assets/blank.png', alt: 'Blank — brand manifesto poster, "Every designer starts here," KGVR Media', client: 'Blank', concept: 'Brand Manifesto Poster', w: 1080, h: 1920, accent: '#ffffff' },
        { src: 'assets/obsidian-studio.png', alt: 'Obsidian Studio — logo and identity design for a luxury architecture practice', client: 'Obsidian Studio', concept: 'Logo & Identity System', w: 2000, h: 2000, accent: '#ffffff' }
      ]
    },
    automotive: {
      label: 'Automotive',
      items: [
        { src: 'assets/timeless.jpg', alt: 'Porsche 911 — Timeless campaign visual, rear three-quarter view', client: 'Porsche', concept: 'Timeless — 911 Campaign', w: 1920, h: 1080, accent: '#d1905e' },
        { src: 'assets/audacity.jpg', alt: 'BMW XM — Audacity campaign visual, front three-quarter view in falling snow', client: 'BMW XM', concept: 'Audacity Campaign', w: 1920, h: 1080, accent: '#5c7cb8' },
        { src: 'assets/bmw-m5-g90.jpg', alt: 'BMW M5 G90 — Heavy Luxury feature, front-facing studio shot', client: 'BMW M5 G90', concept: 'Heavy Luxury Feature', w: 1080, h: 1920, accent: '#c7a15a' }
      ]
    },
    beauty: {
      label: 'Beauty',
      items: [
        { src: 'assets/maes-beauty.png', alt: "Mae's Beauty Collections — logo and brand identity design", client: "Mae's Beauty Collections", concept: 'Logo & Brand Identity', w: 2000, h: 2000, accent: '#d15e61' },
        { src: 'assets/summer-olive-state.png', alt: 'Summer — Olive State Collection campaign poster, quiet luxury fashion editorial', client: 'Olive State Collection', concept: 'Summer Campaign Poster', w: 1080, h: 1920, accent: '#b8b55c' }
      ]
    }
  };

  let lastFocusedTile = null;

  function buildOverlayItem(item, categoryKey) {
    const fig = document.createElement('figure');
    fig.className = 'overlay-item';
    if (item.accent) fig.style.setProperty('--item-accent-bright', item.accent);
    const img = document.createElement('img');
    img.src = item.src;
    img.alt = item.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = item.w;
    img.height = item.h;
    img.setAttribute('data-full', item.src);
    fig.appendChild(img);
    const cap = document.createElement('figcaption');
    cap.className = 'caption-pill';
    const client = document.createElement('span');
    client.className = 'client';
    client.textContent = item.client;
    const concept = document.createElement('span');
    concept.className = 'concept';
    concept.textContent = item.concept;
    cap.appendChild(client);
    cap.appendChild(concept);
    fig.appendChild(cap);

    if (fine && item.accent) {
      fig.addEventListener('mouseenter', () => {
        document.documentElement.style.setProperty('--cursor-color', item.accent);
      });
      fig.addEventListener('mouseleave', () => {
        document.documentElement.style.setProperty('--cursor-color', `var(--accent-${categoryKey}-bright)`);
      });
    }
    return fig;
  }

  function openCategory(key, triggerEl) {
    const data = CATEGORIES[key];
    if (!data || !categoryOverlay || !overlayGrid || !overlayHeading) return;
    lastFocusedTile = triggerEl || document.activeElement;

    overlayHeading.textContent = data.label;
    overlayGrid.innerHTML = '';
    overlayGrid.classList.remove('cols-1', 'cols-2', 'cols-4');
    const count = data.items.length;
    overlayGrid.classList.add(count <= 1 ? 'cols-1' : count === 2 ? 'cols-2' : 'cols-4');
    data.items.forEach(item => overlayGrid.appendChild(buildOverlayItem(item, key)));

    categoryOverlay.style.setProperty('--overlay-accent', `var(--accent-${key})`);
    categoryOverlay.style.setProperty('--overlay-accent-bright', `var(--accent-${key}-bright)`);
    document.documentElement.style.setProperty('--cursor-color', `var(--accent-${key}-bright)`);

    categoryOverlay.classList.add('open');
    categoryOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    bindHoverCursor(overlayGrid);
    bindLightbox(overlayGrid);

    requestAnimationFrame(() => { if (overlayClose) overlayClose.focus(); });
  }

  function closeCategory() {
    if (!categoryOverlay) return;
    categoryOverlay.classList.remove('open');
    categoryOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    document.documentElement.style.removeProperty('--cursor-color');
    if (lastFocusedTile) lastFocusedTile.focus();
  }

  if (categoryOverlay) {
    document.querySelectorAll('.category-tile').forEach(tile => {
      tile.addEventListener('click', () => openCategory(tile.dataset.category, tile));
    });
    if (overlayClose) overlayClose.addEventListener('click', closeCategory);
    categoryOverlay.addEventListener('click', e => {
      if (e.target.closest('.overlay-item') || e.target.closest('.overlay-close')) return;
      closeCategory();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && categoryOverlay.classList.contains('open')) closeCategory();
    });
  }
})();
