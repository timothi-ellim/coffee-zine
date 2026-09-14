/* A small, progressively enhanced reader. No packages or tracking. */
(() => {
  'use strict';
  const root = document.documentElement;
  const sections = [...document.querySelectorAll('[data-view]')];
  const status = document.querySelector('#status');
  let statusTimer;
  const announce = (message) => {
    clearTimeout(statusTimer);
    status.textContent = message;
    statusTimer = setTimeout(() => { status.textContent = ''; }, 7000);
  };
  const downloadForm = document.querySelector('#download-form');
  if (downloadForm) {
    const endpoint = downloadForm.dataset.endpoint;
    const email = downloadForm.querySelector('[name=email]');
    const submit = downloadForm.querySelector('[type=submit]');
    const feedback = document.querySelector('#download-status');
    let sending = false;
    const connected = /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(endpoint || '');
    submit.disabled = !connected;
    downloadForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!connected || sending) return;
      email.value = email.value.trim();
      if (!downloadForm.reportValidity()) return;
      if (downloadForm.querySelector('[name=_gotcha]').value) return;
      sending = true; submit.disabled = true;
      downloadForm.setAttribute('aria-busy', 'true');
      feedback.textContent = 'Submitting…';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(endpoint, {
          method:'POST', body:new FormData(downloadForm),
          headers:{Accept:'application/json'}, signal:controller.signal,
          credentials:'omit', referrerPolicy:'no-referrer'
        });
        const result = await response.json();
        if (!response.ok || result?.ok === false || result?.error || result?.errors) throw new Error('submission');
        const links = [...document.querySelectorAll('[data-download-file]')];
        links.forEach(link => {
          link.href = link.dataset.downloadFile;
          link.setAttribute('download', '');
          link.removeAttribute('aria-disabled'); link.removeAttribute('tabindex');
        });
        settle();
        const cards = document.querySelector('.download-cards');
        const before = cards.getBoundingClientRect();
        downloadForm.reset(); downloadForm.hidden = true;
        feedback.textContent = 'Email received. Choose a PDF below.';
        // Commit success first; interruption cannot lock the files again.
        const after = cards.getBoundingClientRect();
        if (feedback.getClientRects().length) animate(cards, [
          {transform:`translateY(${before.top-after.top}px)`,opacity:.65},
          {transform:'none',opacity:1}
        ], 260);
        if (feedback.getClientRects().length) links[0]?.focus({preventScroll:true});
      } catch (_) {
        feedback.textContent = 'Your request could not be confirmed. Please try again.';
        if (feedback.getClientRects().length) feedback.focus({preventScroll:true});
      } finally {
        clearTimeout(timeout); sending = false; submit.disabled = false;
        downloadForm.removeAttribute('aria-busy');
      }
    });
  }
  function targetForHash() {
    let id = location.hash.slice(1) || 'home';
    try { id = decodeURIComponent(id); } catch (_) { id = 'home'; }
    return document.getElementById(id) || document.getElementById('home');
  }
  let activeView = 'read';
  let selectedPage = 1, revision = 0, frame = 0, transition = null, emphasisTimer;
  let scrollSelectionEnabled = false;
  let readingLayout = 'scroll';
  const photoPages = [...document.querySelectorAll('.zine-page')];
  const readerToolbar = document.querySelector('.reader-toolbar');
  const coverPage = photoPages[0], coverHome = document.querySelector('.hero-art');
  const coverImage = coverPage.querySelector('img');
  const releaseCover = () => root.classList.remove('cover-loading');
  if (coverImage.complete) releaseCover();
  else { coverImage.addEventListener('load', releaseCover, {once:true}); coverImage.addEventListener('error', releaseCover, {once:true}); }
  const readerList = document.querySelector('.reader-list');
  const notesControl = document.querySelector('#reader-notes');
  const focusControl = document.querySelector('#reading-focus');
  let readingFocus = false;
  function setReadingFocus(enabled, align = true) {
    settle(); stopAlignment();
    readingFocus = enabled; root.dataset.focusReading = String(enabled);
    focusControl.textContent = enabled ? 'Exit focus' : 'Reading focus';
    focusControl.setAttribute('aria-pressed', String(enabled));
    root.style.setProperty('--header', document.querySelector('.site-header').offsetHeight + 'px');
    root.style.setProperty('--readerbar', readerToolbar.offsetHeight + 'px');
    if (align) {
      const page = photoPages[selectedPage - 1];
      window.scrollTo({top:page.getBoundingClientRect().top + scrollY - document.querySelector('.site-header').offsetHeight - readerToolbar.offsetHeight - 16,behavior:'instant'});
      focusControl.focus({preventScroll:true});
    }
  }
  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionControl = document.querySelector('#motion-preference');
  let preference = 'system';
  try { preference = localStorage.getItem('zine-motion') || 'system'; } catch (_) {}
  if (!['system','reduce'].includes(preference)) preference = 'system';
  const reduced = () => preference === 'reduce' || systemMotion.matches;
  function settle() {
    revision++;
    if (transition) { const current = transition; transition = null; current.cancel(); }
  }
  function motionChanged() {
    settle();
    root.dataset.motion = reduced() ? 'reduce' : 'full';
    motionControl.value = preference;
  }
  motionControl.addEventListener('change', () => {
    preference = motionControl.value;
    try { localStorage.setItem('zine-motion', preference); } catch (_) {}
    motionChanged();
  });
  systemMotion.addEventListener('change', motionChanged);
  motionChanged();
  // One owner for every decorative animation. Semantic content is never hidden by it.
  function animate(element, frames, duration, cleanup = () => {}) {
    animateTogether([{element, frames}], duration, cleanup);
  }
  function animateTogether(parts, duration, cleanup = () => {}) {
    settle();
    if (reduced() || document.hidden || parts.some(p => typeof p.element?.animate !== 'function')) { cleanup(); return; }
    const animations = [];
    let cleaned = false;
    const finish = () => { if (!cleaned) { cleaned = true; cleanup(); } };
    const owner = {cancel: () => { animations.forEach(a => a.cancel()); finish(); }};
    try { parts.forEach(({element, frames}) => animations.push(element.animate(frames, {duration, easing:'cubic-bezier(.22,.7,.25,1)'}))); }
    catch (_) { owner.cancel(); return; }
    transition = owner;
    Promise.all(animations.map(a => a.finished)).then(() => {
      if (transition === owner) transition = null;
      finish();
    }).catch(() => {});
  }
  function unfold() {
    const map = document.querySelector('.sheet-map'), image = map.querySelector('img');
    const token = revision;
    const reveal = () => {
      if (token !== revision || activeView !== 'unfold' || reduced() || !image.naturalWidth) return;
      const overlay = document.createElement('div');
      overlay.className = 'fold-overlay'; overlay.setAttribute('aria-hidden','true');
      const paper = document.createElement('img'); paper.src = image.currentSrc || image.src; paper.alt = '';
      overlay.append(paper); map.append(overlay);
      animate(paper, [
        {transform:'perspective(1400px) rotateY(-12deg) scale(.26,.52)',clipPath:'inset(0 0 0 0)',opacity:1},
        {transform:'perspective(1400px) rotateY(-4deg) scale(.52,1)',offset:.48,opacity:1},
        {transform:'perspective(1400px) rotateY(0deg) scale(1)',opacity:1}
      ], 560, () => overlay.remove());
    };
    if (image.complete) reveal();
    else { image.addEventListener('load', reveal, {once:true}); image.loading = 'eager'; }
  }
  function emphasize(target) {
    clearTimeout(emphasisTimer);
    document.querySelectorAll('.destination').forEach(el => el.classList.remove('destination'));
    target.classList.add('destination');
    emphasisTimer = setTimeout(() => target.classList.remove('destination'), 1800);
  }
  function markPage(number) {
    selectedPage = number;
    document.querySelectorAll('.page-jumps a,.sheet-links a,.page-tile').forEach(a => {
      if (a.hash.match(/(?:(?:text-)?page|flip)-(\d+)$/)?.[1] === String(number)) a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-reading-mode]').forEach(a => {
      a.href = '#' + (a.dataset.readingMode === 'flip' ? 'flip-' : 'page-') + number;
      if (a.dataset.readingMode === readingLayout) a.setAttribute('aria-current','true');
      else a.removeAttribute('aria-current');
    });
    document.querySelector('[data-reader-text]').href = '#text-page-' + number;
    document.querySelector('#reader-position').textContent = number + ' / 8';
    const notes = photoPages[number - 1].querySelector('.page-notes');
    notesControl.setAttribute('aria-controls', notes.id);
    notesControl.setAttribute('aria-expanded', String(notes.open));
    document.querySelector('#reader-review').hidden = !notes.querySelector('.review-note');
    document.querySelector('#flip-position').textContent = 'Page ' + number + ' of 8';
    document.querySelector('#flip-page-select').value = String(number);
    document.querySelector('[data-turn="-1"]').disabled = number === 1;
    document.querySelector('[data-turn="1"]').disabled = number === 8;
    document.querySelectorAll('[data-side]').forEach(b => {
      b.disabled = Number(b.dataset.side) < 0 ? number === 1 : number === 8;
    });
  }
  function setReadingLayout(layout, number) {
    readingLayout = layout;
    root.dataset.reading = layout;
    photoPages.forEach(p => {
      p.hidden = layout === 'flip' && p.id !== 'page-' + number;
      // A closed-away page must not keep alignment disabled at a new destination.
      if (p.id !== 'page-' + number) p.querySelector('.page-notes').open = false;
      // The flip surface has real side buttons; enlargement stays in Text & notes.
      p.querySelector('.image-link').tabIndex = layout === 'flip' ? -1 : 0;
    });
    if (layout === 'flip') photoPages.slice(Math.max(0,number-2),number+1).forEach(p => { p.querySelector('img').loading = 'eager'; });
    document.querySelectorAll('[data-view="read"] .page-jumps a').forEach((a,i) => {
      a.href = '#' + (layout === 'flip' ? 'flip-' : 'page-') + (i+1);
    });
    markPage(number);
  }
  function turnPage(source, target, direction) {
    if (!source?.naturalWidth || !target.querySelector('img').naturalWidth || reduced()) return;
    // Only the outgoing photograph moves. The destination is already usable.
    const overlay = document.createElement('div');
    overlay.className = 'turn-overlay'; overlay.setAttribute('aria-hidden','true');
    const paper = document.createElement('div'); paper.className = 'turn-leaf';
    const photograph = document.createElement('img');
    photograph.src = source.currentSrc || source.src; photograph.alt = '';
    const shade = document.createElement('span'); shade.className = 'turn-shade';
    const shadow = document.createElement('span'); shadow.className = 'turn-shadow';
    paper.append(photograph, shade); overlay.append(shadow, paper);
    overlay.dataset.direction = direction > 0 ? 'next' : 'previous';
    target.querySelector('.page-figure').append(overlay);
    paper.style.transformOrigin = direction > 0 ? 'left center' : 'right center';
    const sign = direction > 0 ? -1 : 1;
    animateTogether([
      {element:paper, frames:[
        {transform:'rotateY(0deg)',opacity:1},
        {transform:`rotateY(${sign*52}deg)`,opacity:1,offset:.55},
        {transform:`rotateY(${sign*98}deg)`,opacity:0}
      ]},
      {element:shade, frames:[{opacity:0},{opacity:.25,offset:.6},{opacity:.08}]},
      {element:shadow, frames:[
        {transform:`translateX(${-sign*85}%) scaleX(.3)`,opacity:0},
        {transform:`translateX(${-sign*30}%) scaleX(.8)`,opacity:.18,offset:.45},
        {transform:`translateX(${sign*40}%) scaleX(.15)`,opacity:0}
      ]}
    ], 520, () => overlay.remove());
  }
  function route({ focus = false, scroll = true, deliberate = false } = {}) {
    settle(); cancelAnimationFrame(frame);
    stopAlignment();
    scrollSelectionEnabled = false;
    document.querySelectorAll('dialog[open]').forEach(d => { d.dataset.routeClosing = 'true'; d.close(); });
    const requested = targetForHash();
    const flipNumber = requested.id.match(/^flip-([1-8])$/);
    const oldPage = selectedPage, oldLayout = readingLayout;
    const outgoing = photoPages[oldPage - 1]?.querySelector('img');
    const target = flipNumber ? document.getElementById('page-' + flipNumber[1]) : requested;
    if (target.id !== 'home') releaseCover();
    const entering = deliberate && root.dataset.home === 'true' && target === coverPage;
    const coverBefore = entering ? coverPage.querySelector('img').getBoundingClientRect() : null;
    if (target.id === 'home') coverHome.prepend(coverPage);
    else readerList.prepend(coverPage);
    coverPage.querySelector('.image-link').setAttribute('aria-label', target.id === 'home' ? 'Start reading the zine' : 'Enlarge photograph of page 1');
    const section = target.closest('[data-view]') || sections.find(s => s.dataset.view === activeView) || sections[0];
    const previous = activeView;
    activeView = section.dataset.view;
    if (readingFocus && (activeView !== 'read' || target.id === 'home')) setReadingFocus(false, false);
    root.dataset.section = activeView;
    root.dataset.home = target.id === 'home' ? 'true' : 'false';
    if (activeView === 'read' && target.id !== 'main') {
      setReadingLayout(flipNumber ? 'flip' : 'scroll', flipNumber ? Number(flipNumber[1]) : Number(target.id.match(/^page-(\d+)$/)?.[1] || selectedPage));
    }
    sections.forEach(el => { el.hidden = el !== section; });
    document.querySelectorAll('[data-nav]').forEach(a => {
      if (a.dataset.nav === activeView) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const titles = {read:'',unfold:'Unfold the zine',text:'Text version',essay:'Full essay',about:'About this edition'};
    document.title = (titles[activeView] ? titles[activeView] + ' | ' : '') + window.ZINE_CONFIG.siteName;
    const pageNumber = target.id.match(/^(?:text-)?page-(\d+)$/);
    if (pageNumber) markPage(Number(pageNumber[1]));
    if (target.id === 'downloads') markPage(8);
    const back = document.querySelector('#context-return');
    const origin = history.state?.zineOrigin;
    back.hidden = !/^#(?:(?:text-)?page|flip)-[1-8]$/.test(origin || '');
    if (!back.hidden) { back.href = origin; back.textContent = `← Back to the zine · ${origin.startsWith('#text') ? 'text ' : ''}page ${origin.slice(-1)}`; }
    if (focus) { target.setAttribute('tabindex','-1'); target.focus({preventScroll:true}); }
    if (scroll) frame = requestAnimationFrame(() => {
      if (target.id === 'home') window.scrollTo({top:0, behavior:'instant'});
      else {
        const sticky = document.querySelector('.site-header').offsetHeight;
        const toolbar = activeView === 'read' ? readerToolbar.offsetHeight : 0;
        window.scrollTo({top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - sticky - toolbar - 24), behavior:'instant'});
      }
      if (coverBefore) {
        const img = coverPage.querySelector('img'), after = img.getBoundingClientRect();
        img.style.transformOrigin = 'top left';
        animate(img, [{transform:`translate(${coverBefore.x-after.x}px,${coverBefore.y-after.y}px) scale(${coverBefore.width/after.width})`},{transform:'none'}],360,()=>img.style.removeProperty('transform-origin'));
      }
    });
    if (target.id.startsWith('essay-') || (pageNumber && !flipNumber)) emphasize(target);
    if (deliberate && flipNumber && oldLayout === 'flip' && oldPage !== selectedPage) turnPage(outgoing, target, selectedPage - oldPage);
    else if (deliberate && activeView === 'unfold') unfold();
    else if (deliberate && previous !== activeView && ['read','text'].includes(activeView)) {
      // Fade only the navigation furniture; prose and photographs stay fully readable.
      animate(section.querySelector('.page-jumps'), [{opacity:.55},{opacity:1}], 180);
    }
  }
  // Keep hash navigation and browser Back/Forward useful. Nothing auto-advances.
  window.addEventListener('hashchange', () => route({focus:true}));
  window.addEventListener('popstate', () => route({focus:true}));
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href') === '#' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    let hash = a.getAttribute('href');
    if (a.dataset.nav === 'text' && activeView === 'read') hash = '#text-page-' + selectedPage;
    if (a.dataset.nav === 'read' && activeView === 'text') hash = '#page-' + selectedPage;
    let origin = history.state?.zineOrigin;
    const page = a.closest('.zine-page,.text-page');
    if (hash.startsWith('#essay') && page) origin = '#' + (readingLayout === 'flip' && page.classList.contains('zine-page') ? 'flip-' + selectedPage : page.id);
    e.preventDefault();
    if (hash !== location.hash) history.pushState({zineOrigin:origin}, '', hash);
    route({focus:true, deliberate:true});
  });
  function goToTurn(direction) {
    const next = selectedPage + direction;
    if (next < 1 || next > 8) return;
    history.pushState({zineOrigin:history.state?.zineOrigin}, '', '#flip-' + next);
    route({focus:true, deliberate:true});
  }
  document.querySelectorAll('[data-turn]').forEach(button => button.addEventListener('click', () => goToTurn(Number(button.dataset.turn))));
  document.querySelectorAll('[data-side]').forEach(button => button.addEventListener('click', () => goToTurn(Number(button.dataset.side))));
  focusControl.addEventListener('click', () => setReadingFocus(!readingFocus));
  function closeNotes(notes) {
    settle(); stopAlignment(); scrollSelectionEnabled = false;
    notes.open = false;
    const page = notes.closest('.zine-page');
    markPage(Number(page.id.slice(5)));
    // Collapsing tall mobile text must not let scroll anchoring pick a prior page.
    const top = page.getBoundingClientRect().top + scrollY - document.querySelector('.site-header').offsetHeight - readerToolbar.offsetHeight - 16;
    window.scrollTo({top:Math.max(0,top),behavior:'instant'});
    notesControl.focus({preventScroll:true});
  }
  notesControl.addEventListener('click', () => {
    settle(); stopAlignment(); scrollSelectionEnabled = false;
    const notes = photoPages[selectedPage - 1].querySelector('.page-notes');
    if (notes.open) { closeNotes(notes); return; }
    notes.open = !notes.open; markPage(selectedPage);
    if (notes.open) {
      notes.querySelector('.transcript-toggle').open = true;
      notes.querySelector('summary').focus({preventScroll:true});
      notes.scrollIntoView({block:'nearest',behavior:'instant'});
      animate(notes.querySelector(':scope > summary'), [{backgroundColor:'#f5d9c7'},{backgroundColor:'#fffef9'}], 180);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && readingFocus && !e.target.closest('dialog') && !e.defaultPrevented) setReadingFocus(false);
  });
  document.querySelectorAll('.page-notes').forEach(notes => {
    notes.querySelector('summary').addEventListener('click', e => {
      settle();
      if (notes.open) { e.preventDefault(); closeNotes(notes); }
    });
    notes.addEventListener('toggle', () => { markPage(selectedPage); });
    notes.addEventListener('keydown', e => {
      if (e.key === 'Escape' && notes.open) {
        e.preventDefault(); e.stopPropagation();
        closeNotes(notes);
      }
    });
  });
  document.querySelector('#flip-page-select').addEventListener('change', e => goToTurn(Number(e.target.value) - selectedPage));
  document.addEventListener('keydown', e => {
    if (activeView !== 'read' || readingLayout !== 'flip' || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('dialog,input,select,textarea,summary')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); goToTurn(e.key === 'ArrowRight' ? 1 : -1); }
  });
  document.querySelector('.reader-settings').addEventListener('toggle', e => {
    if (e.target.open) settle();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.reader-settings')) document.querySelector('.reader-settings').open = false;
  });
  document.addEventListener('keydown', e => {
    const settings = document.querySelector('.reader-settings');
    if (e.key === 'Escape' && settings.open) { settings.open = false; settings.querySelector('summary').focus(); }
  });
  let scrollFrame, scrollIdle;
  let alignmentIdle;
  let alignmentDirection = 0, touchY = 0;
  function stopAlignment() {
    clearTimeout(alignmentIdle); root.dataset.scrolling = 'false';
    photoPages.forEach(p => p.removeAttribute('data-snap-candidate'));
  }
  function scrollingInput(delta) {
    if (activeView !== 'read' || readingLayout !== 'scroll' || reduced() || document.querySelector('dialog[open]')) return;
    const direction = Math.sign(delta);
    if (!direction) return;
    if (root.dataset.scrolling !== 'true' || direction !== alignmentDirection) {
      const edge = document.querySelector('.site-header').offsetHeight + readerToolbar.offsetHeight + 16;
      photoPages.forEach(p => p.removeAttribute('data-snap-candidate'));
      const ahead = photoPages.filter(p => direction > 0 ? p.getBoundingClientRect().top > edge + 24 : p.getBoundingClientRect().top < edge - 24);
      const candidate = direction > 0 ? ahead[0] : ahead[ahead.length - 1];
      candidate?.setAttribute('data-snap-candidate','');
      alignmentDirection = direction;
    }
    root.dataset.scrolling = 'true';
    clearTimeout(alignmentIdle); alignmentIdle = setTimeout(stopAlignment, 350);
  }
  // Only reader-driven scrolling changes orientation. Browser focus/anchor
  // adjustments (including sticky-header focus) must not choose another page.
  window.addEventListener('wheel', e => { scrollSelectionEnabled = true; scrollingInput(e.deltaY); }, {passive:true});
  window.addEventListener('touchstart', e => { touchY = e.touches[0]?.clientY || 0; }, {passive:true});
  window.addEventListener('touchmove', e => { const y=e.touches[0]?.clientY || touchY; scrollSelectionEnabled = true; scrollingInput(touchY-y); touchY=y; }, {passive:true});
  document.addEventListener('pointerdown', e => {
    stopAlignment();
    scrollSelectionEnabled = !e.target.closest('.site-header');
  });
  document.addEventListener('keydown', e => {
    if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key) && !e.target.closest('button,select,input,dialog,summary')) { scrollSelectionEnabled = true; scrollingInput(['ArrowUp','PageUp','Home'].includes(e.key) || (e.key === ' ' && e.shiftKey) ? -1 : 1); }
  });
  document.addEventListener('focusin', e => {
    if (e.target.closest('.site-header')) { scrollSelectionEnabled = false; stopAlignment(); }
    const page = e.target.closest('.zine-page,.text-page');
    if (page) markPage(Number(page.id.match(/\d+$/)[0]));
  });
  window.addEventListener('scroll', () => {
    if (root.dataset.scrolling === 'true') { clearTimeout(alignmentIdle); alignmentIdle = setTimeout(stopAlignment, 350); }
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (!['read','text'].includes(activeView)) return;
      if (activeView === 'read' && readingLayout === 'flip') return;
      if (!scrollSelectionEnabled) return;
      clearTimeout(scrollIdle);
      scrollIdle = setTimeout(() => { scrollSelectionEnabled = false; }, 120);
      const pages = [...document.querySelectorAll(activeView === 'read' ? '.zine-page' : '.text-page')];
      const top = document.querySelector('.site-header').getBoundingClientRect().bottom + (activeView === 'read' ? readerToolbar.offsetHeight : 0) + 30;
      const page = pages.find(p => p.getBoundingClientRect().bottom > top);
      if (page) markPage(Number(page.id.match(/\d+$/)[0]));
    });
  }, {passive:true});
  window.addEventListener('resize', settle);
  document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
  // Native proximity alignment keeps ordinary wheel/touch/keyboard scrolling.
  // It is optional, disabled for open notes and reduced motion in CSS.
  const alignmentControl = document.querySelector('#scroll-alignment');
  let alignment = 'assist';
  try { alignment = localStorage.getItem('zine-alignment') || 'assist'; } catch (_) {}
  if (!['assist','free'].includes(alignment)) alignment = 'assist';
  root.dataset.alignment = alignment;
  alignmentControl.value = alignment;
  alignmentControl.addEventListener('change', () => {
    root.dataset.alignment = alignmentControl.value;
    try { localStorage.setItem('zine-alignment', alignmentControl.value); } catch (_) {}
  });
  // Image links still open the full JPEG when JavaScript or native dialogs are absent.
  const dialog = document.querySelector('#image-dialog');
  const zoomSupported = dialog && typeof dialog.showModal === 'function';
  // Keep Tab within the modal even when an engine would next focus browser chrome.
  document.querySelectorAll('dialog').forEach(modal => modal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const stops = [...modal.querySelectorAll('button:not(:disabled),a[href],input,select,[tabindex="0"]')]
      .filter(el => el.getClientRects().length);
    const first = stops[0], last = stops[stops.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }));
  const largeImage = document.querySelector('#viewer-image');
  const stage = document.querySelector('#viewer-stage');
  const imageTitle = document.querySelector('#viewer-title');
  const readout = document.querySelector('#zoom-level');
  const viewerReading = document.querySelector('#viewer-reading');
  const viewerContent = document.querySelector('#viewer-content');
  const viewerModes = [...document.querySelectorAll('[data-viewer-mode]')];
  const zoomControls = document.querySelector('.viewer-zoom');
  let viewerPage = null;
  let viewerFormat = 'photo';
  function viewerMode(mode) {
    settle();
    viewerFormat = mode;
    const photograph = mode === 'photo';
    stage.hidden = !photograph; viewerReading.hidden = photograph;
    zoomControls.hidden = !photograph;
    viewerModes.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.viewerMode === mode)));
    viewerContent.replaceChildren();
    if (!photograph) {
      document.querySelector('#viewer-content-title').textContent = mode === 'text' ? 'Text' : 'Visual description';
      const source = viewerPage || document.querySelector('.sheet-description');
      const selector = mode === 'text' ? '.transcript > p, .review-note' : '.visual-description';
      source.querySelectorAll(selector).forEach(p => viewerContent.append(p.cloneNode(true)));
      viewerReading.scrollTop = 0;
    } else requestAnimationFrame(fit);
    document.querySelector('.viewer-help').textContent = photograph ? 'Use + and − to zoom. Scroll to move the image. Escape closes the viewer.' : 'Escape closes the viewer.';
    if (dialog.open) animate(document.querySelector('.viewer-controls'), [{opacity:.6},{opacity:1}], 160);
  }
  viewerModes.forEach(b => b.addEventListener('click', () => viewerMode(b.dataset.viewerMode)));
  let opener = null, scale = 1, fitWidth = 0;
  function viewerPosition() {
    document.querySelector('.viewer-pages').hidden = !viewerPage;
    if (!viewerPage) return;
    const n = photoPages.indexOf(viewerPage) + 1;
    document.querySelector('#viewer-position').textContent = n + ' of 8';
    document.querySelector('[data-viewer-turn="-1"]').disabled = n === 1;
    document.querySelector('[data-viewer-turn="1"]').disabled = n === 8;
  }
  function turnViewer(direction) {
    if (!viewerPage) return;
    const next = photoPages.indexOf(viewerPage) + direction;
    if (next < 0 || next > 7) return;
    viewerPage = photoPages[next]; scale = 1;
    const link = viewerPage.querySelector('.image-link');
    imageTitle.textContent = link.dataset.title;
    largeImage.alt = link.querySelector('img').alt;
    largeImage.src = link.href;
    viewerMode(viewerFormat); viewerPosition(); stage.scrollTo(0,0);
    renderScale();
  }
  document.querySelectorAll('[data-viewer-turn]').forEach(b => b.addEventListener('click', () => turnViewer(Number(b.dataset.viewerTurn))));
  dialog.addEventListener('keydown', e => {
    if (!['ArrowLeft','ArrowRight'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input,select,textarea')) return;
    if (e.target.closest('#viewer-stage') && scale > 1) return;
    e.preventDefault(); turnViewer(e.key === 'ArrowRight' ? 1 : -1);
  });
  function fit() {
    if (!largeImage.naturalWidth || stage.hidden || !dialog.open) return;
    const padding = window.innerWidth < 650 ? 16 : 32;
    const availableWidth = stage.clientWidth - padding;
    const availableHeight = stage.clientHeight - padding;
    fitWidth = Math.max(100, Math.min(availableWidth, availableHeight * largeImage.naturalWidth / largeImage.naturalHeight));
    renderScale();
  }
  function renderScale() {
    largeImage.style.width = Math.round(fitWidth * scale) + 'px';
    readout.textContent = Math.round(scale * 100) + '%';
    document.querySelector('[data-zoom-action="out"]').disabled = scale <= 1;
    document.querySelector('[data-zoom-action="in"]').disabled = scale >= 4;
  }
  if (zoomSupported) {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[data-zoom]');
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (a.closest('.hero-art')) {
        e.preventDefault(); history.pushState({},'', '#page-1'); route({focus:true,deliberate:true}); return;
      }
      e.preventDefault(); settle(); opener = a; scale = 1;
      viewerPage = a.closest('.zine-page');
      viewerPosition();
      document.querySelector('[data-viewer-mode="text"]').hidden = !viewerPage;
      viewerMode('photo');
      const image = a.querySelector('img');
      imageTitle.textContent = a.dataset.title || 'Original photograph';
      largeImage.alt = image ? image.alt : (a.dataset.alt || imageTitle.textContent);
      largeImage.removeAttribute('style');
      largeImage.onload = fit;
      largeImage.onerror = () => { dialog.close(); announce('The enlarged photograph could not load. Try opening the image link again.'); };
      largeImage.src = a.href;
      dialog.showModal();
      animate(document.querySelector('.viewer-head'), [{opacity:.5},{opacity:1}], 180);
      document.body.style.overflow = 'hidden';
      stage.scrollTo(0,0);
      document.querySelector('#close-image').focus();
      requestAnimationFrame(fit);
    });
    document.querySelector('#close-image').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dialog.close(); } });
    dialog.addEventListener('close', () => {
      settle();
      document.body.style.overflow='';
      if (dialog.dataset.routeClosing === 'true') { delete dialog.dataset.routeClosing; return; }
      if (viewerPage && viewerPage !== opener?.closest('.zine-page')) {
        const n = photoPages.indexOf(viewerPage) + 1;
        history.pushState({},'', '#' + (readingLayout === 'flip' ? 'flip-' : 'page-') + n);
        route({focus:true});
        viewerPage.querySelector('.image-link').focus({preventScroll:true});
      } else if(opener?.getClientRects().length) opener.focus({preventScroll:true});
    });
    document.querySelectorAll('[data-zoom-action]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.zoomAction === 'in') scale = Math.min(4,scale+.5);
      if (b.dataset.zoomAction === 'out') scale = Math.max(1,scale-.5);
      if (b.dataset.zoomAction === 'reset') { scale=1; stage.scrollTo(0,0); }
      renderScale();
    }));
    window.addEventListener('resize', () => { if(dialog.open) fit(); });
  }
  const copyDialog = document.querySelector('#copy-dialog');
  function manualCopy(value, title = 'Copy this link') {
    if (!copyDialog || typeof copyDialog.showModal !== 'function') {
      window.prompt(title, value); return;
    }
    document.querySelector('#copy-title').textContent=title;
    const input=document.querySelector('#copy-value');input.value=value;
    copyDialog.showModal(); input.focus(); input.select();
  }
  document.querySelector('#close-copy').addEventListener('click', () => copyDialog.close());
  async function copy(value, message, title) {
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value); announce(message);
    } catch (_) { manualCopy(value,title); }
  }
  function publicUrl(hash) {
    const configured = window.ZINE_CONFIG.siteUrl;
    if (configured) { try { const u=new URL(configured);u.hash=hash;return u.href; } catch (_) {} }
    return null;
  }
  document.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', async () => {
    const hash=readingLayout === 'flip' && activeView === 'read' && button.closest('.zine-page') ? '#flip-' + selectedPage : button.dataset.share || (location.hash && location.hash !== '#main' ? location.hash : '#' + (activeView === 'read' ? 'home' : activeView));
    const url=publicUrl(hash);
    if (!url) { announce('This is a local review file, not a public link. Send the HTML file or PDF itself. Page links will work after publishing.'); return; }
    const data={title:window.ZINE_CONFIG.title, text:'A handmade zine by Timothi Lim about coffee, play and living with GenAI.',url};
    try {
      if (navigator.share && window.isSecureContext) { await navigator.share(data); return; }
    } catch (error) { if (error.name === 'AbortError') return; }
    await copy(url,'Link copied.','Copy this link');
  }));
  document.querySelectorAll('[data-copy-prompt]').forEach(button => button.addEventListener('click', () => copy(
    'What has AI made room for in your life, and what has it crowded out?',
    'Question copied. Nothing has been submitted or saved.', 'Copy the reflection question'
  )));
  // For printing, print the current reading mode and temporarily open its transcripts.
  let openedForPrint=[];
  window.addEventListener('beforeprint',()=>{
    openedForPrint=[...document.querySelectorAll('[data-view]:not([hidden]) details:not([open])')];
    openedForPrint.forEach(d=>d.open=true);
  });
  window.addEventListener('afterprint',()=>{openedForPrint.forEach(d=>d.open=false);openedForPrint=[];});
  // Sticky-header offset follows actual height, including enlarged or wrapped text.
  const header=document.querySelector('.site-header');
  if (header && 'ResizeObserver' in window) {
    new ResizeObserver(() => root.style.setProperty('--header', header.offsetHeight + 'px')).observe(header);
    new ResizeObserver(() => { if (readerToolbar.offsetHeight) root.style.setProperty('--readerbar', readerToolbar.offsetHeight + 'px'); }).observe(readerToolbar);
  }
  route({scroll:false});
  root.classList.add('enhanced');
  // On a deep-link load, wait until layout exists before locating the target.
  if (location.hash) route({scroll:true,focus:true});
  // Native fragment focus can occur after initial script execution. Alias
  // fragments such as #flip-6 must finish on their visible page, not the marker.
  const entryHash = location.hash, entryRevision = revision;
  window.addEventListener('load', () => {
    if (entryHash && location.hash === entryHash && revision === entryRevision) route({scroll:true,focus:true});
  }, {once:true});
})();
