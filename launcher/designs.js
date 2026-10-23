/* Design switcher shared by every launcher design.
   Number keys 1-5 on the remote (or the red/green/yellow/blue keys for 2-5) jump to that design; the server remembers
   the choice so "/" and the home watcher open it from then on. Each design page loads this before its own script. */
(function () {
  'use strict';
  var DESIGNS = [
    { file: 'future.html', name: 'Dashboard' },
    { file: 'd2-console.html', name: 'Console' },
    { file: 'd3-widgets.html', name: 'Widgets' },
    { file: 'd4-acid.html', name: 'Acid' },
    { file: 'd5-carousel.html', name: 'Carousel 1' },
    { file: 'd5b-carousel.html', name: 'Carousel 2' },
    { file: 'd6-space.html', name: 'Space' },
    { file: 'd7-nothing.html', name: 'Nothing' }
  ];
  var COLOR_KEYS = { 403: 2, 404: 3, 405: 4, 406: 5 };   // red, green, yellow, blue
  window.LAUNCHER_DESIGNS = DESIGNS;

  function go(n) {
    var d = DESIGNS[n - 1];
    if (!d || location.pathname.slice(1) === d.file) return;
    var x = new XMLHttpRequest();
    x.open('GET', '/api/design?set=' + n, true);
    x.timeout = 3000;
    x.onloadend = function () { location.href = '/' + d.file + '?switched=' + n; };
    x.send();
  }

  // ---------- picker: Back twice quickly opens it (for remotes without number keys) ----------
  var BACK = { 8: 1, 27: 1, 461: 1, 10009: 1 };
  var lastBack = 0, picker = null, pick = 0;
  function current() {
    for (var i = 0; i < DESIGNS.length; i++) if (location.pathname.slice(1) === DESIGNS[i].file) return i;
    return 0;
  }
  function drawPicker() {
    var rows = picker.querySelectorAll('.dp-row');
    for (var i = 0; i < rows.length; i++) {
      var on = i === pick;
      rows[i].style.background = on ? '#f2f4f5' : 'transparent';
      rows[i].style.color = on ? '#0b0c0d' : '#f2f4f5';
    }
  }
  function openPicker() {
    pick = current();
    picker = document.createElement('div');
    picker.setAttribute('style', 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99998;background:rgba(0,0,0,.72);' +
      'display:flex;align-items:center;justify-content:center;font:400 30px/1.2 Inter,-apple-system,Arial,sans-serif;letter-spacing:-.02em');
    var html = '<div style="width:640px;padding:28px;border-radius:32px;background:#16181a;border:1px solid #26282a">' +
      '<div style="color:#8e959a;font-size:24px;margin:4px 12px 18px">Choose a design</div>';
    for (var i = 0; i < DESIGNS.length; i++) {
      html += '<div class="dp-row" style="display:flex;justify-content:space-between;padding:20px 24px;border-radius:18px;margin-bottom:6px">' +
        '<span>' + DESIGNS[i].name + '</span><span style="opacity:.55">' + (i === current() ? 'Current' : i + 1) + '</span></div>';
    }
    html += '<div style="height:1px;background:#26282a;margin:10px 12px 12px"></div>' +
      '<div class="dp-row" style="display:flex;justify-content:space-between;padding:20px 24px;border-radius:18px;margin-bottom:6px">' +
      '<span>Voice search on your phone</span><span style="opacity:.55">QR</span></div>';
    html += '<div style="color:#8e959a;font-size:22px;margin:16px 12px 2px">Up and down to choose · OK to switch · Back to close</div></div>';
    picker.innerHTML = html;
    document.body.appendChild(picker);
    drawPicker();
  }
  // The phone's voice page needs HTTPS, so it lives on the server's second port; show its address as a QR code.
  function showVoiceQR() {
    picker.qr = true;
    var box = picker.firstChild;
    box.innerHTML = '<div style="color:#8e959a;font-size:24px;margin:4px 12px 18px">Voice search on your phone</div>' +
      '<div style="display:flex;align-items:center;padding:0 12px 8px">' +
      '<div id="dp-qr" style="width:260px;height:260px;flex:none;border-radius:20px;background:#fff;padding:14px"></div>' +
      '<div style="margin-left:28px;font-size:24px;line-height:1.35">Scan with your phone camera, then hold the mic and speak.' +
      '<div id="dp-url" style="color:#8e959a;font-size:20px;margin-top:14px;word-break:break-all"></div>' +
      '<div style="color:#8e959a;font-size:18px;margin-top:14px">First time: your phone will warn about the certificate. Choose “Advanced → Proceed” (Android) or “Show details → visit this website” (iPhone).</div></div></div>' +
      '<div style="color:#8e959a;font-size:22px;margin:18px 12px 2px">OK or Back to return</div>';
    box.style.width = '880px';
    get('/api/voice/url', function (r) {
      var url = r && r.ok ? r.data : 'https://' + location.hostname + ':' + ((+location.port || 80) + 1) + '/voice.html';
      var el = picker && picker.querySelector('#dp-url'); if (el) el.textContent = url;
      loadQR(function () {
        var q = picker && picker.querySelector('#dp-qr'); if (!q || !window.qrcode) return;
        var code = window.qrcode(0, 'M'); code.addData(url); code.make();
        q.innerHTML = code.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
        var svg = q.querySelector('svg'); if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; }
      });
    });
  }
  function loadQR(done) {
    if (window.qrcode) return done();
    var sc = document.createElement('script'); sc.src = 'vendor/qrcode.min.js'; sc.onload = done; document.head.appendChild(sc);
  }
  function get(path, done) {
    var x = new XMLHttpRequest();
    x.open('GET', path, true); x.timeout = 12000;
    x.onload = function () { var r = null; if (x.status === 200) { try { r = JSON.parse(x.responseText); } catch (e) {} } done(r, x.status); };
    x.onerror = x.ontimeout = function () { done(null, 0); };
    x.send();
  }
  function closePicker() { if (picker && picker.parentNode) picker.parentNode.removeChild(picker); picker = null; }

  window.addEventListener('keydown', function (e) {
    var k = e.keyCode || e.which, key = e.key;
    if (picker) {
      e.preventDefault(); e.stopImmediatePropagation();
      var rowsN = DESIGNS.length + 1;   // the designs, then "Voice search on your phone"
      if (picker.qr) { if (BACK[k] || k === 13 || key === 'Enter') { closePicker(); openPicker(); pick = DESIGNS.length; drawPicker(); } return; }
      if (k === 38 || key === 'ArrowUp' || key === 'Up') { pick = (pick + rowsN - 1) % rowsN; drawPicker(); }
      else if (k === 40 || key === 'ArrowDown' || key === 'Down') { pick = (pick + 1) % rowsN; drawPicker(); }
      else if ((k === 13 || key === 'Enter') && pick === DESIGNS.length) showVoiceQR();
      else if (k === 13 || key === 'Enter') { var n = pick + 1; closePicker(); go(n); }
      else if (BACK[k]) closePicker();
      return;
    }
    if (BACK[k] && !window.LAUNCHER_BACK_IN_USE) {   // a page sets this while Back has its own job (e.g. deleting search letters)
      var now = Date.now();
      if (now - lastBack < 700) { lastBack = 0; e.preventDefault(); e.stopImmediatePropagation(); openPicker(); return; }
      lastBack = now;
    }
  }, true);

  window.addEventListener('keydown', function (e) {
    var k = e.keyCode || e.which, n = 0;
    if (k >= 49 && k <= 56) n = k - 48;          // 1-8 on the number row
    else if (k >= 97 && k <= 104) n = k - 96;   // 1-8 on a keypad
    else if (COLOR_KEYS[k]) n = COLOR_KEYS[k];
    if (!n) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    go(n);
  }, true);

  // ---------- voice search: the phone is the microphone ----------
  // voice.html (on the phone, over HTTPS) posts listening / interim / final events to the server; every design shows
  // them in this overlay and acts on the final words: open an app, change volume or input, or offer the closest apps.
  var VOICE_DEMO = (/[?&]voicedemo=(\d)/.exec(location.search) || [])[1];
  var vo = null, voText = null, voState = null, voWave = null, voChoices = [], voPick = 0, voHideAt = 0, voRaf = 0, voLevel = 0;
  var voApps = null, voSources = null;

  function vNorm(s) {
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/[▶︎]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function vClean(n) { return String(n).replace(/[▶︎]/g, '').replace(/\s*:\s.*$/, '').replace(/[\s.:]+$/, '').trim(); }
  // Same ranking as the Carousel search: exact, prefix, word start, substring, then letters in order.
  function vRank(q, name) {
    var n = vNorm(vClean(name)), full = vNorm(name), qs = q.replace(/ /g, ''), ns = n.replace(/ /g, '');
    if (!q) return -1;
    if (n === q || ns === qs) return 0;
    if (n.indexOf(q) === 0 || ns.indexOf(qs) === 0) return 1;
    if ((' ' + n).indexOf(' ' + q) >= 0) return 2;
    if (ns.indexOf(qs) >= 0 || full.indexOf(q) >= 0) return 3;
    var i = 0; for (var j = 0; j < ns.length && i < qs.length; j++) if (ns[j] === qs[i]) i++;
    return i === qs.length && qs.length >= 3 ? 4 : -1;
  }
  function vMatches(q) {
    var out = [];
    (voApps || []).forEach(function (name) { var r = vRank(q, name); if (r >= 0) out.push({ name: name, r: r }); });
    out.sort(function (a, b) { return a.r - b.r || vClean(a.name).length - vClean(b.name).length; });
    return out;
  }

  function vStyle() {
    if (document.getElementById('vo-style')) return;
    var st = document.createElement('style'); st.id = 'vo-style';
    st.textContent =
      '@font-face{font-family:LauncherVoice;src:url(fonts/Inter-Regular.woff2) format("woff2")}' +
      '#vo{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99997;background:rgba(6,6,7,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'font:400 30px/1.2 LauncherVoice,Inter,-apple-system,Arial,sans-serif;letter-spacing:-.02em;color:#f2f2f2;opacity:0;transition:opacity .25s cubic-bezier(.23,1,.32,1)}' +
      '#vo.on{opacity:1}' +
      '#vo .st{display:flex;align-items:center;font:400 24px/1 "Space Mono",ui-monospace,Menlo,monospace;letter-spacing:.32em;text-transform:uppercase;color:#bdbdbd}' +
      '#vo .st i{width:14px;height:14px;border-radius:50%;background:#e5251b;margin-right:18px;animation:voBlink 1s steps(2,start) infinite}' +
      '#vo.done .st i{animation:none;background:#7be0a6}' +
      '#vo canvas{width:1100px;height:240px;margin:40px 0 30px}' +
      '#vo .tx{font-size:72px;line-height:1.1;max-width:1500px;text-align:center;min-height:80px}' +
      '#vo .tx.ghost{color:#5f5f5f}' +
      '#vo .rs{margin-top:22px;font-size:32px;color:#9a9a9a;min-height:40px}' +
      '#vo .ch{display:flex;margin-top:34px}' +
      '#vo .ch div{display:flex;align-items:center;height:96px;padding:0 40px;margin:0 12px;border-radius:999px;background:#1d1d1f;font-size:36px;box-shadow:inset 0 0 0 2px #2b2b2d}' +
      '#vo .ch div.on{background:#f2f2f2;color:#111;box-shadow:none}' +
      '#vo .hn{margin-top:26px;font:400 20px/1 "Space Mono",ui-monospace,Menlo,monospace;letter-spacing:.2em;text-transform:uppercase;color:#6b6b6b}' +
      '@keyframes voBlink{to{visibility:hidden}}';
    document.head.appendChild(st);
  }
  function vOpen() {
    if (vo) return;
    vStyle();
    vo = document.createElement('div'); vo.id = 'vo';
    vo.innerHTML = '<div class="st"><i></i><span>Listening</span></div><canvas width="1100" height="240"></canvas>' +
      '<div class="tx ghost">Speak on your phone…</div><div class="rs"></div><div class="ch"></div><div class="hn"></div>';
    document.body.appendChild(vo);
    voText = vo.querySelector('.tx'); voState = vo.querySelector('.st span'); voWave = vo.querySelector('canvas');
    window.LAUNCHER_BACK_IN_USE = true;
    setTimeout(function () { if (vo) vo.className = 'on'; }, 16);
    vDraw();
  }
  function vClose() {
    if (!vo) return;
    cancelAnimationFrame(voRaf);
    var el = vo; vo = null; voChoices = [];
    el.className = '';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    window.LAUNCHER_BACK_IN_USE = false;
  }
  // A Nothing-style dot field: columns of dots that swell with speech and settle when it stops.
  function vDraw() {
    var g = voWave.getContext('2d'), W = 1100, H = 240, cols = 44, rows = 9, t0 = performance.now();
    function frame(t) {
      if (!vo) return;
      var k = (t - t0) / 1000;
      voLevel *= 0.94;
      g.clearRect(0, 0, W, H);
      for (var c = 0; c < cols; c++) {
        var wave = 0.26 + 0.14 * Math.sin(k * 2.2 + c * 0.38) + 0.07 * Math.sin(k * 5.1 + c * 1.3) + voLevel * (0.45 + 0.4 * Math.sin(k * 7.3 + c * 1.7));
        var lit = Math.max(1, Math.min(rows, Math.round(wave * rows)));
        for (var r = 0; r < rows; r++) {
          var d = Math.abs(r - (rows - 1) / 2), on = d < lit / 2;
          g.fillStyle = on ? (vo.className.indexOf('done') >= 0 ? '#7be0a6' : '#f2f2f2') : '#262626';
          g.beginPath(); g.arc(12 + c * (W - 24) / (cols - 1), 12 + r * (H - 24) / (rows - 1), 8, 0, 6.2832); g.fill();
        }
      }
      voRaf = requestAnimationFrame(frame);
    }
    voRaf = requestAnimationFrame(frame);
  }
  function vSay(text, ghost) { if (voText) { voText.textContent = text; voText.className = 'tx' + (ghost ? ' ghost' : ''); } }
  function vResult(line, hide) {
    if (!vo) vOpen();
    vo.className = 'on done'; voState.textContent = 'Heard';
    vo.querySelector('.rs').textContent = line;
    vo.querySelector('.ch').innerHTML = ''; vo.querySelector('.hn').textContent = '';
    voHideAt = hide ? Date.now() + 1500 : 0;
    if (hide && !VOICE_DEMO) setTimeout(function () { if (voHideAt && Date.now() >= voHideAt) vClose(); }, 1550);
  }
  function vChoices(list, heard) {
    voChoices = list.slice(0, 3).map(function (m) { return m.name; }); voPick = 0;
    vo.className = 'on done'; voState.textContent = 'Did you mean';
    vo.querySelector('.rs').textContent = list.length ? '' : 'No app matches “' + heard + '”';
    vo.querySelector('.hn').textContent = list.length ? 'Left · Right to choose · OK to open · Back to close' : 'Back to close';
    voHideAt = 0;
    vDrawChoices();
  }
  function vDrawChoices() {
    vo.querySelector('.ch').innerHTML = voChoices.map(function (n, i) {
      return '<div class="' + (i === voPick ? 'on' : '') + '">' + vClean(n).replace(/[&<>]/g, '') + '</div>';
    }).join('');
  }

  function vDo(path, line) {
    vResult(line, true);
    if (VOICE_DEMO) return;   // the demo never touches the real TV
    get(path, function (r) { if (!r || !r.ok) vResult('Couldn’t reach the TV', true); });
  }
  function vOpenApp(name) { vDo('/api/launch?name=' + encodeURIComponent(name), 'Opening ' + vClean(name) + '…'); }

  function vInterpret(raw) {
    var t = vNorm(raw);
    vSay('“' + raw.trim() + '”');
    if (!t) return vClose();
    var m;
    if (/^(un ?mute|mute)( (the )?(tv|sound|volume))?$/.test(t)) return vDo('/api/key?k=KEY_MUTE', t.indexOf('un') === 0 ? 'Sound on' : 'Muted');
    if ((m = /\b(?:volume|sound)(?: to| at)? (\d{1,3})\b/.exec(t))) {
      var v = Math.min(100, +m[1]); return vDo('/api/set_volume?v=' + v, 'Volume ' + v);
    }
    var up = /\b(volume|sound|turn it) (up|higher|louder)\b|^louder$/.test(t), down = /\b(volume|sound|turn it) (down|lower|quieter|softer)\b|^(quieter|softer)$/.test(t);
    if (up || down) {
      if (VOICE_DEMO) return vResult('Volume ' + (up ? 'up' : 'down'), true);
      return get('/api/volume', function (r) {
        var cur = r && r.ok && r.data ? +r.data.volume_value || 0 : 0, nv = Math.max(0, Math.min(100, cur + (up ? 4 : -4)));
        vDo('/api/set_volume?v=' + nv, 'Volume ' + nv);
      });
    }
    var words = { one: 1, two: 2, three: 3, four: 4, to: 2, too: 2, for: 4 };
    if ((m = /\bh ?d ?m ?[il] ?(\d|one|two|three|four|to|too|for)\b/.exec(t))) {
      var n = /\d/.test(m[1]) ? m[1] : words[m[1]];
      return vDo('/api/source?id=HDMI' + n, 'Switching to HDMI ' + n);
    }
    if (/^(input |switch to |go to )?(tv|live tv|tv channels|antenna|channels)$/.test(t)) return vDo('/api/source?id=TV', 'Switching to TV');
    if (/^(input |switch to )?(av|a v)$/.test(t)) return vDo('/api/source?id=AVS', 'Switching to AV');
    if (/^(open |go to )?(settings|menu|tv settings)$/.test(t)) return vDo('/api/key?k=KEY_MENU', 'Opening settings');
    if (/^(show |open )?(photos|pictures|ambient|wallpapers?)$/.test(t)) {
      vResult('Photos', true);
      try { window.dispatchEvent(new CustomEvent('launcher:ambient')); } catch (e) {}
      return;
    }
    var q = t.replace(/^(please )?(open|launch|play|start|go to|watch|show me|show|put on)( the)? /, '').replace(/ (app|please)$/, '').trim();
    var run = function () {
      var list = vMatches(q);
      if (list.length && (list[0].r <= 1 || (list[0].r <= 3 && (list.length === 1 || list[1].r > list[0].r)))) return vOpenApp(list[0].name);
      vChoices(list, q);
    };
    if (voApps) run(); else get('/api/apps?all=1', function (r) { voApps = r && r.ok && r.data ? r.data : []; run(); });
  }

  function vEvent(ev) {
    if (ev.state === 'listening') { vOpen(); vo.className = 'on'; voState.textContent = 'Listening'; vo.querySelector('.rs').textContent = ''; vo.querySelector('.ch').innerHTML = ''; vo.querySelector('.hn').textContent = ''; voChoices = []; vSay('Speak on your phone…', true); }
    else if (ev.state === 'interim') { vOpen(); vSay(ev.text); voLevel = 1; }
    else if (ev.state === 'final') { vOpen(); voLevel = 1; vInterpret(ev.text); }
    else if (ev.state === 'idle' && vo && !voChoices.length && !voHideAt) vClose();
  }

  // Keys while the overlay is up: it owns them (Back closes, Left/Right/OK pick a suggestion).
  window.addEventListener('keydown', function (e) {
    if (!vo) return;
    var k = e.keyCode || e.which;
    e.preventDefault(); e.stopImmediatePropagation();
    if (BACK[k]) return vClose();
    if (!voChoices.length) return;
    if (k === 37) { voPick = (voPick + voChoices.length - 1) % voChoices.length; vDrawChoices(); }
    else if (k === 39) { voPick = (voPick + 1) % voChoices.length; vDrawChoices(); }
    else if (k === 13) { var n = voChoices[voPick]; voChoices = []; vOpenApp(n); }
  }, true);

  // Long-poll the server for phone events. Old servers without the endpoint just get retried slowly.
  var voLast = -1;
  function vPoll() {
    get('/api/voice/poll?since=' + voLast + '&wait=' + (voLast < 0 ? 0 : 8), function (r, status) {
      if (!r || !r.ok) return setTimeout(vPoll, status === 404 ? 30000 : 3000);
      var first = voLast < 0;
      voLast = r.last;
      if (!first) (r.events || []).forEach(vEvent);
      setTimeout(vPoll, 50);
    });
  }
  if (VOICE_DEMO) {
    // ?voicedemo=1 listening with live words · 2 final "open netflix" · 3 suggestions for "spot" (never acts on the TV)
    var demo = function () {
      var now = Date.now() / 1000;
      vEvent({ state: 'listening', t: now });
      setTimeout(function () { vEvent({ state: 'interim', text: 'open', t: now }); }, 500);
      setTimeout(function () { vEvent({ state: 'interim', text: VOICE_DEMO === '3' ? 'spot' : 'open net', t: now }); }, 900);
      if (VOICE_DEMO === '2') setTimeout(function () { voApps = voApps || ['YouTube', 'Netflix', 'TV Browser']; vEvent({ state: 'final', text: 'open Netflix', t: now }); }, 1400);
      if (VOICE_DEMO === '3') setTimeout(function () { voApps = ['Spotify : Music & Podcasts', 'SportyTV: Free Football Live', 'Stremio Lite', 'YouTube']; vEvent({ state: 'final', text: 'spt', t: now }); }, 1400);
    };
    if (document.body) demo(); else document.addEventListener('DOMContentLoaded', demo);
  } else {
    setTimeout(vPoll, 1500);
  }

  // A short note after switching, so it's clear what happened and how to switch again.
  var m = /[?&]switched=(\d)/.exec(location.search);
  if (m) {
    var n = +m[1], d = DESIGNS[n - 1];
    if (!d) return;
    var note = document.createElement('div');
    note.textContent = 'Design ' + n + ' of ' + DESIGNS.length + ' · ' + d.name + ' · press Back twice to switch';
    note.setAttribute('style', 'position:fixed;left:50%;top:32px;transform:translateX(-50%);z-index:99999;padding:14px 26px;' +
      'border-radius:18px;background:rgba(20,21,23,.94);color:#f2f4f5;font:400 22px/1.2 Inter,-apple-system,Arial,sans-serif;' +
      'letter-spacing:-.02em;white-space:nowrap;transition:opacity .4s;pointer-events:none');
    var add = function () {
      document.body.appendChild(note);
      setTimeout(function () { note.style.opacity = '0'; }, 3200);
      setTimeout(function () { if (note.parentNode) note.parentNode.removeChild(note); }, 3800);
    };
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  }
})();
