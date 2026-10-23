/* Design 5, Carousel: shared by d5-carousel.html (Carousel 1, window.D5_STYLE = 'classic')
   and d5b-carousel.html (Carousel 2, window.D5_STYLE = 'bauhaus'). Only the poster painter differs. */
(function () {
  'use strict';
  var WALLS = [
    ['01.jpg', 'Aoraki / Mount Cook', 'Michal Klajban'], ['02.jpg', 'Three Sisters, Canmore', 'Jakub Fryš'],
    ['03.jpg', 'Llyn Ogwen, Milky Way', 'John Badham'], ['04.jpg', 'Aurora borealis, Estonia', 'Kristian Pikner'],
    ['05.jpg', 'Lake Mystery, Canterbury', 'Michal Klajban'], ['06.jpg', 'Soltan salt lake, Iran', 'Amir Pashaei'],
    ['07.jpg', 'Sossusvlei, Namibia', 'Diego Delso'], ['08.jpg', 'Sossusvlei dunes, Namibia', 'Diego Delso'],
    ['09.jpg', 'Geirangerfjord, Norway', 'Ximonic (Simo Räsänen)'], ['10.jpg', 'Lago do Cuniã, Brazil', 'RodrigoErse'],
    ['11.jpg', 'Tschierva glacier, Switzerland', 'Daniel Schwen'], ['12.jpg', 'View from Herzogenhorn', 'Jörg Braukmann'],
    ['13.jpg', 'Westruper Heide, Haltern', 'Dietmar Rabich'], ['14.jpg', 'Volcán Pacaya, Guatemala', 'Christopher Crouzet']
  ];
  // [background, second colour, accent for rings]; light backgrounds get dark ink automatically
  var BRAND = {
    'youtube': ['#ff1238', '#b0002a', '#2f5bff'], 'netflix': ['#141414', '#000000', '#e50914'], 'plex': ['#ffb100', '#ff7a00', '#1d1d1d'],
    'prime video': ['#1a98ff', '#0047ff', '#00f0ff'], 'spotify': ['#1ed760', '#00a843', '#6b2bff'], 'dstv now': ['#0057ff', '#0028b8', '#ff2e93'],
    'tv browser': ['#7a35ff', '#4a10d8', '#2bd9ff'], 'deezer': ['#a238ff', '#6a00f4', '#ff6d2e'], 'dazn': ['#f2ff00', '#c8d400', '#0c0c0c'],
    'red bull tv': ['#00163d', '#000a24', '#ff2d3c'], 'nba': ['#1d428a', '#0b2a66', '#ff2952'], 'ufc': ['#d20a0a', '#850000', '#ffffff'],
    'mubi': ['#0d0d0d', '#000000', '#ffffff'], 'uefa.tv': ['#0033ff', '#001a9e', '#00e5ff'], 'startimes on': ['#ff6a00', '#e23b00', '#ffe000'],
    'app store': ['#0a84ff', '#5e2bff', '#ff2fa0'], 'stremio lite': ['#7b5bf5', '#3d1fb8', '#19e36b']
  };
  var PALETTE = [['#2337ff', '#1220b8', '#ff2fa0'], ['#ff2fa0', '#c4006e', '#2337ff'], ['#8a2bff', '#5a00d6', '#19e36b'],
    ['#19e36b', '#00a94a', '#8a2bff'], ['#00b7ff', '#0063d6', '#ff2fa0'], ['#ff3d3d', '#c40024', '#8a2bff']];
  // icon geometry (24-unit viewBox), shared by the SVG fallback and the canvas painter
  var GLYPH = {
    globe: { circles: [[12, 12, 8.5]], paths: ['M3.5 12h17', 'M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z'], rects: [] },
    tv: { circles: [], paths: ['M9 20h6'], rects: [[3, 5, 18, 12, 2]] },
    antenna: { circles: [], paths: ['m8 3 4 5 4-5'], rects: [[3, 8, 18, 11, 2]] }
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var $ = function (id) { return document.getElementById(id); };
  var icons = {}, logos = {}, homeApps = null, allApps = null, apps = [], inputs = [], tvState = null;
  var mode = 'apps', zone = 'ring', chip = 0, ambient = false;
  var search = { open: false, q: '', qn: '', matches: [], hits: {}, results: [], recent: false, suggest: null,
    sub: 'kb', row: 0, col: 0, anchor: 0, res: 0, digits: false, grew: false };

  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var opened = load('opened') || {};

  function api(path, done) {
    var x = new XMLHttpRequest();
    x.open('GET', path, true); x.timeout = 15000;
    x.onload = function () { var r = null; try { r = JSON.parse(x.responseText); } catch (e) {} if (done) done(r); };
    x.onerror = x.ontimeout = function () { if (done) done(null); };
    x.send();
  }

  // ---------- words ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clean(n) { return String(n).replace(/[▶︎]/g, '').replace(/\s*[:.]\s*$/, '').replace(/\s*:\s.*$/, '').trim(); }
  function nice(n) { var c = clean(n); return c === 'TV Browser' ? 'Browser' : c; }
  function inputName(n) { return clean(n).replace(/^HDMI(\d)/i, 'HDMI $1'); }
  function pad(n) { return ('0' + n).slice(-2); }
  function hm(d) { return (d.getHours() % 12 || 12) + ':' + pad(d.getMinutes()); }
  function mod(n, m) { return ((n % m) + m) % m; }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function light(hex) { var c = rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 170; }
  function hexA(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function luma(hex) { return rgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (a, v, i) { return a + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  function contrast(a, b) { var x = luma(a), y = luma(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function hitColour(s) {   // the poster's accent if it reads on the background, else a bright alternative
    var opts = [s.c[2], '#ffe600', '#00f0ff', '#ff2fa0', s.ink];
    for (var i = 0; i < opts.length; i++) if (opts[i] !== s.ink && contrast(opts[i], s.c[0]) >= 3) return opts[i];
    return s.ink;
  }
  function colours(key) { return BRAND[key] || PALETTE[hash(key) % PALETTE.length]; }
  function initials(n) {
    var w = nice(n).replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (!w.length) return nice(n).charAt(0);
    return (w[0].charAt(0) + (w[1] ? w[1].charAt(0) : w[0].charAt(1) || '')).toUpperCase();
  }
  function stamp(t) {
    if (!t) return ['NEW', 'Never opened'];
    var d = new Date(t), now = new Date();
    if (d.toDateString() === now.toDateString()) return [pad(d.getHours()) + ':' + pad(d.getMinutes()), 'Opened today'];
    return [pad(d.getDate()) + '.' + pad(d.getMonth() + 1), 'Last opened'];
  }

  // ---------- what a poster says (shared by both renderers) ----------
  function list() {   // while searching, the ribbon holds only the matches
    if (mode === 'apps' && search.open && search.qn) return search.matches.length ? search.matches : search.suggest ? [search.suggest] : [];
    return mode === 'apps' ? apps : inputs;
  }
  function spec(slot) {
    var l = list(); if (!l.length) return null;
    var i = mod(slot, l.length), item = l[i];
    if (mode === 'apps') {
      var key = clean(item).toLowerCase(), c = colours(key), st = stamp(opened[clean(item)]);
      var now = !!(tvState && tvState.statetype === 'app' && (tvState.name || '').toLowerCase() === key);
      var hits = (search.open && search.qn && search.hits[item]) || null;
      return { kind: 'app', item: item, key: key, c: c, ink: light(c[0]) ? '#0b0b0b' : '#ffffff', seed: hash(key),
        top: 'Launcher', bottom: dispName(item).toUpperCase(), name: dispName(item), hits: hits,
        logo: icons[key] ? 'icons/' + icons[key] + '.png' : null, glyph: key === 'tv browser' ? 'globe' : null, mono: initials(item),
        meta: st, now: now, when: opened[clean(item)] || 0, pos: pad(i + 1), total: l.length,
        id: 'a|' + key + '|' + st[0] + '|' + now + '|' + i + '/' + l.length + '|' + (hits ? hits.join('.') : '') };
    }
    var tv = /^tv$/i.test(item.id), name = inputName(item.name), pc = PALETTE[i % PALETTE.length];
    return { kind: 'input', item: item, key: item.id, c: pc, ink: '#ffffff', seed: hash(item.id),
      top: 'Input', bottom: name.toUpperCase(), name: tv ? 'TV' : name,
      logo: null, glyph: tv ? 'antenna' : 'tv', mono: '',
      meta: item.signal ? ['LIVE', 'Signal detected'] : ['OFF', 'Nothing connected'], now: false, signal: !!item.signal, pos: pad(i + 1), total: l.length,
      id: 'i|' + item.id + '|' + item.signal + '|' + i + '/' + l.length };
  }
  function ringsFor(seed) {
    var a = seed % 3;
    return { cx1: [380, 60, 420][a], cy1: [520, 560, 120][a], r1: [300, 340, 260][a], cx2: [-40, 470, 30][a], cy2: [120, 80, 620][a] };
  }

  // ---------- toast / zones / actions (shared) ----------
  var toastTimer;
  function toast(msg, err) {
    var t = $('toast'); t.textContent = msg; t.className = 'on' + (err ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = err ? 'err' : ''; }, 2200);
  }
  function setZone(z) {
    zone = z;
    var cs = $('chips').children;
    for (var i = 0; i < cs.length; i++) cs[i].className = 'chip' + (z === 'chips' && i === chip ? ' on' : '');
    $('hint').textContent = z === 'chips' ? '◀ ▶ to choose · OK to select · ▲ back to posters'
      : mode === 'apps' ? '◀ ▶ to browse · OK to open · ▼ for more' : '◀ ▶ to browse · OK to switch input · BACK for apps';
  }
  function setMode(m) {
    mode = m;
    $('chip-mode').textContent = m === 'apps' ? 'Inputs' : 'Apps';
    R.rebuild(); setZone('ring');
  }
  function openSlot(slot) {
    var s = spec(slot); if (!s) return;
    if (s.kind === 'app') openApp(s.item);
    else {
      toast('Switching to ' + inputName(s.item.name));
      api('/api/source?id=' + encodeURIComponent(s.item.id), function (r) { if (!r || !r.ok) toast('Could not switch input', true); });
    }
  }
  function openApp(item) {
    toast('Opening ' + nice(item));
    opened[clean(item)] = Date.now(); save('opened', opened);
    api('/api/launch?name=' + encodeURIComponent(item), function (r) { if (!r || !r.ok) toast('Could not open ' + nice(item), true); });
    R.changed();
  }
  function chipAction() {
    var act = $('chips').children[chip].getAttribute('data-act');
    if (act === 'search') openSearch();
    else if (act === 'inputs') setMode(mode === 'apps' ? 'inputs' : 'apps');
    else if (act === 'photos') setAmbient(true);
    else if (act === 'settings') api('/api/key?k=KEY_MENU');
  }
  function setAmbient(on) {
    ambient = on;
    if (on) {
      var w = WALLS[Math.floor(Date.now() / 600000) % WALLS.length];
      $('ambient').style.backgroundImage = 'url(bg/1080s/' + w[0] + ')';
      $('am-credit').textContent = w[1] + ' · ' + w[2];
    }
    $('ambient').className = on ? 'on' : '';
    R.paused(on);
  }
  var lastCentre = null;
  function centreChanged(slot) {   // header count and the glow under the ribbon follow the centred poster
    var l = list(); if (!l.length) return;
    var s = spec(slot), id = mode + search.qn + l.length + ':' + mod(slot, l.length);
    if (id === lastCentre) return;
    lastCentre = id;
    $('mode').innerHTML = (search.open && search.qn ? (search.matches.length ? 'Found' : 'Closest') : mode === 'apps' ? 'Apps' : 'Inputs') + ' <i>' + pad(mod(slot, l.length) + 1) + ' / ' + pad(l.length) + '</i>';
    $('floor').style.background = 'radial-gradient(ellipse at 50% 35%,' + hexA(s.c[0], .42) + ', rgba(0,0,0,0) 65%)';
  }

  // =====================================================================================================
  // WebGL renderer
  // =====================================================================================================
  function makeGL() {
    var canvas = $('gl');
    var opts = { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: 'high-performance' };
    var gl = canvas.getContext('webgl2', opts), gl2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) return null;

    // world units are CSS pixels; the camera sits 1700px in front of the ribbon's front face, like a CSS perspective
    var W = 460, H = 640, RAD = 1400, SPACING = 488, CAM = 1700, CY = 520, POP = 150;
    var TW = 576, TH = 800;   // texture size (1.25x the poster, so the centred one stays crisp when it scales up)
    var SEG_X = 32, SEG_Y = 8;

    var VS = [
      'attribute vec2 aPos;',            // -0.5..0.5 across the poster
      'uniform float uK;',               // this poster's offset from the centre, in posters (fractional while moving)
      'uniform mediump float uVel;',     // scroll velocity, posters/second, softly clamped to -1..1
      'uniform float uTime;',
      'uniform mediump float uMirror;',  // 1 for the floor reflection
      'uniform float uAppear;',
      'varying vec2 vUv;',
      'varying float vEdge;',
      'varying float vFloor;',
      'const float W = ' + W.toFixed(1) + ', H = ' + H.toFixed(1) + ', RAD = ' + RAD.toFixed(1) + ', SP = ' + SPACING.toFixed(1) + ';',
      'const float CAM = ' + CAM.toFixed(1) + ', CY = ' + CY.toFixed(1) + ', POP = ' + POP.toFixed(1) + ';',
      'void main() {',
      '  float av = abs(uVel);',
      '  float near = exp(-uK * uK * 2.2);',                        // 1 at the centre, falling off by the next poster
      '  float scale = 1.0 + 0.07 * near;',
      '  float lx = aPos.x * W * scale * (1.0 + 0.07 * av);',        // stretch along the motion
      '  float ly = aPos.y * H * scale;',
      '  float r = RAD * (1.0 - 0.2 * av);',                        // the cylinder tightens with speed, so the ribbon breathes
      '  float s = uK * SP * (1.0 + 0.05 * av) + lx;',
      '  float a = s / r;',
      '  float x = r * sin(a);',
      '  float z = r * (cos(a) - 1.0) + POP * near * (1.0 - 0.5 * av);',
      '  float yn = aPos.y;',
      '  x -= uVel * 46.0 * yn;',                                    // the top leans back against the motion, like cloth
      '  z += -abs(uVel) * 70.0 * (yn * yn - 0.25);',                // and the poster cups slightly while it travels
      '  float wave = sin(s * 0.011 - uTime * 7.0) * av;',           // a ripple runs across the ribbon while moving
      '  z += wave * 26.0;',
      '  ly += wave * 6.0;',
      '  ly += (1.0 - uAppear) * -60.0;',
      '  if (uMirror > 0.5) ly = -H * scale - ly - 6.0;',            // mirror about the poster bottom: the floor
      '  float w = (CAM - z) / CAM;',
      '  float sx = 960.0 + x / w;',
      '  float sy = CY - ly / w;',
      '  gl_Position = vec4((sx / 960.0 - 1.0) * w, (1.0 - sy / 540.0) * w, 0.0, w);',
      '  vUv = vec2(aPos.x + 0.5, 0.5 - aPos.y);',
      '  vEdge = abs(a);',
      '  vFloor = (aPos.y + 0.5);',                                  // 0 at the poster bottom, 1 at its top
      '}'
    ].join('\n');

    var FS = [
      'precision mediump float;',
      'uniform sampler2D uTex;',
      'uniform float uHasTex;',
      'uniform vec3 uColor;',
      'uniform mediump float uVel;',
      'uniform float uShade;',
      'uniform float uAlpha;',
      'uniform mediump float uMirror;',
      'varying vec2 vUv;',
      'varying float vEdge;',
      'varying float vFloor;',
      'vec3 tap(vec2 uv) { return uHasTex > 0.5 ? texture2D(uTex, uv).rgb : uColor; }',
      'void main() {',
      '  vec2 p = vUv * vec2(' + W.toFixed(1) + ', ' + H.toFixed(1) + ');',
      '  vec2 q = abs(p - vec2(' + (W / 2).toFixed(1) + ', ' + (H / 2).toFixed(1) + ')) - vec2(' + (W / 2 - 22).toFixed(1) + ', ' + (H / 2 - 22).toFixed(1) + ');',
      '  float d = length(max(q, 0.0)) - 22.0;',                     // rounded corners, antialiased
      '  float mask = 1.0 - smoothstep(-1.2, 0.6, d);',
      '  vec3 col;',
      '  float av = abs(uVel);',
      '  if (av > 0.02 && uHasTex > 0.5) {',
      '    vec2 ca = vec2(uVel * 0.0065, 0.0);',                     // colour fringes split along the motion
      '    vec2 sm = vec2(uVel * 0.014, 0.0);',                      // and a short smear trails behind
      '    col.r = texture2D(uTex, vUv + ca).r;',
      '    col.g = texture2D(uTex, vUv).g;',
      '    col.b = texture2D(uTex, vUv - ca).b;',
      '    col = col * 0.5 + (texture2D(uTex, vUv - sm).rgb + texture2D(uTex, vUv - sm * 2.0).rgb) * 0.25;',
      '  } else {',
      '    col = tap(vUv);',
      '  }',
      '  col *= 1.0 - uShade;',
      '  col *= 1.0 - 0.35 * smoothstep(0.55, 1.2, vEdge);',         // posters darken as they turn away
      '  float alpha = mask * uAlpha;',
      '  if (uMirror > 0.5) { alpha *= 0.18 * (1.0 - smoothstep(0.0, 0.24, vFloor)); col *= 0.8; }',
      '  gl_FragColor = vec4(col * alpha, alpha);',
      '}'
    ].join('\n');

    function shader(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
      gl.bindAttribLocation(prog, 0, 'aPos');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { if (window.console) console.warn('WebGL ribbon unavailable:', e); return null; }
    gl.useProgram(prog);
    var U = {};
    ['uK', 'uVel', 'uTime', 'uMirror', 'uAppear', 'uTex', 'uHasTex', 'uColor', 'uShade', 'uAlpha'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    // one subdivided plane shared by every poster
    var verts = [], idx = [], ix, iy;
    for (iy = 0; iy <= SEG_Y; iy++) for (ix = 0; ix <= SEG_X; ix++) verts.push(ix / SEG_X - 0.5, 0.5 - iy / SEG_Y);
    for (iy = 0; iy < SEG_Y; iy++) for (ix = 0; ix < SEG_X; ix++) {
      var a0 = iy * (SEG_X + 1) + ix, b0 = a0 + SEG_X + 1;
      idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var COUNT = idx.length;
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, 1920, 1080);
    gl.uniform1i(U.uTex, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    // ---------- poster painter: one offscreen canvas, reused ----------
    var paper = document.createElement('canvas'); paper.width = TW; paper.height = TH;
    var ctx = paper.getContext('2d');
    var fontsReady = false;

    function roundRect(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function spaced(px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
    function capRow(word, y) {
      ctx.font = '800 13px Unbounded'; spaced(1.3); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      var x = 0, unit = word.toUpperCase() + '    ';
      while (x < W) { ctx.fillText(unit, x, y); x += ctx.measureText(unit).width; }
    }
    function drawGlyph(name, cx, cy, size, ink) {
      var g = GLYPH[name], k = size / 24;
      ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(k, k);
      ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      g.circles.forEach(function (c) { ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); ctx.stroke(); });
      g.rects.forEach(function (r) { var s = ctx; s.save(); s.scale(1, 1); roundRectLocal(r); s.stroke(); s.restore(); });
      g.paths.forEach(function (p) { ctx.stroke(new Path2D(p)); });
      ctx.restore();
    }
    function roundRectLocal(r) {
      var x = r[0], y = r[1], w = r[2], h = r[3], rr = r[4];
      ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
    }
    function wrap(text, maxW) {
      var words = text.split(/\s+/), lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var t = cur ? cur + ' ' + words[i] : words[i];
        if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = words[i]; }
      }
      if (cur) lines.push(cur);
      return lines;
    }
    // ---------- Carousel 2 painter: Bauhaus-style event posters, eight layouts picked per app, in the original fonts ----------
    // Shapes use only the poster's own colours (its background, its darker tone, its accent, tints of those) plus its ink;
    // photos are the wallpapers in greyscale, cropped into arches, circles and quarter-discs.
    var grays = {};
    function grayPhoto(file) {
      var g = grays[file];
      if (g) return g.ready ? g.canvas : null;
      g = grays[file] = { ready: false, canvas: document.createElement('canvas') };
      var img = new Image();
      img.onload = function () {
        var cv = g.canvas; cv.width = 960; cv.height = 540;
        var x = cv.getContext('2d');
        if ('filter' in x) { x.filter = 'grayscale(1) contrast(1.12) brightness(1.04)'; x.drawImage(img, 0, 0, 960, 540); }
        else {
          x.drawImage(img, 0, 0, 960, 540);
          var d = x.getImageData(0, 0, 960, 540), p = d.data;
          for (var i = 0; i < p.length; i += 4) { var l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11; p[i] = p[i + 1] = p[i + 2] = l; }
          x.putImageData(d, 0, 0);
        }
        g.ready = true; R.changed();
      };
      img.src = 'bg/1080s/' + file;
      return null;
    }
    function mix(a, b, t) { var x = rgb(a), y = rgb(b); return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')'; }
    function hexOf(c) { var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c); return m ? '#' + [m[1], m[2], m[3]].map(function (v) { return ('0' + (+v).toString(16)).slice(-2); }).join('') : c; }
    function inkOn(fill) { return luma(hexOf(fill)) > 0.42 ? '#0b0b0b' : '#ffffff'; }
    function hlOn(under, text, s) {   // a highlight for matched letters that reads on what's under the headline
      var opts = [s.c[2], '#ffe600', '#00f0ff', '#ff2fa0', '#ffffff', '#0b0b0b'], u = hexOf(under);
      for (var i = 0; i < opts.length; i++) if (opts[i] !== text && contrast(opts[i], u) >= 3) return opts[i];
      return text;
    }

    function circ(cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
    function half(cx, cy, r, from) { ctx.beginPath(); ctx.arc(cx, cy, r, from, from + Math.PI); ctx.closePath(); }
    function arch(x, y, w, h) { var r = w / 2; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); }
    function star(cx, cy, R1, R2, n) {
      ctx.beginPath();
      for (var i = 0; i < n * 2; i++) { var a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? R2 : R1; ctx[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a)); }
      ctx.closePath();
    }
    function blob(cx, cy, r, seed) {   // an organic shape: a closed curve through wobbling points
      var n = 7, pts = [];
      for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2, w = 1 + 0.16 * Math.sin(seed * 1.7 + i * 2.3); pts.push([cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w * 0.92]); }
      ctx.beginPath();
      for (i = 0; i < n; i++) {
        var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        if (!i) ctx.moveTo(p1[0], p1[1]);
        ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
      }
      ctx.closePath();
    }
    function photo(s, shape, bx, by, bw, bh) {   // the wallpaper, greyscale, cover-cropped into the current path
      var cv = grayPhoto(WALLS[s.seed % WALLS.length][0]);
      ctx.save(); shape(); ctx.clip();
      if (cv) {
        var sc = Math.max(bw / 960, bh / 540) * 1.15, w = 960 * sc, h = 540 * sc;
        var ox = (s.seed % 7) / 6, oy = ((s.seed >> 3) % 5) / 4;
        ctx.drawImage(cv, bx - (w - bw) * ox, by - (h - bh) * oy, w, h);
      } else { ctx.fillStyle = '#777'; ctx.fillRect(bx, by, bw, bh); }
      ctx.restore();
    }
    function logoDisc(s, img, cx, cy, r, ring) {
      if (ring) { ctx.fillStyle = ring; circ(cx, cy, r + 7); ctx.fill(); }
      ctx.save(); circ(cx, cy, r); ctx.clip();
      if (img) {   // the icon sits in the disc as an inset rounded square, so nothing of it is cut away
        ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        var q = r * 1.26; ctx.save(); roundRect(cx - q / 2, cy - q / 2, q, q, q * 0.24); ctx.clip(); ctx.drawImage(img, cx - q / 2, cy - q / 2, q, q); ctx.restore();
      }
      else {
        ctx.fillStyle = s.ink; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        if (s.glyph) drawGlyph(s.glyph, cx, cy, r * 1.15, s.c[0]);
        else { ctx.fillStyle = s.c[0]; ctx.font = '800 ' + Math.round(r * 0.62) + 'px Unbounded'; spaced(-r * 0.03); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.mono, cx, cy + r * 0.04); spaced(0); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
      }
      ctx.restore();
    }
    function pill(x, y, w, h, fill) { roundRect(x, y, w, h, h / 2); ctx.fillStyle = fill; ctx.fill(); }

    // the headline: Anton, set as big as the box allows, like the original posters; matched search letters get a highlight
    function title(s, x, y, w, h, opt) {
      var size = opt.max || 120, lines, lh, text = s.name.toUpperCase();
      for (; ; size -= 4) {
        ctx.font = '400 ' + size + 'px Anton'; spaced(size * 0.005);
        lines = wrap(text, w); lh = size * 0.9;
        var widest = 0; lines.forEach(function (t) { widest = Math.max(widest, ctx.measureText(t).width); });
        if ((lines.length <= (opt.lines || 2) && widest <= w && lines.length * lh <= h) || size <= 30) break;
      }
      var total = lines.length * lh, top = opt.valign === 'bottom' ? y + h - total : opt.valign === 'middle' ? y + (h - total) / 2 : y;
      var hitSet = {}, hl = s.hits && s.hits.length ? hlOn(opt.under, opt.color, s) : null, offset = 0;
      if (hl) s.hits.forEach(function (i) { hitSet[i] = 1; });
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li], base = top + li * lh + size * 0.84, lw = ctx.measureText(line).width;
        var lx = opt.align === 'center' ? x + (w - lw) / 2 : opt.align === 'right' ? x + w - lw : x;
        if (!hl) { ctx.fillStyle = opt.color; ctx.fillText(line, lx, base); }
        else for (var ci = 0; ci < line.length; ci++) {
          var cx = lx + ctx.measureText(line.slice(0, ci)).width, on = hitSet[offset + ci];
          ctx.fillStyle = on ? hl : opt.color;
          if (on) { ctx.strokeStyle = s.c[1]; ctx.lineWidth = Math.max(3, size * 0.05); ctx.lineJoin = 'round'; ctx.strokeText(line.charAt(ci), cx, base); }
          ctx.fillText(line.charAt(ci), cx, base);
          if (on) ctx.fillRect(cx, base + size * 0.07, ctx.measureText(line.charAt(ci)).width, Math.max(4, size * 0.06));
        }
        offset += line.length + 1;
      }
      spaced(0);
      return { size: size, top: top, bottom: top + total };
    }
    // small print, in the original's voices: Unbounded caps for labels, Anton for figures, Inter for plain text
    function small(text, x, y, color, opt) {
      opt = opt || {};
      if (opt.figure) { ctx.font = '400 ' + (opt.size || 40) + 'px Anton'; spaced(0.4); }
      else if (opt.label) { ctx.font = '800 ' + (opt.size || 12) + 'px Unbounded'; spaced((opt.size || 12) * 0.1); text = text.toUpperCase(); }
      else { ctx.font = '400 ' + (opt.size || 17) + 'px Inter'; spaced(-0.2); }
      ctx.fillStyle = color; ctx.textAlign = opt.align || 'left'; ctx.textBaseline = 'alphabetic';
      if (opt.maxW) ctx.fillText(text, x, y, opt.maxW); else ctx.fillText(text, x, y);
      var w = ctx.measureText(text).width;
      ctx.textAlign = 'left'; spaced(0);
      return w;
    }
    function facts(s) {   // one clear status line, a short stamp, the number, and rows for the schedule layout
      var p = s.pos + ' / ' + pad(s.total);
      if (s.kind === 'input') {
        return { status: s.signal ? 'Live now' : 'No signal', stamp: s.signal ? 'LIVE' : 'OFF', idx: p,
          rows: [['Signal', s.signal ? 'Live' : 'None'], ['Number', p]] };
      }
      if (!s.when) return { status: s.now ? 'On now' : 'New', stamp: 'NEW', idx: p, rows: [['Status', s.now ? 'On now' : 'New'], ['Number', p]] };
      var d = new Date(s.when), dm = pad(d.getDate()) + '.' + pad(d.getMonth() + 1), time = pad(d.getHours()) + ':' + pad(d.getMinutes());
      return { status: s.now ? 'On now' : 'Last opened ' + dm + ' · ' + time, stamp: dm, time: time, idx: p,
        rows: [['Last opened', dm + '.' + d.getFullYear()], ['Time', time], ['Number', p]] };
    }
    function nowBadge(s, x, y, fill, text) {
      if (!s.now) return;
      ctx.font = '800 12px Unbounded'; spaced(1.2);
      var w = ctx.measureText('ON NOW').width + 26; spaced(0);
      pill(x - w, y, w, 28, fill); small('On now', x - w / 2, y + 19, text, { label: true, align: 'center' });
    }

    var LAYOUTS = [
      function circleGrid(s, P, img) {   // a grid of circles and half-circles; the logo takes one cell
        ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
        var logoCell = 5 + s.seed % 6, photoCell = (logoCell + 7) % 16;
        for (var i = 0; i < 16; i++) {
          var cx = 80 + (i % 4) * 100, cy = 78 + Math.floor(i / 4) * 98, k = (i * 7 + s.seed) % 5;
          if (i === logoCell) { logoDisc(s, img, cx, cy, 42, null); continue; }
          if (i === photoCell) { photo(s, function () { circ(cx, cy, 44); }, cx - 44, cy - 44, 88, 88); continue; }
          ctx.fillStyle = [P.lt, P.acc, P.dk, P.ink, P.lt][k];
          if (k === 0) { circ(cx, cy, 44); ctx.fill(); }
          else if (k === 1) { half(cx, cy + 4, 44, Math.PI); ctx.fill(); }
          else if (k === 2) { half(cx - 4, cy, 44, -Math.PI / 2); ctx.fill(); }
          else if (k === 3) { circ(cx, cy, 40); ctx.lineWidth = 4; ctx.strokeStyle = P.ink; ctx.stroke(); }
          else { half(cx, cy - 4, 44, 0); ctx.fill(); circ(cx, cy - 18, 12); ctx.fillStyle = P.bg; ctx.fill(); }
        }
        var f = facts(s);
        title(s, 32, 448, 396, 124, { color: P.ink, under: P.bg, valign: 'bottom', max: 116 });
        small(f.status, 32, 612, P.ink, { label: true, size: 13, maxW: 280 });
        small(f.idx, 428, 616, P.ink, { figure: true, size: 34, align: 'right' });
        nowBadge(s, 428, 22, P.ink, P.bg);
      },
      function archName(s, P, img) {   // a photo in an arch, the name on a pill across its foot
        ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = P.dk; arch(40, 26, 380, 420); ctx.fill();
        photo(s, function () { arch(58, 44, 344, 390); }, 58, 44, 344, 390);
        logoDisc(s, img, 372, 84, 50, P.bg);
        pill(26, 392, 408, 104, P.acc);
        title(s, 52, 400, 356, 88, { color: P.accInk, under: P.acc, valign: 'middle', align: 'center', lines: 1, max: 88 });
        var f = facts(s);
        small(f.status, 230, 548, P.ink, { label: true, size: 14, align: 'center', maxW: 380 });
        small(f.idx, 230, 608, P.ink, { figure: true, size: 40, align: 'center' });
        nowBadge(s, 120, 30, P.ink, P.bg);
      },
      function starburst(s, P, img) {   // a 12-point star carries the logo; the date sits like an event stamp
        ctx.fillStyle = P.dk; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = P.bg; circ(230, 262, 228); ctx.fill();
        ctx.fillStyle = P.acc; star(230, 262, 196, 158, 12); ctx.fill();
        logoDisc(s, img, 230, 262, 96, P.dkInk === '#ffffff' ? '#ffffff' : '#0b0b0b');
        var f = facts(s);
        small(f.idx, 28, 50, P.dkInk, { figure: true, size: 32 });
        small(f.stamp, 432, 50, P.dkInk, { figure: true, size: 32, align: 'right' });
        title(s, 28, 486, 404, 108, { color: P.dkInk, under: P.dk, valign: 'top', max: 104 });
        if (f.time && !s.now) small('Opened at ' + f.time, 28, 620, P.dkInk, { label: true, size: 12, maxW: 300 });   // the stamp already says the date or NEW
        nowBadge(s, 432, 596, P.acc, P.accInk);
      },
      function zigzag(s, P, img) {   // a stepped ribbon band carrying the name across, a schedule underneath
        ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
        title(s, 30, 30, 300, 160, { color: P.ink, under: P.bg, valign: 'top', max: 100 });
        logoDisc(s, img, 384, 86, 48, null);
        var pts = [[-20, 300], [120, 230], [240, 330], [360, 250], [490, 340]], band = 58;
        ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; ctx.strokeStyle = P.acc; ctx.lineWidth = band;
        ctx.beginPath(); pts.forEach(function (p, i) { ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1]); }); ctx.stroke();
        ctx.font = '800 17px Unbounded'; spaced(1.4); ctx.fillStyle = P.accInk; ctx.textBaseline = 'middle';
        for (var i = 0; i < pts.length - 1; i++) {   // text rides each straight run of the band
          var a = pts[i], b = pts[i + 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(ang);
          ctx.beginPath(); ctx.rect(0, -band / 2, len, band); ctx.clip();
          var word = (s.name + ' — ').toUpperCase(), x = 10; while (x < len) { ctx.fillText(word, x, 1); x += ctx.measureText(word).width; }
          ctx.restore();
        }
        ctx.textBaseline = 'alphabetic'; spaced(0);
        photo(s, function () { roundRect(30, 390, 120, 120, 60); }, 30, 390, 120, 120);
        var f = facts(s);
        f.rows.forEach(function (r, i) {
          var y = 410 + i * 66;
          ctx.fillStyle = P.ink; ctx.globalAlpha = 0.35; ctx.fillRect(176, y + 24, 254, 2); ctx.globalAlpha = 1;
          small(r[0], 176, y + 12, P.ink, { label: true, size: 11 }); small(r[1], 430, y + 14, P.ink, { figure: true, size: 28, align: 'right' });
        });
        nowBadge(s, 150, 592, P.ink, P.bg);
      },
      function halfDiscs(s, P, img) {   // a big word over stacked half-discs
        ctx.fillStyle = P.lt; ctx.fillRect(0, 0, W, H);
        var t = title(s, 28, 30, 404, 210, { color: P.ltInk, under: P.lt, valign: 'top', max: 150 });
        var f = facts(s);
        small(f.status, 28, t.bottom + 34, P.ltInk, { label: true, size: 13, maxW: 300 });
        small(f.idx, 432, t.bottom + 40, P.ltInk, { figure: true, size: 34, align: 'right' });
        ctx.fillStyle = P.bg; half(230, 640, 230, Math.PI); ctx.fill();
        ctx.fillStyle = P.acc; half(230, 640, 170, Math.PI); ctx.fill();
        photo(s, function () { half(230, 640, 112, Math.PI); }, 118, 528, 224, 112);
        ctx.fillStyle = P.dk; half(230, 410, 66, Math.PI); ctx.fill();
        logoDisc(s, img, 230, 372, 40, P.lt);
        nowBadge(s, 432, 602, P.ink, P.bg);
      },
      function blobby(s, P, img) {   // an organic tint blob holding a circle photo and the small print
        ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = P.lt; blob(250, 380, 200, s.seed); ctx.fill();
        photo(s, function () { circ(250, 330, 104); }, 146, 226, 208, 208);
        title(s, 28, 30, 404, 160, { color: P.ink, under: P.bg, valign: 'top', max: 120 });
        var f = facts(s);
        small(f.status, 250, 482, P.ltInk, { label: true, size: 13, align: 'center', maxW: 300 });
        ctx.font = '800 14px Unbounded'; spaced(1.4); var label = s.now ? 'On now' : 'Open', lw = ctx.measureText(label.toUpperCase()).width; spaced(0);
        pill(28, 568, 90 + lw, 52, P.ink); logoDisc(s, img, 54, 594, 20, null); small(label, 82, 600, P.bg, { label: true, size: 14 });
        small(f.idx, 432, 612, P.ink, { figure: true, size: 34, align: 'right' });
      },
      function quarter(s, P, img) {   // a quarter-disc photo in a rounded frame, the logo at its pivot
        ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = P.dk; ctx.beginPath(); ctx.moveTo(110, 0); ctx.lineTo(460, 0); ctx.lineTo(460, 350); ctx.arc(460, 0, 350, Math.PI / 2, Math.PI); ctx.closePath(); ctx.fill();
        photo(s, function () { ctx.beginPath(); ctx.moveTo(460, 0); ctx.arc(460, 0, 334, Math.PI / 2, Math.PI); ctx.closePath(); }, 126, 0, 334, 334);
        ctx.fillStyle = P.acc; ctx.beginPath(); ctx.moveTo(0, 640); ctx.arc(0, 640, 120, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
        logoDisc(s, img, 112, 112, 58, P.bg);
        roundRect(14, 14, 432, 612, 26); ctx.lineWidth = 3; ctx.strokeStyle = P.ink; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
        title(s, 34, 356, 392, 170, { color: P.ink, under: P.bg, valign: 'bottom', max: 120 });
        var f = facts(s);
        small(f.status, 426, 566, P.ink, { label: true, size: 12, align: 'right', maxW: 260 });
        small(f.idx, 426, 608, P.ink, { figure: true, size: 34, align: 'right' });
        nowBadge(s, 426, 380, P.ink, P.bg);
      },
      function headlineCard(s, P, img) {   // a giant headline on a rounded card, a photo cut into a circle above
        ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
        photo(s, function () { circ(306, 150, 122); }, 184, 28, 244, 244);
        circ(306, 150, 122); ctx.lineWidth = 10; ctx.strokeStyle = P.acc; ctx.stroke();
        var f = facts(s);
        ctx.font = '800 14px Unbounded'; spaced(1.4); var lw = Math.max(ctx.measureText(f.idx).width, 60); spaced(0);
        pill(28, 40, 72 + lw, 56, P.ink); logoDisc(s, img, 56, 68, 22, null); small(f.idx, 88, 74, P.bg, { label: true, size: 14 });
        small(f.status, 28, 150, P.ink, { label: true, size: 12, maxW: 150 });
        roundRect(22, 300, 416, 300, 34); ctx.fillStyle = P.card; ctx.fill();
        title(s, 48, 324, 364, 252, { color: P.cardInk, under: P.card, valign: 'middle', max: 150, lines: 3 });
        nowBadge(s, 438, 262, P.ink, P.bg);
      }
    ];

    function warm() {   // fetch every logo and greyscale photo up front, so fast scrolling rarely meets a blank poster
      var l = list();
      for (var i = 0; i < l.length; i++) {
        var s = spec(i);
        if (s.logo && !logos[s.logo]) { var im = logos[s.logo] = new Image(); im.onload = function () { R.changed(); }; im.src = s.logo; }
        if (paint === paintBauhaus) grayPhoto(WALLS[s.seed % WALLS.length][0]);
      }
    }
    function paintBauhaus(s) {   // Carousel 2: one of eight Bauhaus layouts. Returns false if a logo or photo is still loading
      var img = null;
      if (s.logo) {
        img = logos[s.logo];
        if (!img) { img = logos[s.logo] = new Image(); img.onload = function () { R.changed(); }; img.src = s.logo; }
        if (!img.complete || !img.naturalWidth) return false;
      }
      if (!grayPhoto(WALLS[s.seed % WALLS.length][0])) return false;
      var c = s.c, bg = c[0], ink = s.ink;
      var P = { bg: bg, ink: ink, acc: c[2], lt: mix(bg, '#ffffff', 0.42), dk: mix(bg, '#000000', 0.38),
        card: ink === '#ffffff' ? '#ffffff' : '#0b0b0b' };
      if (contrast(c[2], bg) < 1.6) P.acc = ink === '#ffffff' ? mix(bg, '#ffffff', 0.7) : mix(bg, '#000000', 0.6);   // keep the accent visible
      P.accInk = inkOn(P.acc); P.ltInk = inkOn(P.lt); P.dkInk = inkOn(P.dk); P.cardInk = ink === '#ffffff' ? bg : '#ffffff';
      if (contrast(hexOf(P.cardInk), P.card === '#ffffff' ? '#ffffff' : '#0b0b0b') < 3) P.cardInk = P.card === '#ffffff' ? '#0b0b0b' : '#ffffff';
      ctx.setTransform(TW / W, 0, 0, TH / H, 0, 0);
      ctx.globalAlpha = 1; ctx.shadowColor = 'transparent'; spaced(0); ctx.textAlign = 'left';
      LAYOUTS[(s.seed >> 2) % LAYOUTS.length](s, P, img);
      return true;
    }

    function paintClassic(s) {   // Carousel 1: the original festival poster. Returns false if a logo is still loading
      var img = null;
      if (s.logo) {
        img = logos[s.logo];
        if (!img) { img = logos[s.logo] = new Image(); img.onload = function () { R.changed(); }; img.src = s.logo; }
        if (!img.complete || !img.naturalWidth) return false;
      }
      var c = s.c, ink = s.ink;
      ctx.setTransform(TW / W, 0, 0, TH / H, 0, 0);
      ctx.globalAlpha = 1; ctx.shadowColor = 'transparent'; spaced(0);
      var g = ctx.createLinearGradient(0, 0, W * 0.55, H);
      g.addColorStop(0, c[0]); g.addColorStop(0.45, c[0]); g.addColorStop(1, c[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      var rg = ringsFor(s.seed);
      ctx.strokeStyle = c[2];
      ctx.globalAlpha = 0.95; ctx.lineWidth = 46; ctx.beginPath(); ctx.arc(rg.cx1, rg.cy1, rg.r1, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.7; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(rg.cx1, rg.cy1, rg.r1 - 70, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.18; ctx.fillStyle = c[2]; ctx.beginPath(); ctx.arc(rg.cx2, rg.cy2, 150, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(rg.cx2, rg.cy2, 190, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.92; capRow(s.top, 29); capRow(s.bottom, 626); ctx.globalAlpha = 1;

      // the festival mark
      ctx.save(); ctx.translate(38, 48); ctx.rotate(-6 * Math.PI / 180);
      ctx.font = '800 34px Unbounded'; spaced(-0.7); ctx.textBaseline = 'top';
      ctx.fillText('tv', 0, -3); ctx.fillText('fest', 0, 26);
      ctx.font = '800 22px Unbounded'; ctx.fillText(String(new Date().getFullYear()), 0, 64);
      ctx.restore(); spaced(0);

      // logo
      var L = 196, lx = 230 - L / 2, ly = 214 - L / 2;
      if (img) {
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
        roundRect(lx, ly, L, L, 46); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
        ctx.save(); roundRect(lx, ly, L, L, 46); ctx.clip(); ctx.drawImage(img, lx, ly, L, L); ctx.restore();
      } else if (s.glyph) {
        roundRect(lx, ly, L, L, 46); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fill();
        drawGlyph(s.glyph, 230, 214, 110, ink);
      } else {
        roundRect(lx + 2.5, ly + 2.5, L - 5, L - 5, 44); ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.stroke();
        ctx.font = '800 82px Unbounded'; spaced(-3.3); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.mono, 230, 218); ctx.textAlign = 'left'; spaced(0);
      }

      ctx.fillStyle = ink;
      // the name, as big as two lines allow
      var size = 120, lines;
      for (; ; size -= 8) {
        ctx.font = '400 ' + size + 'px Anton'; spaced(size * 0.005);
        lines = wrap(s.name.toUpperCase(), W - 72);
        var widest = 0; lines.forEach(function (t) { widest = Math.max(widest, ctx.measureText(t).width); });
        if ((lines.length <= 2 && widest <= W - 72 && lines.length * size * 0.9 <= 160) || size <= 44) break;
      }
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      var base = 516 - size * 0.12, baselines = [], li;
      for (li = lines.length - 1; li >= 0; li--) { baselines[li] = base; base -= size * 0.9; }
      var hitSet = {}, hl = s.hits && s.hits.length ? hitColour(s) : null, offset = 0;
      if (hl) s.hits.forEach(function (h) { hitSet[h] = 1; });
      for (li = 0; li < lines.length; li++) {
        var line = lines[li];
        if (!hl) ctx.fillText(line, 36, baselines[li]);
        else for (var ci = 0; ci < line.length; ci++) {   // matched letters take the highlight colour and an underline
          var x = 36 + ctx.measureText(line.slice(0, ci)).width, on = hitSet[offset + ci];
          ctx.fillStyle = on ? hl : ink;
          if (on) { ctx.strokeStyle = s.c[1]; ctx.lineWidth = Math.max(3, size * 0.05); ctx.lineJoin = 'round'; ctx.strokeText(line.charAt(ci), x, baselines[li]); }
          ctx.fillText(line.charAt(ci), x, baselines[li]);
          if (on) ctx.fillRect(x, baselines[li] + size * 0.07, ctx.measureText(line.charAt(ci)).width, Math.max(5, size * 0.06));
        }
        offset += line.length + 1;
      }
      ctx.fillStyle = ink; spaced(0);

      // meta: when it was last opened, and where it sits in the list
      ctx.font = '400 44px Anton'; spaced(0.4); ctx.fillText(s.meta[0], 36, 572);
      ctx.font = '800 12px Unbounded'; spaced(1.2); ctx.globalAlpha = 0.85; ctx.fillText(s.meta[1].toUpperCase(), 36, 596); ctx.globalAlpha = 1;
      ctx.textAlign = 'right';
      if (s.now) {
        ctx.font = '800 12px Unbounded'; spaced(1.2);
        var tw = ctx.measureText('ON NOW').width + 20;
        roundRect(424 - tw, 566, tw, 26, 13); ctx.fillStyle = ink; ctx.fill();
        ctx.fillStyle = c[0]; ctx.fillText('ON NOW', 414, 584); ctx.fillStyle = ink;
      } else {
        ctx.font = '400 44px Anton'; spaced(0.4); ctx.fillText(s.pos, 424, 572);
        ctx.font = '800 12px Unbounded'; spaced(1.2); ctx.globalAlpha = 0.85; ctx.fillText('OF ' + s.total, 424, 596); ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left'; spaced(0);
      return true;
    }

    var paint = window.D5_STYLE === 'bauhaus' ? paintBauhaus : paintClassic;

    // ---------- texture cache: posters are painted lazily near the centre and kept until evicted ----------
    var cache = {}, useClock = 0, MAX_TEX = 18;
    function upload(s) {
      if (!paint(s)) return null;
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paper);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (gl2) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      return t;
    }
    function evict() {
      var keys = Object.keys(cache);
      if (keys.length <= MAX_TEX) return;
      keys.sort(function (a, b) { return cache[a].used - cache[b].used; });
      for (var i = 0; i < keys.length - MAX_TEX; i++) { gl.deleteTexture(cache[keys[i]].tex); delete cache[keys[i]]; }
    }

    // ---------- motion: a spring on the scroll position ----------
    var pos = 0, vel = 0, target = 0, appear = 0, holdSince = 0;
    var STIFF = 150, ZETA = 0.74;   // a touch under critical damping: it settles with a soft overshoot
    var running = false, hidden = false, paused = false, last = 0, t0 = performance.now();
    var demo = /[?&]demo=1/.test(location.search);
    var freeze = /[?&]freeze=([-\d.]+),([-\d.]+)/.exec(location.search);   // ?freeze=pos,vel: hold a mid-motion frame
    if (freeze) { pos = +freeze[1]; vel = +freeze[2]; target = Math.round(pos); appear = 1; }

    function kick() { if (!running && !hidden && !paused) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
    function frame(now) {
      if (hidden || paused) { running = false; return; }
      var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      if (!freeze) {
        var c = 2 * ZETA * Math.sqrt(STIFF), n = Math.ceil(dt / (1 / 240)), h = dt / Math.max(1, n);
        for (var i = 0; i < n; i++) { var acc = STIFF * (target - pos) - c * vel; vel += acc * h; pos += vel * h; }
        if (appear < 1) appear = Math.min(1, appear + dt * 2.4);
      }
      var busy = draw(now) || appear < 1 || freeze;
      var settled = Math.abs(target - pos) < 0.0008 && Math.abs(vel) < 0.003;
      if (settled && !freeze) { pos = target; vel = 0; }
      if (demo && settled) { target += Math.random() < 0.7 ? 1 : 3; }
      if (!settled || busy || demo) requestAnimationFrame(frame);
      else { draw(now); running = false; }
    }

    function draw(now) {
      var l = list();
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!l.length) return false;
      var t = (now - t0) / 1000, v = vel / 9, sv = v / (1 + Math.abs(v)) * 1.6;   // soft-clamped velocity for the shaders
      sv = Math.max(-1, Math.min(1, sv));
      gl.uniform1f(U.uVel, sv); gl.uniform1f(U.uTime, t);
      var ease = 1 - Math.pow(1 - appear, 3);
      gl.uniform1f(U.uAppear, ease);
      centreChanged(Math.round(pos));

      var base = Math.round(pos), order = [], k;
      for (k = -4; k <= 4; k++) order.push(base + k);
      order.sort(function (a, b) { return Math.abs(b - pos) - Math.abs(a - pos); });   // far ones first

      var painted = 0, pending = false;
      var jobs = order.map(function (slot) {
        var s = spec(slot), e = cache[s.id];
        if (!e && painted < (Math.abs(vel) > 3 ? 2 : 3)) {
          var tex = upload(s); painted++;
          if (tex) { e = cache[s.id] = { tex: tex, used: 0 }; }
        }
        if (!e) pending = true; else e.used = ++useClock;
        return { slot: slot, s: s, e: e };
      });
      evict();

      for (var pass = 1; pass >= 0; pass--) {   // reflections first, then the posters
        gl.uniform1f(U.uMirror, pass);
        for (var i = 0; i < jobs.length; i++) {
          var j = jobs[i], kk = j.slot - pos, ak = Math.abs(kk);
          if (ak > 4.4) continue;
          gl.uniform1f(U.uK, kk);
          gl.uniform1f(U.uShade, Math.min(0.82, ak * 0.2));
          gl.uniform1f(U.uAlpha, (1 - smooth(3.2, 4.3, ak)) * ease);
          if (j.e) { gl.uniform1f(U.uHasTex, 1); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, j.e.tex); }
          else { var cc = rgb(j.s.c[0]); gl.uniform1f(U.uHasTex, 0); gl.uniform3f(U.uColor, cc[0] / 255, cc[1] / 255, cc[2] / 255); }
          gl.drawElements(gl.TRIANGLES, COUNT, gl.UNSIGNED_SHORT, 0);
        }
      }
      return pending;
    }
    function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

    document.addEventListener('visibilitychange', function () { hidden = document.hidden; if (!hidden) kick(); });
    if (/[?&]sheet=(\d+)/.test(location.search)) {   // debug: paint 16 posters flat in a grid, to review the layouts
      var from = +/[?&]sheet=(\d+)/.exec(location.search)[1];
      var sheet = document.createElement('canvas'); sheet.width = 1920; sheet.height = 1080;
      sheet.setAttribute('style', 'position:absolute;left:0;top:0;z-index:100;background:#000');
      $('stage').appendChild(sheet);
      var sx = sheet.getContext('2d'), done = {};
      (function tryPaint() {
        var l = list(), left = 0;
        if (fontsReady && l.length) for (var i = 0; i < 24; i++) {
          if (done[i]) continue;
          if (paint(spec(from + i))) { sx.drawImage(paper, 8 + (i % 8) * 239, 12 + Math.floor(i / 8) * 354, 229, 318); done[i] = 1; } else left++;
        } else left = 1;
        if (left) setTimeout(tryPaint, 300);
      })();
    }
    if (/[?&]debug=1/.test(location.search)) setInterval(function () { document.title = JSON.stringify({ keys: Object.keys(cache), pos: pos, target: target, running: running, logos: Object.keys(logos).map(function (k) { return k + ':' + logos[k].complete + ':' + logos[k].naturalWidth; }) }); }, 1000);

    return {
      gl: true,
      ready: function () {
        var f = document.fonts;
        if (!f || !f.load) { fontsReady = true; kick(); return; }
        Promise.all([f.load('400 120px Anton'), f.load('800 34px Unbounded'), f.load('400 16px Inter')]).then(function () { fontsReady = true; R.rebuild(); }, function () { fontsReady = true; R.rebuild(); });
      },
      rebuild: function () {
        if (!fontsReady) return;
        warm();
        if (!freeze) { pos = 0; vel = 0; target = 0; appear = 0; }
        lastCentre = null; kick();
      },
      changed: function () {   // something a poster shows changed (logo loaded, opened time, state): repaint on demand
        kick();
      },
      relist: function () {   // the list itself changed (search): posters drop away and the new set swings in on the spring
        if (!fontsReady) return;
        if (!freeze) { target = 0; pos = 1.5; vel = -4; appear = Math.min(appear, 0.2); }
        lastCentre = null; kick();
      },
      goTo: function (i) { var n = list().length; if (!n) return; var d = i - mod(target, n); if (d > n / 2) d -= n; if (d < -n / 2) d += n; target += d; kick(); },
      step: function (d, repeat) {
        var now = performance.now();
        if (!repeat) holdSince = now;
        var held = repeat ? now - holdSince : 0;
        var lead = held > 1400 ? 6 : held > 600 ? 3 : 1.6;   // holding the key lets the target run further ahead: it speeds up
        target += d;
        if (Math.abs(target - pos) > lead) target = Math.round(pos + d * lead);
        kick();
      },
      centre: function () { return target; },
      recentre: function () { var n = list().length; if (!n) return; var m = mod(target, n); if (m) target += m > n / 2 ? n - m : -m; kick(); },
      paused: function (on) { paused = on; if (!on) kick(); },
      slotAt: function (x) { return target + Math.round((x - 960) / 430); }
    };
  }

  // =====================================================================================================
  // CSS 3D fallback renderer (the original ribbon)
  // =====================================================================================================
  function makeCSS() {
    var gl = $('gl'); gl.parentNode.removeChild(gl);
    var scene = document.createElement('div'); scene.id = 'scene';
    scene.innerHTML = '<div id="ring"></div>';
    $('floor').parentNode.insertBefore(scene, $('chips'));
    var RD = 1400, STEP = 19, POPC = 140, RANGE = 4, center = 0, cards = {};

    function svgGlyph(name) {
      var g = GLYPH[name], h = '<svg viewBox="0 0 24 24">';
      g.circles.forEach(function (c) { h += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"/>'; });
      g.rects.forEach(function (r) { h += '<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="' + r[4] + '"/>'; });
      g.paths.forEach(function (p) { h += '<path d="' + p + '"/>'; });
      return h + '</svg>';
    }
    function caption(word) { var s = ''; for (var i = 0; i < 14; i++) s += esc(word) + '&nbsp;&nbsp;&nbsp;&nbsp;'; return s; }
    function html(s) {
      var rg = ringsFor(s.seed), c = s.c;
      var logo = s.logo ? '<div class="logo"><img src="' + s.logo + '" alt=""></div>'
        : s.glyph ? '<div class="logo glyph">' + svgGlyph(s.glyph) + '</div>' : '<div class="logo mono">' + esc(s.mono) + '</div>';
      return '<div class="bg" style="background:linear-gradient(160deg,' + c[0] + ' 0%,' + c[0] + ' 45%,' + c[1] + ' 100%)"></div>' +
        '<svg class="arcs" viewBox="0 0 460 640">' +
        '<circle cx="' + rg.cx1 + '" cy="' + rg.cy1 + '" r="' + rg.r1 + '" fill="none" stroke="' + c[2] + '" stroke-width="46" opacity=".95"/>' +
        '<circle cx="' + rg.cx1 + '" cy="' + rg.cy1 + '" r="' + (rg.r1 - 70) + '" fill="none" stroke="' + c[2] + '" stroke-width="10" opacity=".7"/>' +
        '<circle cx="' + rg.cx2 + '" cy="' + rg.cy2 + '" r="190" fill="none" stroke="' + s.ink + '" stroke-width="3" opacity=".35"/>' +
        '<circle cx="' + rg.cx2 + '" cy="' + rg.cy2 + '" r="150" fill="' + c[2] + '" opacity=".18"/></svg>' +
        '<div class="cap t">' + caption(s.top) + '</div><div class="cap b">' + caption(s.bottom) + '</div>' +
        '<div class="mark">tv<br>fest<small>' + new Date().getFullYear() + '</small></div>' + logo +
        '<div class="name"><span>' + esc(s.name) + '</span></div>' +
        '<div class="meta"><div><b>' + s.meta[0] + '</b><small>' + s.meta[1] + '</small></div>' +
        '<div class="r">' + (s.now ? '<span class="live" style="background:' + s.ink + ';color:' + c[0] + '">On now</span>' : '<b>' + s.pos + '</b><small>of ' + s.total + '</small>') + '</div></div>' +
        '<div class="shade"></div>';
    }
    function fitName(el) {
      var box = el.querySelector('.name'), span = box.firstChild, size = 120;
      while (size > 44 && (span.offsetHeight > box.clientHeight || span.scrollWidth > box.clientWidth)) { size -= 8; box.style.fontSize = size + 'px'; }
    }
    function place(el, k) {
      var a = Math.abs(k);
      el.style.transform = 'rotateY(' + (k * STEP) + 'deg) translateZ(' + (RD + (k === 0 ? POPC : 0)) + 'px)';
      el.style.opacity = a >= RANGE ? 0 : 1;
      el.style.zIndex = 10 - a;
      el.querySelector('.shade').style.opacity = [0, 0.18, 0.38, 0.6, 0.8][Math.min(a, 4)];
      el.className = 'card' + (k === 0 ? ' center' : '');
    }
    function layout(dir) {
      if (!list().length) return;
      var want = {}, k, slot, el;
      for (k = -RANGE; k <= RANGE; k++) want[center + k] = k;
      for (slot in cards) {
        if (want.hasOwnProperty(slot)) continue;
        el = cards[slot];
        if (!el._dying) {
          place(el, +slot - center < 0 ? -RANGE - 1 : RANGE + 1);
          el._dying = setTimeout((function (sl, e) { return function () { if (e.parentNode) e.parentNode.removeChild(e); delete cards[sl]; }; })(slot, el), 650);
        }
      }
      for (slot in want) {
        k = want[slot]; el = cards[slot];
        if (el && el._dying) { clearTimeout(el._dying); el._dying = null; }
        if (!el) {
          var s = spec(+slot);
          el = document.createElement('div'); el.innerHTML = html(s); el.style.color = s.ink; el.setAttribute('data-slot', slot);
          cards[slot] = el;
          place(el, k + (dir || (k < 0 ? -1 : 1))); el.className += ' instant';
          $('ring').appendChild(el); fitName(el); el.offsetWidth;
        }
        place(el, k);
      }
      centreChanged(center);
    }
    function refreshAll() {
      for (var sl in cards) {
        var el = cards[sl]; if (el._dying) continue;
        var keep = el.style.transform; el.innerHTML = html(spec(+sl)); el.style.transform = keep; fitName(el); place(el, +sl - center);
      }
    }
    return {
      gl: false,
      ready: function () { R.rebuild(); },
      rebuild: function () {
        for (var s in cards) { var e = cards[s]; if (e._dying) clearTimeout(e._dying); if (e.parentNode) e.parentNode.removeChild(e); }
        cards = {}; center = 0; lastCentre = null; layout(0);
      },
      changed: refreshAll,
      relist: function () { R.rebuild(); },
      goTo: function (i) { center = i; layout(0); },
      step: function (d) { center += d; layout(d); },
      centre: function () { return center; },
      recentre: function () { var n = list().length || 1; if (mod(center, n)) { center = 0; layout(-1); } },
      paused: function () {},
      slotAt: null
    };
  }

  var R = (!/[?&]css=1/.test(location.search) && makeGL()) || makeCSS();

  // =====================================================================================================
  // Search: an on-screen keyboard for the D-pad, fuzzy matching, and a ribbon that re-forms around the matches
  // =====================================================================================================
  var KB = {
    abc: [['A', 'B', 'C', 'D', 'E', 'F', 'G'], ['H', 'I', 'J', 'K', 'L', 'M', 'N'], ['O', 'P', 'Q', 'R', 'S', 'T', 'U'],
      ['V', 'W', 'X', 'Y', 'Z', { k: '123', fn: 'mode' }, { k: '⌫', fn: 'del' }], [{ k: 'Space', fn: 'space', span: 4 }, { k: 'Clear', fn: 'clear', span: 3 }]],
    num: [['1', '2', '3', '4', '5', '6', '7'], ['8', '9', '0', '&', '+', '-', '.'], ["'", '!', '?', ':', '#', '@', '/'],
      ['(', ')', ',', '"', '*', { k: 'ABC', fn: 'mode' }, { k: '⌫', fn: 'del' }], [{ k: 'Space', fn: 'space', span: 4 }, { k: 'Clear', fn: 'clear', span: 3 }]]
  };
  var PITCH_X = 86, PITCH_Y = 78, keys = [];

  function dispName(n) { return nice(n).replace(/\s+/g, ' '); }
  function fold(ch) { return (ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch).toLowerCase().charAt(0); }
  function norm(str) {   // lower case, no accents, punctuation as single spaces; map[i] = index in the original
    var out = '', map = [], gap = true;
    for (var i = 0; i < str.length; i++) {
      var ch = fold(str.charAt(i));
      if (/[a-z0-9]/.test(ch) || (ch && ch.toUpperCase() !== ch.toLowerCase())) { out += ch; map.push(i); gap = false; }
      else if (!gap) { out += ' '; map.push(i); gap = true; }
    }
    if (out.slice(-1) === ' ') { out = out.slice(0, -1); map.pop(); }
    return { s: out, map: map };
  }
  // prefix > start of a word > anywhere > letters in order > somewhere in the full store name
  function score(name, q) {
    var n = norm(dispName(name)), t = n.s, L = q.length, at = -1, sc = 0, pos = [], i;
    if (t.indexOf(q) === 0) { at = 0; sc = 1000 - t.length; }
    else {
      for (i = 1; i < t.length; i++) if (t.charAt(i - 1) === ' ' && t.substr(i, L) === q) { at = i; sc = 800 - i; break; }
      if (at < 0 && (at = t.indexOf(q)) >= 0) sc = 600 - at;
    }
    if (at >= 0) { for (i = at; i < at + L; i++) if (t.charAt(i) !== ' ') pos.push(n.map[i]); return { sc: sc, hits: pos }; }
    var qs = q.replace(/ /g, ''), j = 0, first = -1, last = -1;
    for (i = 0; i < t.length && j < qs.length; i++) if (t.charAt(i) === qs.charAt(j)) { if (first < 0) first = i; last = i; pos.push(n.map[i]); j++; }
    if (j === qs.length) return { sc: Math.max(160, 400 - (last - first - qs.length) * 8 - first), hits: pos };
    if (norm(String(name)).s.indexOf(q) >= 0) return { sc: 150, hits: [] };
    return null;
  }
  function match(q) {
    var qn = norm(q).s, out = [];
    if (!qn) return out;
    apps.forEach(function (n) { var m = score(n, qn); if (m) out.push({ name: n, sc: m.sc, hits: m.hits }); });
    out.sort(function (a, b) { return b.sc - a.sc || a.name.length - b.name.length; });
    return out;
  }

  function setQuery(q) { search.grew = q.length > search.q.length; search.q = q; runSearch(false); }
  function runSearch(force) {
    var before = list().join('|');
    search.qn = norm(search.q).s;
    var m = search.qn ? match(search.q) : [];
    search.matches = m.map(function (x) { return x.name; });
    search.hits = {}; m.forEach(function (x) { search.hits[x.name] = x.hits; });
    search.suggest = null;
    if (search.qn) {
      search.results = search.matches.slice(0, 4);
      for (var k = search.q.length - 1; !m.length && k > 0 && !search.suggest; k--) { var mm = match(search.q.slice(0, k)); if (mm.length) search.suggest = mm[0].name; }
      if (search.suggest) search.results = [search.suggest];
    } else {
      var rec = apps.filter(function (n) { return opened[clean(n)]; }).sort(function (a, b) { return opened[clean(b)] - opened[clean(a)]; });
      search.recent = rec.length > 0;
      search.results = (rec.length ? rec : apps).slice(0, 4);
    }
    if (search.res >= search.results.length) search.res = Math.max(0, search.results.length - 1);
    if (!search.results.length && search.sub === 'res') search.sub = 'kb';
    renderQuery(); renderResults();
    lastCentre = null;
    if (force || before !== list().join('|')) R.relist();   // a different set: re-form the ribbon
    else R.changed();                                                                    // same set: just repaint the highlights
  }

  function renderQuery() {
    var t = $('qtext'), q = search.q, html = '';
    if (!q) html = '<span class="ph">Type an app</span>';
    else for (var i = 0; i < q.length; i++) html += '<span class="' + (i === q.length - 1 && search.grew ? 'ch' : '') + '">' + (q.charAt(i) === ' ' ? '&nbsp;' : esc(q.charAt(i))) + '</span>';
    t.innerHTML = html;
    var size = 100, box = $('qbox'), caret = box.querySelector('.caret');
    box.style.fontSize = size + 'px';
    while (size > 44 && t.scrollWidth > 540) { size -= 8; box.style.fontSize = size + 'px'; }
    caret.style.height = Math.round(size * 0.82) + 'px';
    $('qcount').innerHTML = search.qn ? '<b>' + search.matches.length + '</b> of ' + apps.length : apps.length + ' apps';
    $('res-label').textContent = search.qn ? (search.matches.length ? 'Top results' : 'No matches') : (search.recent ? 'Recent' : 'Suggested');
  }
  function hlName(name, hits) {
    var d = dispName(name), set = {}, out = '';
    (hits || []).forEach(function (h) { set[h] = 1; });
    for (var i = 0; i < d.length; i++) out += set[i] ? '<span class="hl">' + esc(d.charAt(i)) + '</span>' : esc(d.charAt(i));
    return out;
  }
  function renderResults() {
    var html = '';
    if (search.qn && !search.matches.length) {
      html = '<div class="empty"><b>Nothing for “' + esc(search.q.trim()) + '”</b>' +
        (search.suggest ? 'Closest app below. Back removes the last letter.' : 'Try the first letters of a word, like “ne” for Netflix.') + '</div>';
    }
    search.results.forEach(function (n, i) {
      var key = clean(n).toLowerCase(), c = colours(key);
      var ic = icons[key] ? '<img src="icons/' + icons[key] + '.png" alt="">' : esc(initials(n));
      html += '<div class="rrow" data-res="' + i + '" style="animation-delay:' + (i * 45) + 'ms">' +
        '<span class="ic" style="background:' + c[0] + ';color:' + (light(c[0]) ? '#0b0b0b' : '#fff') + '">' + ic + '</span>' +
        '<span class="nm">' + (search.suggest ? 'Try ' : '') + hlName(n, search.hits[n]) + '</span><span class="go">Open</span></div>';
    });
    $('res').innerHTML = html;
    drawFocus();
  }

  function buildKeys() {
    var kb = $('kb'), old = kb.querySelectorAll('.key');
    for (var i = 0; i < old.length; i++) kb.removeChild(old[i]);
    keys = KB[search.digits ? 'num' : 'abc'].map(function (row, r) {
      var c = 0;
      return row.map(function (k) {
        var o = typeof k === 'string' ? { label: k, val: k } : { label: k.k, fn: k.fn };
        o.span = (typeof k === 'object' && k.span) || 1; o.c0 = c; o.r = r; c += o.span;
        var el = document.createElement('div');
        el.className = 'key' + (o.fn ? ' fn' + (o.fn === 'del' ? ' del' : '') : '');
        el.textContent = o.label;
        el.style.width = (o.span * PITCH_X - 8) + 'px';
        el.style.left = (o.c0 * PITCH_X) + 'px'; el.style.top = (r * PITCH_Y) + 'px';
        el._key = o; o.el = el; kb.appendChild(el);
        return o;
      });
    });
  }
  function curKey() { var row = keys[search.row]; return row[Math.min(search.col, row.length - 1)]; }
  function drawFocus() {
    if (!keys.length) return;
    var k = curKey(), f = $('kfocus'), inKb = search.sub === 'kb';
    for (var r = 0; r < keys.length; r++) for (var c = 0; c < keys[r].length; c++) keys[r][c].el.classList.toggle('on', inKb && keys[r][c] === k);
    f.style.transform = 'translate(' + (k.c0 * PITCH_X) + 'px,' + (k.r * PITCH_Y) + 'px)';   // one highlight that glides between keys
    f.style.width = (k.span * PITCH_X - 8) + 'px';
    f.classList.toggle('off', !inKb);
    var rows = $('res').querySelectorAll('.rrow');
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('on', !inKb && i === search.res);
  }
  function toRow(r) {   // land on the key under the remembered column
    search.row = r;
    var row = keys[r];
    search.col = 0;
    for (var i = 0; i < row.length; i++) if (row[i].c0 <= search.anchor && search.anchor < row[i].c0 + row[i].span) search.col = i;
  }
  function moveKB(dx, dy) {
    var row = keys[search.row];
    if (dx) { search.col = mod(row.indexOf(curKey()) + dx, row.length); search.anchor = row[search.col].c0; }   // wraps at the ends
    else {
      var r = search.row + dy;
      if (r >= keys.length) {
        if (search.results.length) { search.sub = 'res'; search.res = 0; focusResult(); drawFocus(); return; }
        r = 0;
      }
      if (r < 0) r = keys.length - 1;
      toRow(r);
    }
    drawFocus();
  }
  var holdStart = 0, cleared = false;
  function pressKey(repeat) {
    var k = curKey();
    if (repeat) {   // holding OK on delete clears the whole query
      if (k.fn === 'del' && !cleared && performance.now() - holdStart > 450) { cleared = true; setQuery(''); }
      return;
    }
    holdStart = performance.now(); cleared = false;
    if (k.fn === 'del') setQuery(search.q.slice(0, -1));
    else if (k.fn === 'clear') setQuery('');
    else if (k.fn === 'space') { if (search.q && search.q.slice(-1) !== ' ') setQuery(search.q + ' '); }
    else if (k.fn === 'mode') { search.digits = !search.digits; buildKeys(); toRow(search.row); search.col = Math.min(search.col, keys[search.row].length - 1); }
    else if (search.q.length < 24) setQuery(search.q + k.val.toLowerCase());
    drawFocus();
    var key = curKey(), f = $('kfocus');
    key.el.classList.add('press'); setTimeout(function () { key.el.classList.remove('press'); }, 130);
    f.classList.remove('press'); void f.offsetWidth; f.classList.add('press');
  }
  function focusResult() {
    var n = search.results[search.res]; if (!n) return;
    var i = list().indexOf(n); if (i >= 0) R.goTo(i);   // the ribbon turns to the result you're on
  }
  function openSearch() {
    if (!apps.length) return;
    if (mode !== 'apps') { mode = 'apps'; $('chip-mode').textContent = 'Inputs'; }
    search.open = true; search.sub = 'kb'; search.res = 0; search.anchor = 0;
    if (!keys.length) buildKeys();
    toRow(0);
    document.body.classList.add('searching'); zone = 'search';
    window.LAUNCHER_BACK_IN_USE = true;   // Back edits the query here; designs.js can skip its double-Back picker while this is set
    runSearch(true);
  }
  function closeSearch() {
    search.open = false; search.q = ''; search.qn = ''; search.matches = []; search.hits = {};
    document.body.classList.remove('searching');
    window.LAUNCHER_BACK_IN_USE = false;
    lastCentre = null; R.relist(); setZone('ring');
  }
  function openFromSearch(name) {
    if (!name) return;
    openApp(name);
    setTimeout(closeSearch, 700);
  }
  function searchKey(k, e) {
    if (k === 'Escape') { if (search.q) setQuery(search.q.slice(0, -1)); else closeSearch(); return; }   // Back deletes first, then closes
    if (search.sub === 'kb') {
      if (k === 'ArrowLeft') moveKB(-1, 0);
      else if (k === 'ArrowRight') moveKB(1, 0);
      else if (k === 'ArrowUp') moveKB(0, -1);
      else if (k === 'ArrowDown') moveKB(0, 1);
      else if (k === 'Enter') pressKey(e.repeat);
      return;
    }
    if (k === 'ArrowUp') { if (search.res > 0) { search.res--; focusResult(); } else { search.sub = 'kb'; toRow(keys.length - 1); } drawFocus(); }
    else if (k === 'ArrowDown') { if (search.res < search.results.length - 1) { search.res++; focusResult(); drawFocus(); } }
    else if (k === 'Enter' && !e.repeat) openFromSearch(search.results[search.res]);
  }

  // =====================================================================================================
  // Volume: polled live, shown big when it changes; remote volume keys answer instantly
  // =====================================================================================================
  var vol = { v: null, muted: false, hold: 0 }, hudTimer;
  (function () { var cap = ''; for (var i = 0; i < 10; i++) cap += 'Volume&nbsp;&nbsp;&nbsp;&nbsp;'; $('vh-cap').innerHTML = cap; })();
  function paintVolume(hud) {
    var v = vol.v == null ? 0 : vol.v, i, html = '';
    $('vol').textContent = vol.muted ? 'Muted' : (vol.v == null ? '--' : v);
    for (i = 0; i < 10; i++) html += '<i style="height:' + (6 + i * 1.6) + 'px" class="' + (i < Math.round(v / 10) && !vol.muted ? 'on' : '') + '"></i>';
    $('bars').innerHTML = html;
    if (!hud) return;
    var n = $('vh-n');
    n.textContent = vol.muted ? 'MUTE' : v;
    n.style.fontSize = vol.muted ? '150px' : '230px';
    html = '';
    for (i = 0; i < 20; i++) html += '<i style="height:' + (10 + i) + 'px" class="' + (i < Math.round(v / 5) && !vol.muted ? 'on' : '') + '"></i>';
    $('vh-bar').innerHTML = html;
    $('vhud').className = 'on' + (vol.muted ? ' muted' : '');
    n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump');
    setTimeout(function () { n.classList.remove('bump'); }, 140);
    clearTimeout(hudTimer);
    hudTimer = setTimeout(function () { $('vhud').className = vol.muted ? 'muted' : ''; }, 2000);
  }
  function loadVolume() {
    api('/api/volume', function (r) {
      if (!r || !r.ok || !r.data || r.data.volume_value == null) return;
      if (Date.now() < vol.hold) return;   // our own change is still landing; don't flicker back
      var v = +r.data.volume_value, m = !!r.data.muted, first = vol.v == null;
      if (v === vol.v && m === vol.muted) return;
      vol.v = v; vol.muted = m;
      paintVolume(!first);
    });
  }
  function volumeKey(kind) {
    if (vol.v == null) vol.v = 0;
    if (kind === 'mute') { vol.muted = !vol.muted; api('/api/key?k=KEY_MUTE'); }
    else { vol.v = Math.max(0, Math.min(100, vol.v + (kind === 'up' ? 2 : -2))); vol.muted = false; api('/api/set_volume?v=' + vol.v); }
    vol.hold = Date.now() + 2500;
    paintVolume(true);
  }
  function volKind(e) {
    var k = e.keyCode || e.which;
    if (k === 447 || e.key === 'AudioVolumeUp' || e.key === 'VolumeUp') return 'up';
    if (k === 448 || e.key === 'AudioVolumeDown' || e.key === 'VolumeDown') return 'down';
    if (k === 449 || e.key === 'AudioVolumeMute' || e.key === 'VolumeMute') return 'mute';
    return null;
  }

  // ---------- input ----------
  function keyName(e) {
    var alias = { Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown', Select: 'Enter', OK: 'Enter', Accept: 'Enter', GoBack: 'Escape', Back: 'Escape', BrowserBack: 'Escape' };
    if (alias[e.key]) return alias[e.key];
    switch (e.keyCode || e.which) {
      case 37: return 'ArrowLeft'; case 38: return 'ArrowUp'; case 39: return 'ArrowRight'; case 40: return 'ArrowDown';
      case 13: case 23: case 66: return 'Enter';
      case 27: case 8: case 461: case 10009: return 'Escape';
    }
    return e.key;
  }
  window.addEventListener('keydown', function (e) {
    var vk = volKind(e);
    if (vk) { e.preventDefault(); volumeKey(vk); return; }
    var k = keyName(e);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'].indexOf(k) < 0) return;
    e.preventDefault();
    if (ambient) { setAmbient(false); return; }
    if (zone === 'search') { searchKey(k, e); return; }
    if (zone === 'ring') {
      if (k === 'ArrowLeft') R.step(-1, e.repeat);
      else if (k === 'ArrowRight') R.step(1, e.repeat);
      else if (k === 'ArrowDown') { chip = 0; setZone('chips'); }
      else if (k === 'ArrowUp') openSearch();
      else if (k === 'Enter' && !e.repeat) openSlot(R.centre());
      else if (k === 'Escape') { if (mode !== 'apps') setMode('apps'); else R.recentre(); }
    } else {
      var n = $('chips').children.length;
      if (k === 'ArrowLeft') { chip = Math.max(0, chip - 1); setZone('chips'); }
      else if (k === 'ArrowRight') { chip = Math.min(n - 1, chip + 1); setZone('chips'); }
      else if (k === 'ArrowUp' || k === 'Escape') setZone('ring');
      else if (k === 'Enter' && !e.repeat) chipAction();
    }
  }, true);
  // mouse, for previewing on a computer
  document.addEventListener('click', function (e) {
    if (ambient) { setAmbient(false); return; }
    if (zone === 'search') {
      var t = e.target;
      while (t && t !== document && !(t.classList && (t.classList.contains('key') || t.classList.contains('rrow')))) t = t.parentNode;
      if (!t || t === document) return;
      if (t.classList.contains('key')) { var o = t._key; search.sub = 'kb'; search.row = o.r; search.col = keys[o.r].indexOf(o); search.anchor = o.c0; pressKey(false); }
      else { search.sub = 'res'; search.res = +t.getAttribute('data-res'); drawFocus(); openFromSearch(search.results[search.res]); }
      return;
    }
    var el = e.target;
    while (el && el !== document && !(el.getAttribute && (el.getAttribute('data-slot') !== null || el.getAttribute('data-act') || el.id === 'gl'))) el = el.parentNode;
    if (!el || el === document) return;
    if (el.getAttribute('data-act')) {
      var cs = $('chips').children;
      for (var i = 0; i < cs.length; i++) if (cs[i] === el) chip = i;
      setZone('chips'); chipAction(); return;
    }
    setZone('ring');
    var slot;
    if (el.id === 'gl') { var b = el.getBoundingClientRect(); slot = R.slotAt((e.clientX - b.left) * 1920 / b.width); }
    else slot = +el.getAttribute('data-slot');
    var d = slot - R.centre();
    if (d === 0) openSlot(slot); else R.step(d);
  });

  // ---------- data ----------
  function mergeApps() {
    if (!homeApps || !allApps) return;
    var seen = {}, out = [];
    homeApps.concat(allApps).forEach(function (n) { var k = clean(n).toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(n); } });
    apps = out;
    if (mode === 'apps') R.ready();
  }
  function loadState() {
    api('/api/state', function (r) {
      if (!r || !r.ok) return;
      var was = tvState && tvState.name; tvState = r.data;
      if (mode === 'apps' && was !== (tvState && tvState.name)) R.changed();
    });
  }
  function loadInputs() {
    api('/api/sources', function (r) {
      if (!r || !r.ok || !r.data) return;
      var first = !inputs.length;
      inputs = r.data.filter(function (s) { return /^(tv|hdmi|av)/i.test(s.id); });
      if (mode === 'inputs') { if (first) R.ready(); else R.changed(); }
    });
  }
  function tick() {
    var d = new Date();
    $('time').textContent = hm(d); $('am-time').textContent = hm(d);
    $('date').textContent = DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    $('am-date').textContent = DAYS[d.getDay()] + ' · ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080), st = $('stage');
    st.style.transform = 'scale(' + s + ')';
    st.style.left = ((window.innerWidth - 1920 * s) / 2) + 'px';
    st.style.top = ((window.innerHeight - 1080 * s) / 2) + 'px';
  }

  if (/[?&]mode=inputs/.test(location.search)) { mode = 'inputs'; $('chip-mode').textContent = 'Apps'; }
  window.addEventListener('resize', fit);
  fit(); tick(); setInterval(tick, 1000); setZone('ring');
  api('icons/index.json', function (r) {
    if (r) icons = r;
    api('/api/apps', function (r) { homeApps = (r && r.ok && r.data) || []; mergeApps(); });
    api('/api/apps?all=1', function (r) { allApps = (r && r.ok && r.data) || []; mergeApps(); });
  });
  loadState(); setInterval(loadState, 5000);
  loadVolume(); setInterval(loadVolume, 1500);
  loadInputs(); setInterval(loadInputs, 30000);
  document.body.focus();
})();
