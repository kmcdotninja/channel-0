/* Design 6 ("Space") card painter.
   Every card is a small editorial poster in the language of the Joyse / Flowerpot reference: blush and charcoal grounds,
   flat retro colours (cobalt, teal, mustard, orange, bubblegum), a fat friendly display face (Bagel Fat One), heavy caps
   (Archivo Black), tiny bold small-print captions (Archivo), and the reference's devices: rainbow bands, donut rings,
   crosses, stacked pills, scalloped blobs, arches on a pedestal, split numerals, vertical words, stamped circles.
   Cards paint into a 2D canvas so the same pixels can later be uploaded as WebGL textures (like the Carousel). */
(function () {
  'use strict';
  var W = 640, H = 400;
  var C = {
    blush: '#efe2e0', cream: '#f6ede7', ink: '#2b2a2a', ink2: '#232222',
    cobalt: '#2c6bb5', teal: '#1e8c6c', mustard: '#f0a32e', orange: '#ea6232', pink: '#f2a2ad', pinkDeep: '#d9808c'
  };
  var RAINBOW = [C.cobalt, C.teal, C.mustard, C.orange, C.pink];
  var DISPLAY = '"Bagel Fat One"', CAPS = '"Archivo Black"', SMALL = 'Archivo';

  // Per-app identity: ground colour, accent and template. Unknown apps hash into the palette.
  var KNOWN = {
    'youtube':      { bg: C.orange,  acc: C.pink,    ink: C.cream, t: 'donut' },
    'netflix':      { bg: C.ink,     acc: C.pink,    ink: C.cream, t: 'stripes' },
    'prime video':  { bg: C.cobalt,  acc: C.mustard, ink: C.cream, t: 'stamp' },
    'spotify':      { bg: C.cream,   acc: C.teal,    ink: C.ink,   t: 'vertical' },
    'dstv now':     { bg: C.blush,   acc: C.cobalt,  ink: C.ink,   t: 'arch' },
    'deezer':       { bg: C.pink,    acc: C.cobalt,  ink: C.ink,   t: 'donut' },
    'nba':          { bg: C.ink,     acc: C.orange,  ink: C.cream, t: 'list' },
    'ufc':          { bg: C.mustard, acc: C.ink,     ink: C.ink,   t: 'stamp' },
    'dazn':         { bg: C.ink,     acc: C.mustard, ink: C.cream, t: 'stripes' },
    'red bull tv':  { bg: C.cobalt,  acc: C.orange,  ink: C.cream, t: 'donut' },
    'mubi':         { bg: C.cream,   acc: C.ink,     ink: C.ink,   t: 'vertical' },
    'startimes on': { bg: C.blush,   acc: C.orange,  ink: C.ink,   t: 'arch' },
    'uefa.tv':      { bg: C.cobalt,  acc: C.pink,    ink: C.cream, t: 'stamp' },
    'plex':         { bg: C.mustard, acc: C.ink,     ink: C.ink,   t: 'donut' },
    'tv browser':   { bg: C.teal,    acc: C.mustard, ink: C.cream, t: 'stamp' },
    'stremio lite': { bg: C.ink,     acc: C.pink,    ink: C.cream, t: 'list' }
  };
  var GROUNDS = [
    { bg: C.cobalt, acc: C.pink, ink: C.cream }, { bg: C.teal, acc: C.mustard, ink: C.cream },
    { bg: C.mustard, acc: C.cobalt, ink: C.ink }, { bg: C.orange, acc: C.cobalt, ink: C.cream },
    { bg: C.pink, acc: C.teal, ink: C.ink }, { bg: C.ink, acc: C.mustard, ink: C.cream },
    { bg: C.cream, acc: C.orange, ink: C.ink }, { bg: C.blush, acc: C.teal, ink: C.ink }
  ];
  var TEMPLATES = ['stripes', 'arch', 'donut', 'list', 'vertical', 'stamp'];

  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function clean(n) { return String(n).replace(/[▶︎]/g, '').replace(/\s*[:.]\s*$/, '').replace(/\s*:\s.*$/, '').trim(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function identity(item) {
    var key = clean(item.name).toLowerCase();
    var k = KNOWN[key];
    if (k) return k;
    var h = hash(key), g = GROUNDS[h % GROUNDS.length];
    return { bg: g.bg, acc: g.acc, ink: g.ink, t: TEMPLATES[(h >>> 4) % TEMPLATES.length] };
  }

  // ---------- assets ----------
  var icons = {}, imgs = {}, grainCanvas = null;
  // The launcher's server only queues a handful of connections, so images load a few at a time, not all at once.
  var active = 0, queue = [];
  function slot(fn) { return new Promise(function (res) { queue.push(function () { active++; fn().then(function () { active--; res(); next(); }); }); next(); }); }
  function next() { while (active < 3 && queue.length) queue.shift()(); }
  function loadImg(src) {
    if (imgs[src]) return imgs[src].p;
    var im = new Image(), rec = { im: im, ok: false };
    rec.p = slot(function () { return new Promise(function (res) {
      im.onload = function () { rec.ok = true; res(); };
      var tries = 0;
      im.onerror = function () { if (++tries < 3) setTimeout(function () { im.src = src + (src.indexOf('?') < 0 ? '?' : '&') + 'r=' + tries; }, 300); else res(); };
      im.src = src;
    }); });
    imgs[src] = rec;
    return rec.p;
  }
  function makeGrain() {
    var g = document.createElement('canvas'); g.width = g.height = 256;
    var x = g.getContext('2d'), d = x.createImageData(256, 256);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = Math.random() < 0.5 ? 0 : 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = Math.random() < 0.55 ? Math.floor(Math.random() * 40) : 0;
    }
    x.putImageData(d, 0, 0);
    return g;
  }
  function ready(iconIndex, extra) {
    icons = iconIndex || {};
    grainCanvas = makeGrain();
    // Fonts are loaded as FontFace objects with retries (a CSS @font-face that fails once never retries), and added to
    // the document so the page's own text uses them too.
    function face(family, file, weight, tries) {
      if (!window.FontFace) return Promise.resolve();
      return new FontFace(family, 'url(fonts/' + file + ')', { weight: weight }).load().then(function (f) { document.fonts.add(f); }, function () {
        if (!tries) return;
        return new Promise(function (r) { setTimeout(r, 500); }).then(function () { return face(family, file, weight, tries - 1); });
      });
    }
    var faces = Promise.all([face('Bagel Fat One', 'BagelFatOne.woff2', '400', 4), face('Archivo Black', 'ArchivoBlack.woff2', '400', 4),
      face('Archivo', 'Archivo-700.woff2', '700', 4), face('Archivo', 'Archivo-800.woff2', '800', 4)]);
    function font(spec, tries) {
      return document.fonts.load(spec).then(function (f) {
        if (f.length || !tries) return f;
        return new Promise(function (r) { setTimeout(r, 400); }).then(function () { return font(spec, tries - 1); });
      }, function () {
        if (!tries) return [];
        return new Promise(function (r) { setTimeout(r, 400); }).then(function () { return font(spec, tries - 1); });
      });
    }
    var waits = [faces.then(function () { return Promise.all([font('80px ' + DISPLAY, 2), font('80px ' + CAPS, 2), font('700 14px ' + SMALL, 2), font('800 14px ' + SMALL, 2)]); })];
    for (var k in icons) waits.push(loadImg('icons/' + icons[k] + '.png'));
    (extra || []).forEach(function (s) { waits.push(loadImg(s)); });
    // one failed font or image must never block the whole field
    return Promise.all(waits.map(function (w) { return Promise.resolve(w).catch(function () {}); }));
  }

  // ---------- drawing helpers ----------
  function rr(x, cx, y, w, h, r) {
    x.beginPath();
    x.moveTo(cx + r, y); x.arcTo(cx + w, y, cx + w, y + h, r); x.arcTo(cx + w, y + h, cx, y + h, r);
    x.arcTo(cx, y + h, cx, y, r); x.arcTo(cx, y, cx + w, y, r); x.closePath();
  }
  function grid(x, color, step) {
    x.save(); x.strokeStyle = color; x.lineWidth = 1; x.beginPath();
    for (var gx = step; gx < W; gx += step) { x.moveTo(gx + .5, 0); x.lineTo(gx + .5, H); }
    for (var gy = step; gy < H; gy += step) { x.moveTo(0, gy + .5); x.lineTo(W, gy + .5); }
    x.stroke(); x.restore();
  }
  function grain(x, amount) {
    if (!grainCanvas) return;
    x.save(); x.globalAlpha = amount; x.globalCompositeOperation = 'overlay';
    for (var gx = 0; gx < W; gx += 256) for (var gy = 0; gy < H; gy += 256) x.drawImage(grainCanvas, gx, gy);
    x.restore();
  }
  function ring(x, cx, cy, r, w, color) {
    x.save(); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.arc(cx, cy, r - w, 0, Math.PI * 2, true);
    x.fillStyle = color; x.fill('evenodd'); x.restore();
  }
  function cross(x, cx, cy, s, rot, color) {
    var a = s * 0.36;
    x.save(); x.translate(cx, cy); x.rotate(rot); x.fillStyle = color;
    rr(x, -a / 2, -s / 2, a, s, a * 0.28); x.fill();
    rr(x, -s / 2, -a / 2, s, a, a * 0.28); x.fill();
    x.restore();
  }
  function pills(x, px, py, n, w, h, gap, step, color) {
    x.save(); x.fillStyle = color;
    for (var i = 0; i < n; i++) { rr(x, px + i * step, py + i * (h + gap), w, h, h / 2); x.fill(); }
    x.restore();
  }
  function scallop(x, cx, cy, r, bumps, rot, color) {
    x.save(); x.translate(cx, cy); x.rotate(rot); x.fillStyle = color; x.beginPath();
    for (var i = 0; i <= 120; i++) {
      var t = i / 120 * Math.PI * 2, rad = r + Math.sin(t * bumps) * r * 0.09;
      var px = Math.cos(t) * rad, py = Math.sin(t) * rad;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath(); x.fill(); x.restore();
  }
  function wavyRect(x, rx, ry, w, h, rot, color) {   // the blue wavy-edged slab from the reference
    x.save(); x.translate(rx + w / 2, ry + h / 2); x.rotate(rot); x.fillStyle = color; x.beginPath();
    var waves = 6, amp = 9;
    x.moveTo(-w / 2, -h / 2);
    for (var i = 0; i <= 60; i++) { var t = i / 60; x.lineTo(-w / 2 + t * w, -h / 2 + Math.sin(t * Math.PI * waves) * amp); }
    for (var j = 0; j <= 60; j++) { var u = j / 60; x.lineTo(w / 2 - u * w, h / 2 + Math.sin(u * Math.PI * waves) * amp); }
    x.closePath(); x.fill(); x.restore();
  }
  function fitFont(x, text, family, maxW, maxSize, minSize) {
    var s = maxSize;
    x.font = s + 'px ' + family;
    while (s > (minSize || 10) && x.measureText(text).width > maxW) { s -= 2; x.font = s + 'px ' + family; }
    return s;
  }
  function small(x, text, px, py, color, align, size) {
    x.save(); x.font = '800 ' + (size || 12.5) + 'px ' + SMALL; x.fillStyle = color; x.textAlign = align || 'left';
    x.letterSpacing = '0.06em'; x.fillText(String(text).toUpperCase(), px, py); x.restore();
  }
  function smallLines(x, lines, px, py, color, size, lh) {
    x.save(); x.font = '700 ' + (size || 12) + 'px ' + SMALL; x.fillStyle = color; x.letterSpacing = '0.01em';
    for (var i = 0; i < lines.length; i++) x.fillText(lines[i], px, py + i * (lh || 15));
    x.restore();
  }
  function pill(x, text, px, py, color, filled) {
    x.save(); x.font = '800 12px ' + SMALL; x.letterSpacing = '0.06em';
    var w = x.measureText(text.toUpperCase()).width + 26;
    rr(x, px, py, w, 26, 13);
    if (filled) { x.fillStyle = color; x.fill(); } else { x.strokeStyle = color; x.lineWidth = 1.6; x.stroke(); }
    x.fillStyle = filled ? C.cream : color; x.textBaseline = 'middle'; x.fillText(text.toUpperCase(), px + 13, py + 13.5);
    x.restore();
    return w;
  }
  function stamp(x, text, cx, cy, r, color, size) {
    x.save(); x.font = '800 ' + (size || 11) + 'px ' + SMALL; x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
    var chars = String(text).toUpperCase().split(''), total = 0, ws = [];
    for (var i = 0; i < chars.length; i++) { ws.push(x.measureText(chars[i]).width + 1.2); total += ws[i]; }
    var circ = Math.PI * 2 * r, scale = circ / total, ang = -Math.PI / 2;
    for (var j = 0; j < chars.length; j++) {
      var a = ang + (ws[j] * scale / 2) / r;
      x.save(); x.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.rotate(a + Math.PI / 2); x.fillText(chars[j], 0, 0); x.restore();
      ang += ws[j] * scale / r;
    }
    x.restore();
  }
  function tvGlyph(x, cx, cy, s, color) {
    x.save(); x.fillStyle = color;
    rr(x, cx - s / 2, cy - s * 0.36, s, s * 0.62, s * 0.1); x.fill();
    rr(x, cx - s * 0.2, cy + s * 0.32, s * 0.4, s * 0.08, s * 0.04); x.fill();
    x.restore();
  }
  function youtubeMark(x, px, py, s) {
    x.save(); x.translate(px, py); x.scale(s / 120, s / 120);
    rr(x, 0, 0, 120, 120, 27); x.fillStyle = '#fff'; x.fill();
    x.fillStyle = '#ff0033';
    x.fill(new Path2D('M98.3 42.6a10.6 10.6 0 0 0-7.5-7.5C84.2 33.3 60 33.3 60 33.3s-24.2 0-30.8 1.8a10.6 10.6 0 0 0-7.5 7.5C20 49.2 20 60 20 60s0 10.8 1.7 17.4a10.6 10.6 0 0 0 7.5 7.5c6.6 1.8 30.8 1.8 30.8 1.8s24.2 0 30.8-1.8a10.6 10.6 0 0 0 7.5-7.5C100 70.8 100 60 100 60s0-10.8-1.7-17.4z'));
    x.fillStyle = '#fff'; x.fill(new Path2D('M52 71.4 72.8 60 52 48.6z'));
    x.restore();
  }
  function netflixMark(x, px, py, s) {
    x.save(); x.translate(px, py); x.scale(s / 120, s / 120);
    rr(x, 0, 0, 120, 120, 27); x.fillStyle = '#000'; x.fill();
    x.fillStyle = '#b1060f'; x.fill(new Path2D('M41 22h15v76c-5.2-.5-10.2-.3-15 .5z')); x.fill(new Path2D('M64 22h15v76.5c-4.8-.8-9.8-1-15-.5z'));
    x.fillStyle = '#e50914'; x.fill(new Path2D('M41 22h15l23 76.5c-5-.9-10-1.2-15-.8z'));
    x.restore();
  }
  // Settings, All apps and Photos get drawn marks in the same flat language: a cream tile with charcoal shapes.
  function utilGlyph(x, key, px, py, s) {
    x.save(); rr(x, px, py, s, s, s * 0.23); x.fillStyle = C.cream; x.fill();
    x.fillStyle = C.ink; x.strokeStyle = C.ink; x.lineCap = 'round';
    var u = s / 10;
    if (key === 'settings') {
      x.lineWidth = u * 0.9;
      for (var i = 0; i < 3; i++) {
        var yy = py + u * (3 + i * 2), kx = px + u * [6.4, 3.6, 5.6][i];
        x.beginPath(); x.moveTo(px + u * 2.2, yy); x.lineTo(px + u * 7.8, yy); x.stroke();
        x.beginPath(); x.arc(kx, yy, u * 1.05, 0, Math.PI * 2); x.fillStyle = [C.orange, C.cobalt, C.teal][i]; x.fill();
      }
    } else if (key === 'all apps') {
      var cols = [C.orange, C.cobalt, C.teal, C.pink];
      for (var j = 0; j < 4; j++) { x.fillStyle = cols[j]; rr(x, px + u * (2 + (j % 2) * 3.2), py + u * (2 + Math.floor(j / 2) * 3.2), u * 2.8, u * 2.8, u * 0.7); x.fill(); }
    } else {
      x.beginPath(); x.moveTo(px + u * 1.8, py + u * 7.6); x.lineTo(px + u * 4.2, py + u * 4); x.lineTo(px + u * 5.8, py + u * 6.2); x.lineTo(px + u * 6.8, py + u * 5); x.lineTo(px + u * 8.2, py + u * 7.6); x.closePath(); x.fill();
      x.beginPath(); x.arc(px + u * 7, py + u * 3, u * 0.9, 0, Math.PI * 2); x.fillStyle = C.mustard; x.fill();
    }
    x.restore();
  }

  // The app's mark in a rounded square (or the glyph for inputs and utilities).
  function logo(x, item, px, py, s, id) {
    var key = clean(item.name).toLowerCase();
    if (item.kind === 'input') { tvGlyph(x, px + s / 2, py + s / 2, s * 0.86, id.ink); return; }
    if (item.kind === 'util') { utilGlyph(x, key, px, py, s); return; }
    if (key === 'youtube') return youtubeMark(x, px, py, s);
    if (key === 'netflix') return netflixMark(x, px, py, s);
    var rec = icons[key] && imgs['icons/' + icons[key] + '.png'];
    x.save(); rr(x, px, py, s, s, s * 0.23); x.clip();
    if (rec && rec.ok) x.drawImage(rec.im, px, py, s, s);
    else {
      x.fillStyle = id.ink === C.ink ? C.ink : C.cream; x.fillRect(px, py, s, s);
      var w = clean(item.name).split(/\s+/), mono = (w[0].charAt(0) + (w[1] ? w[1].charAt(0) : '')).toUpperCase();
      x.fillStyle = id.ink === C.ink ? C.cream : C.ink; x.font = Math.round(s * 0.46) + 'px ' + DISPLAY;
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(mono, px + s / 2, py + s / 2 + s * 0.03);
    }
    x.restore();
  }

  function caption(item) {
    if (item.kind === 'input') return item.live ? 'Live signal' : 'Nothing connected';
    if (item.kind === 'util') return item.sub || '';
    if (item.onNow) return 'On now';
    if (!item.opened) return 'Never opened';
    var d = new Date(item.opened), now = new Date(), day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (item.opened >= day0) return 'Opened today';
    if (item.opened >= day0 - 864e5) return 'Opened yesterday';
    return 'Opened ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  }
  function position(item) { return pad(item.index) + ' / ' + pad(item.total); }
  function shortWord(item) {
    if (item.kind === 'input') return item.live ? 'live' : 'off';
    if (item.onNow) return 'on';
    if (!item.opened) return 'new';
    return Date.now() - item.opened < 864e5 ? 'again' : 'open';
  }

  // ---------- templates ----------
  var T = {};

  // Rainbow bands both sides, a dark panel, one giant letter and a pink badge with a word (the "a / alt" spread).
  T.stripes = function (x, item, id) {
    x.fillStyle = id.bg; x.fillRect(0, 0, W, H);
    grid(x, 'rgba(255,255,255,.045)', 20);
    for (var i = 0; i < 5; i++) {
      x.fillStyle = RAINBOW[i];
      x.fillRect(0, 74 + i * 50, 112, 50);
      x.fillRect(W - 112, 74 + i * 50, 112, 50);
    }
    x.fillStyle = C.ink2; rr(x, 124, 34, W - 248, 318, 22); x.fill();
    var name = clean(item.name), letter = name.charAt(0).toLowerCase();
    x.save(); x.font = '300px ' + DISPLAY; x.fillStyle = id.ink === C.ink ? C.blush : C.cream; x.textAlign = 'center';
    var m = x.measureText(letter), top = m.actualBoundingBoxAscent, bot = m.actualBoundingBoxDescent;
    x.fillText(letter, 300, 196 + (top - bot) / 2); x.restore();
    x.beginPath(); x.arc(410, 118, 64, 0, Math.PI * 2); x.fillStyle = id.acc; x.fill();
    x.save(); x.font = fitFont(x, shortWord(item), DISPLAY, 100, 44) + 'px ' + DISPLAY; x.fillStyle = C.ink; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.translate(410, 120); x.rotate(-0.12); x.fillText(shortWord(item), 0, 0); x.restore();
    logo(x, item, 146, 56, 46, id);
    small(x, position(item), 26, 382, C.cream);
    small(x, name, W / 2, 382, C.cream, 'center');
    small(x, caption(item), W - 26, 382, C.cream, 'right');
    grain(x, 0.5);
  };

  // FLOWERPOT spread: heavy caps title, the logo inside a cobalt arch on a two-tone pedestal, split numerals, vertical words.
  T.arch = function (x, item, id) {
    x.fillStyle = id.bg; x.fillRect(0, 0, W, H);
    var name = clean(item.name).toUpperCase(), abbr = name.replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'TV';
    // vertical words cut by the edges
    x.save(); x.font = '92px ' + CAPS; x.fillStyle = C.ink; x.textAlign = 'center';
    x.translate(48, 200); x.rotate(-Math.PI / 2); x.fillText(abbr, 0, 0); x.restore();
    x.save(); x.font = '92px ' + CAPS; x.fillStyle = C.ink; x.textAlign = 'center';
    x.translate(W - 48, 200); x.rotate(Math.PI / 2); x.fillText(abbr, 0, 0); x.restore();
    // title
    var ts = fitFont(x, name, CAPS, 360, 62, 24);
    x.fillStyle = C.ink; x.textAlign = 'center'; x.fillText(name, W / 2, 30 + ts * 0.82); x.textAlign = 'left';
    small(x, 'N°' + pad(item.index), W / 2 + x.measureText(name).width / 2 + 6, 30 + ts * 0.82, C.ink, 'left', 10);
    // arch
    var ax = W / 2, aw = 132, atop = 128, abot = 318;
    x.fillStyle = id.acc === C.ink ? C.cobalt : id.acc;
    x.beginPath(); x.moveTo(ax - aw / 2, abot); x.lineTo(ax - aw / 2, atop + aw / 2); x.arc(ax, atop + aw / 2, aw / 2, Math.PI, 0); x.lineTo(ax + aw / 2, abot); x.closePath(); x.fill();
    x.fillStyle = 'rgba(0,0,0,.18)';
    x.beginPath(); x.moveTo(ax - aw / 2 + 14, abot); x.lineTo(ax - aw / 2 + 14, atop + aw / 2); x.arc(ax, atop + aw / 2, aw / 2 - 14, Math.PI, 0); x.lineTo(ax + aw / 2 - 14, abot); x.closePath(); x.fill();
    if (item.photo && imgs[item.photo] && imgs[item.photo].ok) {
      x.save(); x.beginPath(); x.moveTo(ax - aw / 2 + 14, abot); x.lineTo(ax - aw / 2 + 14, atop + aw / 2); x.arc(ax, atop + aw / 2, aw / 2 - 14, Math.PI, 0); x.lineTo(ax + aw / 2 - 14, abot); x.closePath(); x.clip();
      var im = imgs[item.photo].im; x.drawImage(im, ax - 160, atop, 320, 180); x.restore();
    } else logo(x, item, ax - 38, 196, 76, id);
    // pedestal: two-tone disc on a fluted pink base
    x.fillStyle = C.pink; x.fillRect(ax - 66, 330, 132, 70);
    x.fillStyle = C.pinkDeep; for (var f = 0; f < 11; f++) x.fillRect(ax - 62 + f * 12, 336, 4, 64);
    x.save(); x.beginPath(); x.ellipse(ax, 326, 98, 15, 0, 0, Math.PI * 2); x.clip();
    x.fillStyle = C.teal; x.fillRect(ax - 98, 300, 98, 40); x.fillStyle = C.orange; x.fillRect(ax, 300, 98, 40); x.restore();
    // split numerals: position on the left, total on the right
    x.font = '112px ' + CAPS; x.fillStyle = C.ink;
    x.textAlign = 'right'; x.fillText(pad(item.index), ax - 112, 392);
    x.textAlign = 'left'; x.fillText(pad(item.total), ax + 112, 392); x.textAlign = 'left';
    smallLines(x, [caption(item), item.kind === 'app' ? 'App · VIDAA' : 'Living room', item.live ? 'Live now' : 'Standing by'], 92, 150, C.ink, 11.5, 15);
    pill(x, item.kind === 'input' ? 'Switch' : 'Open', 456, 150, C.ink, false);
    stamp(x, clean(item.name) + ' · launcher · ', 128, 252, 30, C.ink, 9);
    grain(x, 0.45);
  };

  // A big donut off the corner with the logo in its hole, a cross, and the name set fat.
  T.donut = function (x, item, id) {
    x.fillStyle = id.bg; x.fillRect(0, 0, W, H);
    if (id.bg === C.ink) grid(x, 'rgba(255,255,255,.045)', 20);
    var ringColor = id.acc, holeX = 466, holeY = 150;
    ring(x, holeX, holeY, 168, 74, ringColor);
    logo(x, item, holeX - 50, holeY - 50, 100, id);
    cross(x, 84, 84, 92, 0.2, id.bg === C.teal ? C.mustard : C.teal);
    pills(x, 196, 40, 3, 92, 16, 7, 14, id.bg === C.orange ? C.mustard : C.orange);
    var name = clean(item.name), s = fitFont(x, name, DISPLAY, 440, 112, 40);
    x.fillStyle = id.ink; x.fillText(name, 30, 352);
    small(x, position(item), 32, 384, id.ink);
    small(x, caption(item), W - 30, 384, id.ink, 'right');
    grain(x, 0.45);
  };

  // The numbered name list on charcoal, scattered shapes around it (the closing spread of the reference).
  T.list = function (x, item, id) {
    x.fillStyle = C.ink; x.fillRect(0, 0, W, H);
    grid(x, 'rgba(255,255,255,.05)', 20);
    pills(x, -30, 26, 4, 120, 18, 6, 12, C.orange);
    cross(x, 590, 330, 110, 0.35, C.teal);
    ring(x, 40, 380, 70, 30, C.pink);
    wavyRect(x, 520, -10, 130, 80, -0.3, C.cobalt);
    x.beginPath(); x.arc(560, 400, 46, Math.PI, 0); x.fillStyle = C.mustard; x.fill();
    var lines = item.lines || [clean(item.name), caption(item), 'Card ' + position(item)];
    var n = lines.length, size = n > 4 ? 34 : 46, lh = size * 1.02, y0 = H / 2 - (n - 1) * lh / 2 + size * 0.36;
    for (var i = 0; i < n; i++) {
      var t = lines[i];
      x.font = size + 'px ' + DISPLAY;
      var w = Math.min(x.measureText(t).width, 420), lx = W / 2 - w / 2;
      fitFont(x, t, DISPLAY, 420, size, 16);
      x.fillStyle = i === 0 || !item.lines ? (i === 0 ? C.cream : C.blush) : C.cream;
      x.fillText(t, lx, y0 + i * lh);
      small(x, pad(i + 1), lx - 10, y0 + i * lh - size * 0.62, C.cream, 'right', 9);
      x.fillStyle = C.cream; x.fillRect(lx - 30, y0 + i * lh - size * 0.48, 14, 1.5);
    }
    if (!item.lines) logo(x, item, 30, 128, 54, { ink: C.cream });
    grain(x, 0.5);
  };

  // A giant vertical name down the left, the logo on a coloured disc, spec text and an outlined pill.
  T.vertical = function (x, item, id) {
    x.fillStyle = id.bg; x.fillRect(0, 0, W, H);
    var name = clean(item.name);
    x.save(); x.translate(176, H); x.rotate(-Math.PI / 2);
    var s = fitFont(x, name, DISPLAY, 380, 170, 60); x.fillStyle = C.ink; x.fillText(name, 12, 0); x.restore();
    x.beginPath(); x.arc(W, H, 150, Math.PI, Math.PI * 1.5); x.lineTo(W, H); x.fillStyle = C.pink; x.fill();
    x.beginPath(); x.arc(470, 132, 86, 0, Math.PI * 2); x.fillStyle = id.acc; x.fill();
    logo(x, item, 432, 94, 76, id);
    scallop(x, 600, 40, 44, 9, 0.2, C.mustard);
    smallLines(x, [name + ' on your TV.', caption(item) + '.', 'Card ' + position(item) + ' in the field.', 'Press OK to open.'], 236, 250, C.ink, 12.5, 16);
    pill(x, 'Open', 236, 322, C.ink, false);
    small(x, position(item), W - 26, 30, C.ink, 'right');
    grain(x, 0.45);
  };

  // A stamped circle carrying the logo, the name fat on the right, stacked pills under it.
  T.stamp = function (x, item, id) {
    x.fillStyle = id.bg; x.fillRect(0, 0, W, H);
    if (id.bg === C.ink) grid(x, 'rgba(255,255,255,.045)', 20);
    var cx = 168, cy = 200, txt = id.ink;
    x.beginPath(); x.arc(cx, cy, 92, 0, Math.PI * 2); x.fillStyle = id.acc; x.fill();
    stamp(x, (item.kind === 'input' ? (item.live ? 'live signal · live signal · ' : 'nothing connected · ') : caption(item) + ' · ' + clean(item.name) + ' · '), cx, cy, 118, txt, 12);
    logo(x, item, cx - 44, cy - 44, 88, { ink: id.acc === C.ink ? C.cream : C.ink });
    var name = clean(item.name), s = fitFont(x, name, DISPLAY, 300, 92, 34);
    x.fillStyle = txt; x.fillText(name, 316, 190);
    pills(x, 316, 222, 3, 150, 22, 8, 22, id.acc === id.bg ? C.pink : id.acc);
    small(x, position(item), 316, 330 + 26, txt);
    small(x, item.kind === 'input' ? 'Input' : 'App', W - 28, 356, txt, 'right');
    cross(x, 590, 54, 54, 0.4, id.acc === C.ink ? C.cream : C.ink);
    grain(x, 0.45);
  };

  function paint(canvas, item, scale) {
    scale = scale || 1;
    canvas.width = W * scale; canvas.height = H * scale;
    var x = canvas.getContext('2d');
    x.setTransform(scale, 0, 0, scale, 0, 0);
    var id = identity(item), t = item.template || id.t;
    x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    (T[t] || T.donut)(x, item, id);
    return canvas;
  }

  window.D6Cards = { W: W, H: H, colors: C, ready: ready, paint: paint, identity: identity, templates: TEMPLATES };
})();
