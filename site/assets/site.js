(function () {
  const $ = (id) => document.getElementById(id);

  /* ---------------- Phone menu ---------------- */
  const menuBtn = $('menu-btn'), menu = $('mobile-menu');
  function setMenu(open) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

  /* ---------------- Scroll reveals ---------------- */
  // Only sections below the first screen are prepared, and they start faint
  // rather than invisible, so nothing is ever hidden if this script stops.
  function setupReveals() {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const groups = [
      ['.band-head'], ['.price-figure'], ['.price-sub'], ['.price-list li', 0.06], ['.price-why'],
      ['.spec tr', 0.04], ['.step', 0.1], ['.faq details', 0.05], ['.type-card', 0.05], ['.guide-card', 0.06],
    ];
    const targets = [];
    const fold = window.innerHeight;
    for (const [sel, stagger] of groups) {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (el.getBoundingClientRect().top < fold) return; // already on screen
        el.classList.add('reveal');
        if (stagger) el.style.setProperty('--rd', Math.min(i * stagger, 0.4) + 's');
        targets.push(el);
      });
    }
    if (!targets.length) return;
    document.documentElement.classList.add('reveal-on');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    targets.forEach((el) => io.observe(el));
  }

  setupReveals();
})();
