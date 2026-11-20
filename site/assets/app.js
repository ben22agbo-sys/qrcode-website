(function () {
  const $ = (id) => document.getElementById(id);
  let code = null;
  let payload = '';

  /* ---------------- Content types ---------------- */
  const TABS = ['link', 'text', 'wifi', 'email'];
  let activeTab = 'link';

  function selectTab(name, focus) {
    activeTab = name;
    for (const t of TABS) {
      const on = t === name;
      $('tab-' + t).setAttribute('aria-selected', String(on));
      $('tab-' + t).tabIndex = on ? 0 : -1;
      $('panel-' + t).hidden = !on;
    }
    if (focus) $('tab-' + name).focus();
    render();
  }
  TABS.forEach((t, i) => {
    $('tab-' + t).addEventListener('click', () => selectTab(t));
    $('tab-' + t).addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
        selectTab(next, true);
      }
    });
  });

  // Wi-Fi fields escape \ ; , : and " with a backslash.
  const wifiEscape = (s) => s.replace(/([\\;,:"])/g, '\\$1');

  function buildPayload() {
    if (activeTab === 'link') {
      let v = $('in-link').value.trim();
      // Add https:// when someone types a bare domain like example.com/menu
      if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) && /^[\w-]+(\.[\w-]+)+/.test(v)) v = 'https://' + v;
      return v;
    }
    if (activeTab === 'text') return $('in-text').value;
    if (activeTab === 'wifi') {
      const ssid = $('in-ssid').value;
      if (!ssid) return '';
      const sec = $('in-wifi-sec').value;
      const pass = $('in-wifi-pass').value;
      let s = 'WIFI:T:' + sec + ';S:' + wifiEscape(ssid) + ';';
      if (sec !== 'nopass') s += 'P:' + wifiEscape(pass) + ';';
      if ($('in-wifi-hidden').checked) s += 'H:true;';
      return s + ';';
    }
    const to = $('in-email-to').value.trim();
    if (!to) return '';
    const params = [];
    const subject = $('in-email-subject').value, body = $('in-email-body').value;
    if (subject) params.push('subject=' + encodeURIComponent(subject));
    if (body) params.push('body=' + encodeURIComponent(body));
    return 'mailto:' + to + (params.length ? '?' + params.join('&') : '');
  }

  function emptyMessage() {
    return {
      link: 'Type a website address to make your code.',
      text: 'Type some text to make your code.',
      wifi: 'Add your network name to make your code.',
      email: 'Add an email address to make your code.',
    }[activeTab];
  }

  /* ---------------- Pattern ---------------- */
  const STYLES = [['square', 'Square'], ['rounded', 'Rounded'], ['dots', 'Dots']];
  const SAMPLE = ['1101', '0110', '1011', '1110'];
  let moduleStyle = 'square';

  function styleIcon(style) {
    let shapes = '';
    SAMPLE.forEach((row, y) => [...row].forEach((c, x) => {
      if (c !== '1') return;
      if (style === 'dots') shapes += '<circle cx="' + (x + 0.5) + '" cy="' + (y + 0.5) + '" r="0.42"/>';
      else if (style === 'rounded') shapes += '<rect x="' + (x + 0.04) + '" y="' + (y + 0.04) + '" width="0.92" height="0.92" rx="0.2"/>';
      else shapes += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
    }));
    return '<svg viewBox="0 0 4 4" aria-hidden="true">' + shapes + '</svg>';
  }

  function radioGroup(container, items, current, iconFor, onPick) {
    container.innerHTML = '';
    for (const [value, label] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(value === current));
      b.innerHTML = iconFor(value) + '<span>' + label + '</span>';
      b.addEventListener('click', () => onPick(value));
      container.appendChild(b);
    }
  }
  function buildStyles() {
    radioGroup($('style'), STYLES, moduleStyle, styleIcon, (v) => { moduleStyle = v; buildStyles(); render(); });
  }

  /* ---------------- Colours ---------------- */
  const PALETTE = [
    ['Black', '#000000'], ['Charcoal', '#2b2b2b'], ['Navy', '#1e3a8a'], ['Blue', '#2563eb'],
    ['Forest', '#166534'], ['Purple', '#6b21a8'], ['Red', '#b91c1c'], ['Orange', '#ea580c'],
    ['Yellow', '#facc15'], ['Light grey', '#e5e7eb'], ['Cream', '#fdf6e3'], ['White', '#ffffff'],
  ];
  const MIN_CONTRAST = 3;
  const colours = { fg: '#000000', bg: '#ffffff' };

  function luminance(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    const l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function buildSwatches(which) {
    const other = which === 'fg' ? 'bg' : 'fg';
    const el = $(which);
    el.innerHTML = '';
    for (const [name, hex] of PALETTE) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = hex;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(colours[which] === hex));
      const blocked = contrast(hex, colours[other]) < MIN_CONTRAST;
      b.disabled = blocked;
      b.title = blocked ? name + ' (too close to the ' + (other === 'bg' ? 'background' : 'code colour') + ')' : name;
      b.setAttribute('aria-label', b.title);
      b.addEventListener('click', () => {
        colours[which] = hex;
        buildSwatches('fg');
        buildSwatches('bg');
        render();
      });
      el.appendChild(b);
    }
  }

  /* ---------------- Logo ---------------- */
  let logo = null;
  let logoShape = 'square';
  let eclBeforeLogo = 'M';
  const MAX_FILE = 2 * 1024 * 1024;
  const MAX_RASTER = 512;
  const SHAPE_ICONS = {
    square: '<svg viewBox="0 0 4 4" aria-hidden="true"><path fill-rule="evenodd" d="M0 0h4v4H0zM.8.8v2.4h2.4V.8z"/></svg>',
    circle: '<svg viewBox="0 0 4 4" aria-hidden="true"><path fill-rule="evenodd" d="M0 0h4v4H0zM2 .7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/></svg>',
  };
  function buildShapes() {
    radioGroup($('logo-shape'), [['square', 'Square'], ['circle', 'Circle']], logoShape,
      (v) => SHAPE_ICONS[v], (v) => { logoShape = v; buildShapes(); render(); });
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  async function setLogo(file) {
    const err = $('logo-error');
    err.hidden = true;
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) return fail('Please use a PNG, JPG, SVG or WebP image.');
    if (file.size > MAX_FILE) return fail('That image is over 2 MB. Please use a smaller file.');
    try {
      let src = await readAsDataURL(file);
      let image = await QR.loadImage(src);
      const w = image.naturalWidth, h = image.naturalHeight;
      if (file.type !== 'image/svg+xml' && Math.max(w, h) > MAX_RASTER) {
        const k = MAX_RASTER / Math.max(w, h);
        const c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, c.width, c.height);
        src = c.toDataURL('image/png');
        image = await QR.loadImage(src);
      }
      if (!logo) eclBeforeLogo = $('ecl').value;
      logo = { src, image, name: file.name };
      updateLogoUI();
      render();
    } catch (e) {
      fail('That image could not be opened. Try another file.');
    }
  }

  function removeLogo() {
    logo = null;
    $('logo-file').value = '';
    $('ecl').value = eclBeforeLogo;
    updateLogoUI();
    render();
  }

  function updateLogoUI() {
    const on = !!logo;
    $('logo-empty').hidden = on;
    $('logo-filled').hidden = !on;
    $('logo-controls').hidden = !on;
    $('ecl').disabled = on;
    $('ecl-note').textContent = on
      ? 'Locked to High while a logo is added, so the code still scans.'
      : 'Higher levels survive scuffs and dirt but make a denser code.';
    if (on) {
      $('ecl').value = 'H';
      $('logo-thumb').src = logo.src;
      $('logo-name').textContent = logo.name;
    }
  }

  $('logo-add').addEventListener('click', () => $('logo-file').click());
  $('logo-replace').addEventListener('click', () => $('logo-file').click());
  $('logo-remove').addEventListener('click', removeLogo);
  $('logo-file').addEventListener('change', (e) => setLogo(e.target.files[0]));
  const drop = $('logo-drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
    setLogo(e.dataTransfer.files[0]);
  });

  /* ---------------- Render ---------------- */
  const ECL_NAMES = { L: 'Low 7%', M: 'Med 15%', Q: 'Quart 25%', H: 'High 30%' };

  function renderOptions() {
    return {
      style: moduleStyle,
      foreground: colours.fg,
      background: colours.bg,
      logo: logo && { src: logo.src, image: logo.image, size: $('logo-size').value / 100, shape: logoShape },
    };
  }

  function setReadout(c) {
    $('r-version').textContent = c ? c.version : '-';
    $('r-grid').textContent = c ? c.size + '×' + c.size : '-';
    $('r-ecl').textContent = c ? ECL_NAMES[c.ecl] : '-';
    syncDock();
  }

  function showEmpty(msg) {
    code = null;
    $('preview').innerHTML = '';
    $('preview-empty').textContent = msg;
    $('preview-empty').hidden = false;
    $('dl-svg').disabled = $('dl-png').disabled = true;
    setReadout(null);
  }

  let lastPayload = null;
  function render() {
    const slider = $('logo-size');
    $('logo-size-val').textContent = slider.value + '%';
    slider.style.setProperty('--fill', ((slider.value - slider.min) / (slider.max - slider.min) * 100) + '%');
    payload = buildPayload();
    $('payload').innerHTML = '';
    if (payload) {
      const b = document.createElement('b');
      b.textContent = 'Encodes ';
      $('payload').append(b, document.createTextNode(payload));
    }
    if (!payload) return showEmpty(emptyMessage());
    try {
      code = QR.encode(payload, { ecl: logo ? 'H' : $('ecl').value });
    } catch (e) {
      return showEmpty(e.code === 'DATA_TOO_LONG'
        ? (logo ? 'Too much content to fit with a logo. Shorten it or remove the logo.'
                : 'Too much content for one QR code. Shorten it or lower the error correction.')
        : 'Something went wrong making this code. Try changing the content.');
    }
    $('preview-empty').hidden = true;
    $('preview').innerHTML = QR.toSVG(code, renderOptions());
    $('dl-svg').disabled = $('dl-png').disabled = false;
    setReadout(code);
    // Sweep the scan line when the content itself changes.
    if (payload !== lastPayload) {
      const s = $('scanline');
      s.classList.remove('run');
      void s.offsetWidth;
      s.classList.add('run');
      lastPayload = payload;
    }
  }

  ['in-link', 'in-text', 'in-ssid', 'in-wifi-pass', 'in-wifi-sec', 'in-wifi-hidden',
   'in-email-to', 'in-email-subject', 'in-email-body', 'ecl', 'logo-size']
    .forEach((id) => $(id).addEventListener('input', render));

  /* ---------------- Downloads ---------------- */
  // Inside Claude's preview, page-started downloads are blocked, so use the
  // viewer's save prompt there. On a normal website, use a regular download.
  const framed = !!(window.claude && typeof window.claude.use === 'function');
  const downloadsReady = framed ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);

  function fileBase() {
    const words = {
      link: 'qr-link', text: 'qr-text', wifi: 'qr-wifi', email: 'qr-email',
    };
    return words[activeTab] || 'qr-code';
  }

  function note(msg, isError) {
    $('save-note').textContent = msg;
    $('save-note').classList.toggle('error', !!isError);
  }

  async function saveFile(blob, filename) {
    const dl = await downloadsReady;
    if (dl) {
      try {
        await dl.save({ filename, data: blob });
        note('Saved ' + filename + '.');
      } catch (e) {
        if (e && e.code === 'declined') note('Download cancelled.');
        else if (e && e.code === 'rate_limited') note('A save is already waiting for you. Finish that one first.', true);
        else note('Downloads are not available in this view. Open the page in a browser to save.', true);
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    note('Downloaded ' + filename + '.');
  }

  function downloadSVG() {
    if (!code) return;
    const svg = QR.toSVG(code, renderOptions());
    saveFile(new Blob([svg], { type: 'image/svg+xml' }), fileBase() + '.svg');
  }

  function downloadPNG() {
    if (!code) return;
    const scale = Math.ceil(1200 / (code.size + 8));
    const canvas = QR.toCanvas(code, document.createElement('canvas'), Object.assign(renderOptions(), { scale }));
    canvas.toBlob((blob) => {
      if (blob) saveFile(blob, fileBase() + '.png');
      else note('Could not make the PNG. Try the SVG instead.', true);
    }, 'image/png');
  }
  const DOWNLOADERS = { svg: downloadSVG, png: downloadPNG };

  /* ---------------- Accounts (Supabase) ---------------- */
  // Fill these in from your Supabase project: Project Settings > API.
  // The anon (public) key is designed to be used in web pages, so it is safe here.
  const AUTH_CONFIG = {
    supabaseUrl: 'https://iwgjdeqizohndualsfuc.supabase.co',
    supabaseAnonKey: 'sb_publishable_aJJj3WlwzqYAxIW5F3xFfQ_2KXVSA74', // publishable key, safe in web pages
    // Turn on once the Google provider is enabled in Supabase (Authentication > Sign In / Providers).
    googleEnabled: false,
  };

  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(AUTH_CONFIG.supabaseUrl) &&
    !/^YOUR_/.test(AUTH_CONFIG.supabaseAnonKey);
  let sb = null;
  if (configured && !framed && window.supabase && typeof window.supabase.createClient === 'function') {
    try { sb = window.supabase.createClient(AUTH_CONFIG.supabaseUrl, AUTH_CONFIG.supabaseAnonKey); } catch (e) { sb = null; }
  }
  // Downloads stay open only while sign-in is not set up, or in Claude's preview.
  // Once configured on the live site, an account is required.
  const openMode = framed || !configured;
  let user = null;
  let pending = null;

  const DRAFT_KEY = 'qrorigin-draft';
  const DRAFT_MAX_AGE = 60 * 60 * 1000; // an hour is plenty to finish signing in
  const DRAFT_FIELDS = ['in-link', 'in-text', 'in-ssid', 'in-wifi-pass', 'in-wifi-sec',
    'in-email-to', 'in-email-subject', 'in-email-body', 'logo-size', 'ecl'];

  // Everything about the design except the logo image, which is too big for a link.
  function buildDraft(kind) {
    const state = {
      v: 1, t: Date.now(), kind, tab: activeTab, style: moduleStyle, colours: Object.assign({}, colours),
      shape: logoShape, hidden: $('in-wifi-hidden').checked, ecl: logo ? eclBeforeLogo : $('ecl').value,
      fields: {}, hadLogo: !!logo,
    };
    DRAFT_FIELDS.forEach((id) => { state.fields[id] = $(id).value; });
    return state;
  }

  // Saved in this browser, with the logo, for when the link opens here.
  function saveDraft(kind) {
    const state = buildDraft(kind);
    state.logo = logo ? { src: logo.src, name: logo.name } : null;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage full or blocked: try again without the logo, then give up quietly.
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(Object.assign({}, state, { logo: null }))); } catch (e2) { /* ignore */ }
    }
    return state;
  }

  function readDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d && Date.now() - d.t < DRAFT_MAX_AGE) return d;
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) { /* ignore */ }
    return null;
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } }

  /* The design also travels inside the sign-in link, so it comes back even when
     the email opens in a different browser (mail apps often use their own). */
  const RESUME_PARAM = 'resume';
  const MAX_RESUME_LENGTH = 1800; // keeps the link a safe length for email

  function encodeDraft(state) {
    const bytes = new TextEncoder().encode(JSON.stringify(state));
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeDraft(str) {
    try {
      const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return null; }
  }

  // A link can be made by anyone, so only accept values the page could have produced.
  function cleanDraft(d) {
    if (!d || typeof d !== 'object') return null;
    const hexes = PALETTE.map((c) => c[1]);
    const out = {
      t: Number(d.t) || 0, kind: ['svg', 'png', 'unlock'].includes(d.kind) ? d.kind : null,
      tab: TABS.includes(d.tab) ? d.tab : 'link',
      style: STYLES.some((st) => st[0] === d.style) ? d.style : 'square',
      shape: d.shape === 'circle' ? 'circle' : 'square',
      hidden: d.hidden === true, ecl: ['L', 'M', 'Q', 'H'].includes(d.ecl) ? d.ecl : 'M',
      hadLogo: d.hadLogo === true, fields: {}, logo: null,
    };
    const fg = d.colours && d.colours.fg, bg = d.colours && d.colours.bg;
    out.colours = hexes.includes(fg) && hexes.includes(bg) && contrast(fg, bg) >= MIN_CONTRAST
      ? { fg, bg } : { fg: '#000000', bg: '#ffffff' };
    DRAFT_FIELDS.forEach((id) => {
      const v = d.fields && d.fields[id];
      if (typeof v === 'string' && v.length <= 3000) out.fields[id] = v;
    });
    if (!/^(WPA|WEP|nopass)$/.test(out.fields['in-wifi-sec'] || 'WPA')) delete out.fields['in-wifi-sec'];
    const size = Number(out.fields['logo-size']);
    if (!(size >= 10 && size <= 25)) delete out.fields['logo-size'];
    if (!['L', 'M', 'Q', 'H'].includes(out.fields.ecl)) delete out.fields.ecl;
    if (d.logo && typeof d.logo.src === 'string' && /^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(d.logo.src)) {
      out.logo = { src: d.logo.src, name: String(d.logo.name || 'logo').slice(0, 120) };
    }
    return out;
  }

  // Reads the design from the link and removes it from the address bar.
  // The #... part is left alone, because that is where the sign-in details arrive.
  function takeLinkDraft() {
    let raw = null;
    try {
      const url = new URL(location.href);
      raw = url.searchParams.get(RESUME_PARAM);
      if (raw !== null) {
        url.searchParams.delete(RESUME_PARAM);
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    } catch (e) { /* ignore */ }
    return raw ? cleanDraft(decodeDraft(raw)) : null;
  }

  async function applyDraft(d) {
    DRAFT_FIELDS.forEach((id) => { if (id in d.fields) $(id).value = d.fields[id]; });
    $('in-wifi-hidden').checked = d.hidden;
    moduleStyle = d.style;
    Object.assign(colours, d.colours);
    logoShape = d.shape;
    buildStyles(); buildShapes(); buildSwatches('fg'); buildSwatches('bg');
    if (d.logo) {
      try {
        const image = await QR.loadImage(d.logo.src);
        eclBeforeLogo = d.ecl;
        logo = { src: d.logo.src, image, name: d.logo.name };
        updateLogoUI();
      } catch (e) { /* logo could not be restored, carry on without it */ }
    } else if (!logo) {
      $('ecl').value = d.ecl;
    }
    selectTab(d.tab);
  }

  let resumed = null; // the design brought back after signing in, if any

  function showReady(kind) {
    const r = $('ready');
    const logoLost = resumed && resumed.hadLogo && !resumed.logo;
    r.textContent = logoLost
      ? "You're signed in and your code is back. Your logo couldn't come with you to this browser, so add it again before downloading."
      : "You're signed in. Your code is ready, so download it whenever you like.";
    r.hidden = false;
    pending = null;
    if (kind && $('dl-' + kind)) $('dl-' + kind).focus();
  }

  function updateAccountUI() {
    const signedIn = !!user;
    $('signin-btn').hidden = signedIn;
    $('account-in').hidden = !signedIn;
    $('account-email').textContent = signedIn ? (user.email || 'Signed in') : '';
    $('save-note').textContent = signedIn
      ? 'SVG stays sharp at any print size. PNG is 1200 px wide.'
      : 'Free to download with a free account. SVG stays sharp at any print size.';
    $('save-note').classList.remove('error');
    applyLock();
  }

  /* Blur the code until signed in. Only while sign-in is not set up (or in
     Claude's preview) can someone choose to view it without an account. */
  let bypassLock = false;
  // How much to blur, in modules (the squares a code is made of). In testing,
  // 0.7 still let some sharpened screenshots scan; 0.85 and 1.0 let none through.
  const LOCK_BLUR = 1.0;

  // Blurs only the data dots. The corner squares and logo stay sharp so people can
  // judge their design; they carry no data, so the code still cannot be read.
  function setSvgLock(container, idSuffix, locked) {
    const svg = container.querySelector('svg');
    if (!svg) return;
    const data = svg.querySelector('path'); // first path = data modules, second = corner squares
    if (!data) return;
    const id = 'qr-lock-' + idSuffix;
    if (!locked) { data.removeAttribute('filter'); return; }
    if (!svg.querySelector('#' + id)) {
      const vb = (svg.getAttribute('viewBox') || '0 0 100 100').split(/\s+/).map(Number);
      const ns = 'http://www.w3.org/2000/svg';
      const defs = document.createElementNS(ns, 'defs');
      const f = document.createElementNS(ns, 'filter');
      f.setAttribute('id', id);
      f.setAttribute('filterUnits', 'userSpaceOnUse');
      f.setAttribute('x', vb[0]); f.setAttribute('y', vb[1]);
      f.setAttribute('width', vb[2]); f.setAttribute('height', vb[3]);
      const g = document.createElementNS(ns, 'feGaussianBlur');
      g.setAttribute('stdDeviation', String(LOCK_BLUR));
      f.appendChild(g); defs.appendChild(f); svg.insertBefore(defs, svg.firstChild);
    }
    data.setAttribute('filter', 'url(#' + id + ')');
  }

  function applyLock() {
    const locked = !user && !bypassLock;
    $('stage').classList.toggle('locked', locked && !!code);
    $('unlock').hidden = !(locked && code);
    setSvgLock($('preview'), 'stage', locked);
    setSvgLock($('dock-thumb'), 'dock', locked);
  }
  window.addEventListener('resize', applyLock);
  $('unlock').addEventListener('click', () => openAuth('unlock'));

  /* Dialog */
  function authError(msg) {
    $('auth-error').textContent = msg || '';
    $('auth-error').hidden = !msg;
  }

  const showGoogle = AUTH_CONFIG.googleEnabled || openMode;
  $('google-btn').hidden = !showGoogle;
  document.querySelector('.auth-or').hidden = !showGoogle;

  function openAuth(kind) {
    pending = kind || null;
    authError('');
    $('auth-form-view').hidden = false;
    $('auth-sent-view').hidden = true;
    const n = $('auth-notice');
    n.innerHTML = '';
    if (openMode) {
      n.append(document.createTextNode(framed
        ? 'This is a preview. Sign-in only works on the live site, so downloads are open here.'
        : 'Sign-in is not connected yet, so downloads are open for now.'));
      if (kind) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn small';
        b.style.marginTop = '10px';
        b.style.display = 'block';
        b.textContent = kind === 'unlock' ? 'Show the code without an account' : 'Download without an account';
        b.addEventListener('click', () => {
          $('auth').close();
          if (kind === 'unlock') { bypassLock = true; applyLock(); }
          else DOWNLOADERS[kind]();
        });
        n.appendChild(b);
      }
      n.hidden = false;
    } else {
      n.hidden = true;
    }
    $('auth-title').textContent = kind === 'unlock' ? 'Create your free account to unlock your code'
      : kind ? 'Create your free account to download' : 'Sign in or create your free account';
    if (typeof $('auth').showModal === 'function') $('auth').showModal();
    else $('auth').setAttribute('open', '');
  }

  function requireAccount(kind) {
    if (!code) return;
    if (user) return DOWNLOADERS[kind]();
    if (configured && !framed && !sb) {
      return note('Sign-in could not load. Check your connection and refresh the page.', true);
    }
    openAuth(kind);
  }

  // Where the sign-in link sends people back to, carrying their design with it.
  // Pass the state just saved, so the link and this browser share one timestamp.
  function returnUrl(state) {
    const base = location.origin + location.pathname;
    try {
      const enc = encodeDraft(Object.assign({}, state || buildDraft(pending), { logo: undefined }));
      if (enc.length <= MAX_RESUME_LENGTH) return base + '?' + RESUME_PARAM + '=' + enc;
    } catch (e) { /* fall back to the plain address */ }
    return base;
  }

  $('google-btn').addEventListener('click', async () => {
    authError('');
    if (!sb) return authError(openMode ? 'Sign-in with Google works once the site is live with sign-in connected.' : 'Sign-in could not load. Refresh the page and try again.');
    const saved = saveDraft(pending);
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl(saved) } });
    if (error) authError('Google sign-in did not start. Try again, or use your email instead.');
  });

  let sentTo = '';
  let resendTimer = null;

  async function sendCode(email) {
    const saved = saveDraft(pending);
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: returnUrl(saved), shouldCreateUser: true } });
    return error;
  }

  function startResendCooldown() {
    const b = $('auth-resend');
    let left = 60;
    clearInterval(resendTimer);
    b.disabled = true;
    b.textContent = 'Send a new code (' + left + 's)';
    resendTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) { clearInterval(resendTimer); b.disabled = false; b.textContent = 'Send a new code'; }
      else b.textContent = 'Send a new code (' + left + 's)';
    }, 1000);
  }

  function sendErrorText(error) {
    return /rate|seconds|too many/i.test(error.message || '')
      ? 'Too many codes sent. Wait a minute, then try again.'
      : 'We could not send the code. Check the address and try again.';
  }

  $('email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    authError('');
    const email = $('auth-email-input').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return authError('Enter an email address like name@example.com.');
    if (!sb) return authError(openMode ? 'Email sign-in works once the site is live with sign-in connected.' : 'Sign-in could not load. Refresh the page and try again.');
    const btn = $('email-btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    const error = await sendCode(email);
    btn.disabled = false;
    btn.textContent = 'Email me a sign-in code';
    if (error) return authError(sendErrorText(error));
    sentTo = email;
    $('auth-sent-to').textContent = email;
    $('auth-code-input').value = '';
    $('code-error').hidden = true;
    $('auth-form-view').hidden = true;
    $('auth-sent-view').hidden = false;
    startResendCooldown();
    $('auth-code-input').focus();
  });

  function codeError(msg) {
    $('code-error').textContent = msg || '';
    $('code-error').hidden = !msg;
  }

  // Keep only digits as people type or paste ("123 456" works too).
  // Sign in straight away when a whole code arrives at once: pasted, filled in by
  // the phone from the email, or brought in with the Paste button. Typing is left
  // alone, since the code could be 6 to 10 digits long.
  function fillCode(text) {
    const digits = String(text || '').replace(/\D/g, '').slice(0, 10);
    $('auth-code-input').value = digits;
    codeError('');
    if (digits.length >= 6) $('code-form').requestSubmit();
    return digits.length;
  }

  $('auth-code-input').addEventListener('paste', (e) => {
    const text = e.clipboardData && e.clipboardData.getData('text');
    if (text) { e.preventDefault(); fillCode(text); }
  });

  let lastCodeLength = 0;
  $('auth-code-input').addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
    if (digits !== e.target.value) e.target.value = digits;
    codeError('');
    const jumped = digits.length - lastCodeLength >= 4; // whole code arrived in one go (phone autofill)
    lastCodeLength = digits.length;
    if (jumped && digits.length >= 6 && e.inputType !== 'insertText') $('code-form').requestSubmit();
  });

  // The Paste button reads the clipboard, which browsers allow after a tap.
  // Claude's preview blocks it, so the button only shows on the real site.
  if (!framed && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    $('code-paste').hidden = false;
    $('code-paste').addEventListener('click', async () => {
      try {
        const n = fillCode(await navigator.clipboard.readText());
        if (n < 6) codeError("We couldn't find a code on your clipboard. Copy the code from the email, then tap Paste.");
      } catch (err) {
        codeError('Paste was blocked. Press and hold the box above, then choose Paste.');
      }
    });
  }

  $('code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('auth-code-input').value.replace(/\D/g, '');
    if (token.length < 6) return codeError('Enter the full code from the email.');
    const btn = $('code-btn');
    if (btn.disabled) return; // already checking
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const { error } = await sb.auth.verifyOtp({ email: sentTo, token, type: 'email' });
    btn.disabled = false;
    btn.textContent = 'Sign in';
    if (error) {
      // Supabase gives the same error for a mistyped code and an expired one.
      return codeError("That code didn't work. It may be mistyped or out of date, so check it or send a new one.");
    }
    // Signed in: the sign-in listener closes this window and shows the ready message.
  });

  $('auth-resend').addEventListener('click', async () => {
    if (!sentTo) return;
    codeError('');
    const error = await sendCode(sentTo);
    if (error) return codeError(sendErrorText(error));
    startResendCooldown();
    codeError('');
    $('auth-code-input').value = '';
    $('auth-code-input').focus();
  });

  $('auth-back').addEventListener('click', () => {
    $('auth-sent-view').hidden = true;
    $('auth-form-view').hidden = false;
    $('auth-email-input').focus();
  });

  $('signin-btn').addEventListener('click', () => openAuth(null));
  $('signout-btn').addEventListener('click', async () => {
    if (sb) await sb.auth.signOut();
    user = null;
    $('ready').hidden = true;
    updateAccountUI();
  });

  $('dl-svg').addEventListener('click', () => requireAccount('svg'));
  $('dl-png').addEventListener('click', () => requireAccount('png'));

  /* ---------------- Phone dock ---------------- */
  // Shows a small copy of the code at the bottom of the screen while the big
  // preview is scrolled out of view but you are still in the generator.
  const dock = $('dock');
  let stageVisible = true, toolVisible = true;

  function syncDock() {
    if (!dock) return;
    const thumb = $('dock-thumb');
    thumb.innerHTML = code ? QR.toSVG(code, renderOptions()) : '';
    $('dock-meta').textContent = code ? payload : 'Add content to make a code';
    $('dock-svg').disabled = $('dock-png').disabled = !code;
    const show = !!code && !stageVisible && toolVisible;
    dock.classList.toggle('show', show);
    dock.inert = !show;
    applyLock();
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { stageVisible = e.isIntersecting; syncDock(); }, { threshold: 0.15 }).observe($('stage'));
    new IntersectionObserver(([e]) => { toolVisible = e.isIntersecting; syncDock(); }, { rootMargin: '0px 0px -30% 0px' }).observe($('generator'));
  }
  $('dock-svg').addEventListener('click', () => requireAccount('svg'));
  $('dock-png').addEventListener('click', () => requireAccount('png'));

  /* ---------------- Start ---------------- */
  buildStyles();
  buildShapes();
  buildSwatches('fg');
  buildSwatches('bg');
  // Each page can open the generator ready for its job (set by the page builder).
  {
    const page = window.QRO_PAGE || {};
    Object.entries(page.fields || {}).forEach(([id, value]) => {
      const el = $(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!value; else el.value = value;
    });
    selectTab(TABS.includes(page.tab) ? page.tab : 'link');
  }
  updateAccountUI();

  // Bring back a design from before sign-in. This browser's copy wins when it is at
  // least as new, because it also has the logo; otherwise use the copy from the link.
  {
    const fromLink = takeLinkDraft();
    const local = cleanDraft(readDraft());
    const pick = local && (!fromLink || local.t >= fromLink.t) ? local : fromLink;
    if (pick) { resumed = pick; applyDraft(pick); }
  }

  if (sb) {
    sb.auth.onAuthStateChange((event, session) => {
      user = session ? session.user : null;
      updateAccountUI();
      if (user) {
        if (resumed || pending) {
          if ($('auth').open) $('auth').close();
          showReady((resumed && resumed.kind) || pending);
          clearDraft();
          resumed = null;
        }
      }
    });
    sb.auth.getSession().then(({ data }) => {
      user = data && data.session ? data.session.user : null;
      updateAccountUI();
    });
  }
})();
