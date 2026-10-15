(function () {
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var WA = '213561703451';

  // phone menu
  var menu = $('#mobile-menu');
  function setMenu(open) { if (!menu) return; menu.hidden = !open; document.body.style.overflow = open ? 'hidden' : ''; }
  $$('[data-open-menu]').forEach(function (b) { b.addEventListener('click', function () { setMenu(true); }); });
  $$('[data-close-menu]').forEach(function (b) { b.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  // product cards pre-select the quote form
  var sel = $('#f-besoin');
  $$('[data-pick]').forEach(function (a) { a.addEventListener('click', function () { if (sel) sel.value = a.getAttribute('data-pick'); }); });

  // quote form -> e-mail to the sales team (commercial@hn-packaging.com)
  //   QUOTE_ENDPOINT: FormSubmit (works on any hosting; the first request sends an activation e-mail to the address)
  //   or 'send.php' on hosting with PHP (file included, sends from your own server).
  var QUOTE_TO = 'commercial@hn-packaging.com';
  var QUOTE_ENDPOINT = 'https://formsubmit.co/ajax/' + QUOTE_TO;
  var form = $('#quote-form'), wrap = $('#quote-form-wrap'), sent = $('#quote-sent'), qerr = $('#quote-error');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var title = form.getAttribute('data-wa-title'), data = {}, lines = [title, ''], name = '', mail = '';
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.id || !el.value) return;
      var lab = form.querySelector('label[for="' + el.id + '"]');
      var key = lab ? lab.textContent.trim() : el.name, val = el.tagName === 'SELECT' ? el.options[el.selectedIndex].text : el.value;
      data[key] = val; lines.push(key + ' : ' + val);
      if (el.name === 'nom') name = el.value; if (el.name === 'email') mail = el.value;
    });
    var hp = form.querySelector('[name="_honey"]');
    if (hp && hp.value) return;   // filled by a robot
    var btn = form.querySelector('[type="submit"]'), btxt = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = form.getAttribute('data-sending'); }
    if (qerr) qerr.hidden = true;
    var payload = Object.assign({ _subject: title + (name ? ' - ' + name : ''), _template: 'table', _captcha: 'false', _honey: '', _language: document.documentElement.lang || 'fr' }, data);
    if (mail) payload._replyto = mail;
    function done() { if (btn) { btn.disabled = false; btn.textContent = btxt; } }
    function fail() {
      done(); if (!qerr) return;
      var text = lines.join('\n');
      qerr.querySelector('p').textContent = form.getAttribute('data-err');
      var ml = document.getElementById('quote-mail'); ml.textContent = form.getAttribute('data-mail');
      ml.href = 'mailto:' + QUOTE_TO + '?subject=' + encodeURIComponent(payload._subject) + '&body=' + encodeURIComponent(text);
      var wl = document.getElementById('quote-wa'); wl.textContent = form.getAttribute('data-wapp');
      wl.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(text);
      qerr.hidden = false;
    }
    fetch(QUOTE_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        var okd = res.ok && !(res.d && (res.d.success === false || res.d.success === 'false'));
        if (!okd) { fail(); return; }
        done(); wrap.hidden = true; sent.hidden = false;
      }, fail);
  });
  var reset = $('#quote-reset');
  if (reset) reset.addEventListener('click', function () { form.reset(); sent.hidden = true; wrap.hidden = false; if (qerr) qerr.hidden = true; });

  // install button (Android / desktop Chrome & Edge)
  var deferred = null, ib = $('#install-app');
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; if (ib) ib.hidden = false; });
  if (ib) ib.addEventListener('click', function () {
    if (!deferred) return; deferred.prompt();
    deferred.userChoice.then(function () { deferred = null; ib.hidden = true; });
  });
  window.addEventListener('appinstalled', function () { if (ib) ib.hidden = true; });

  // 3D bag mockup studio: size + drag-and-place editor
  var pv = document.getElementById('apercu');
  if (pv && window.HN3D) {
    var BES = {"pouch": "sachet", "chips": "sachet", "flat": "sachet", "gusset": "sachet"}, DEF = {"pouch": {"W": 160, "H": 230, "G": 40}, "chips": {"W": 180, "H": 250, "G": 0}, "flat": {"W": 120, "H": 170, "G": 0}, "gusset": {"W": 80, "H": 230, "G": 45}}, LIM = {"W": [30, 600], "H": [30, 800], "G": [10, 200]}, TXA = {"fr": {"tipG": "Gabarit à plat : {T} × {H} mm (dos, soufflet, face, soufflet, dos)", "tipP": "Gabarit à plat : {T} × {H} mm (face {W} mm + dos {W} mm)", "bad": "Valeur entre {a} et {b} mm", "img": "Image", "reading": "Lecture du PDF…", "perr": "Impossible de lire ce PDF. Exportez-le à nouveau depuis Illustrator (PDF standard) ou importez un JPG/PNG.", "pdfAll": "PDF {w} × {h} mm : le sachet s'est adapté automatiquement ({sz}) et le visuel le couvre entièrement.", "pdfFront": "PDF {w} × {h} mm (face seule) : le sachet s'est adapté automatiquement ({sz}). Importez un 2e fichier pour le dos si besoin.", "pdfBig": "PDF {w} × {h} mm : hors des dimensions possibles, le sachet a été réglé au plus proche ({sz}).", "szP": "{W} × {H} mm", "szG": "face {W} mm, soufflet {G} mm, hauteur {H} mm", "pdfBack": "PDF {w} × {h} mm : placé automatiquement sur le dos du sachet.", "szO": ", bande de soudure {O} mm", "fold": "Lignes de pliage détectées : face {W} mm, soufflets {G} mm, dos {B} mm, hauteur {H} mm{S}. Le sachet s'est adapté automatiquement.", "foldS": ", bandes de soudure {O} mm + {R} mm", "foldSw": "Développé de sachet à soufflets reconnu. ", "tipD": "Gabarit à plat : {W} × {T} mm (face {H} + fond {B2} + dos {H}, dos tête-bêche)", "dimB": "Fond (mm)", "dimG": "Soufflet (mm)"}, "en": {"tipG": "Flat template: {T} × {H} mm (back, gusset, front, gusset, back)", "tipP": "Flat template: {T} × {H} mm (front {W} mm + back {W} mm)", "bad": "Value between {a} and {b} mm", "img": "Image", "reading": "Reading the PDF…", "perr": "This PDF could not be read. Export it again from Illustrator (standard PDF) or upload a JPG/PNG.", "pdfAll": "PDF {w} × {h} mm: the bag adapted automatically ({sz}) and the artwork covers it fully.", "pdfFront": "PDF {w} × {h} mm (front only): the bag adapted automatically ({sz}). Upload a 2nd file for the back if needed.", "pdfBig": "PDF {w} × {h} mm: outside the possible sizes, the bag was set to the closest size ({sz}).", "szP": "{W} × {H} mm", "szG": "front {W} mm, gusset {G} mm, height {H} mm", "pdfBack": "PDF {w} × {h} mm: placed automatically on the back of the bag.", "szO": ", seal strip {O} mm", "fold": "Fold lines detected: front {W} mm, gussets {G} mm, back {B} mm, height {H} mm{S}. The bag adapted automatically.", "foldS": ", seal strips {O} mm + {R} mm", "foldSw": "Side-gusset dieline recognised. ", "tipD": "Flat template: {W} × {T} mm (front {H} + base {B2} + back {H}, back upside down)", "dimB": "Base (mm)", "dimG": "Gusset (mm)"}, "ar": {"tipG": "القالب المسطّح: {T} × {H} مم (خلف، جانب، واجهة، جانب، خلف)", "tipP": "القالب المسطّح: {T} × {H} مم (واجهة {W} مم + خلف {W} مم)", "bad": "قيمة بين {a} و {b} مم", "img": "صورة", "reading": "جارٍ قراءة ملف PDF…", "perr": "تعذّرت قراءة ملف PDF هذا. صدّروه مجدداً من Illustrator (PDF عادي) أو حمّلوا صورة JPG/PNG.", "pdfAll": "ملف PDF ‏{w} × {h} مم: تكيّف الكيس تلقائياً ({sz}) ويغطيه التصميم بالكامل.", "pdfFront": "ملف PDF ‏{w} × {h} مم (الواجهة فقط): تكيّف الكيس تلقائياً ({sz}). حمّلوا ملفاً ثانياً للخلف عند الحاجة.", "pdfBig": "ملف PDF ‏{w} × {h} مم: خارج المقاسات الممكنة، تم ضبط الكيس على أقرب مقاس ({sz}).", "szP": "{W} × {H} مم", "szG": "الواجهة {W} مم، الجانب {G} مم، الارتفاع {H} مم", "pdfBack": "ملف PDF ‏{w} × {h} مم: وُضع تلقائياً على خلف الكيس.", "szO": "، شريط اللحام {O} مم", "fold": "تم اكتشاف خطوط الطي: الواجهة {W} مم، الجوانب {G} مم، الخلف {B} مم، الارتفاع {H} مم{S}. تكيّف الكيس تلقائياً.", "foldS": "، أشرطة اللحام {O} مم + {R} مم", "foldSw": "تم التعرّف على مخطط كيس بجوانب. ", "tipD": "القالب المسطّح: {W} × {T} مم (واجهة {H} + قاعدة {B2} + خلف {H}، الخلف مقلوب)", "dimB": "القاعدة (مم)", "dimG": "الجانب (مم)"}}, LABA = {"fr": {"front": "FACE", "back": "DOS", "base": "FOND", "gusset": "SOUFFLET", "empty": "Importez votre visuel ou déposez-le ici", "seal": "SOUDURE"}, "en": {"front": "FRONT", "back": "BACK", "base": "BASE", "gusset": "GUSSET", "empty": "Upload your artwork or drop it here", "seal": "SEAL"}, "ar": {"front": "الواجهة", "back": "الخلف", "base": "القاعدة", "gusset": "الجانب", "empty": "حمّلوا تصميمكم أو أفلتوه هنا", "seal": "اللحام"}};
    var lg = (document.documentElement.lang || 'fr').slice(0, 2), TX = TXA[lg] || TXA.fr;
    var st = { shape: 'pouch', color: '#FFFFFF', layers: [], sel: -1 };
    var $ = function (id) { return document.getElementById(id); };
    var api = HN3D.mount($('pv-canvas'), { shape: 'pouch', color: '#FFFFFF', logo: 'assets/img/logo.png' });
    var ed = api && HN3D.editor($('pv-ed'), api, { labels: LABA[lg] || LABA.fr, pdf: {"lib": "assets/js/pdf.min.js", "worker": "assets/js/pdf.worker.min.js"}, dropTarget: $('pv-canvas'),
      onChange: function (i) { st.layers = i.layers; st.sel = i.sel; st.size = i.size; if (!i.layers.length) st.note = null; ui(); },
      onNote: function (n) { st.note = n; ui(); },
      onSize: function (z) { if (z.shape) st.shape = z.shape; st.O = z.O || 0; st.R = z.R || 0; $('pv-W').value = z.W; $('pv-H').value = z.H; if (z.G) $('pv-G').value = z.G; ['W', 'H', 'G'].forEach(function (k) { $('pv-' + k).classList.remove('bad'); }); $('pv-bad').setAttribute('hidden', ''); ui(); }, limits: LIM });
    function ok(k, v) { var n = Number(v); return v !== '' && isFinite(n) && n >= LIM[k][0] && n <= LIM[k][1]; }
    function val(k) { return $('pv-' + k).value; }
    function num(k) { return ok(k, val(k)) ? Number(val(k)) : DEF[st.shape][k] || DEF.gusset[k]; }
    function dims() { return st.shape === 'gusset' || st.shape === 'pouch' ? ['W', 'H', 'G'] : ['W', 'H']; }
    function apply() {
      var bad = dims().filter(function (k) { return !ok(k, val(k)); });
      ['W', 'H', 'G'].forEach(function (k) { $('pv-' + k).classList.toggle('bad', bad.indexOf(k) >= 0); });
      var b = $('pv-bad');
      if (bad.length) { b.textContent = TX.bad.replace('{a}', LIM[bad[0]][0]).replace('{b}', LIM[bad[0]][1]); b.removeAttribute('hidden'); } else b.setAttribute('hidden', '');
      if (!bad.length && ed) ed.setModel(st.shape, { W: num('W'), H: num('H'), G: (st.shape === 'gusset' || st.shape === 'pouch') ? num('G') : 0, O: st.shape === 'gusset' ? (st.O || 0) : 0, R: st.shape === 'gusset' ? (st.R || 0) : 0 });
      ui();
    }
    function ui() {
      pv.querySelectorAll('[data-shape]').forEach(function (b) { var on = b.getAttribute('data-shape') === st.shape; b.classList.toggle('pv-on', on); b.setAttribute('aria-pressed', on); });
      pv.querySelectorAll('[data-color]').forEach(function (b) { var on = b.getAttribute('data-color') === st.color; b.classList.toggle('pv-on', on); b.setAttribute('aria-pressed', on); });
      var g = pv.querySelector('[data-g]'); if (st.shape === 'gusset' || st.shape === 'pouch') g.removeAttribute('hidden'); else g.setAttribute('hidden', '');
      pv.querySelector('[data-pvglab]').textContent = st.shape === 'pouch' ? TX.dimB : TX.dimG;
      $('pv-tip').textContent = st.shape === 'pouch' ? TX.tipD.split('{W}').join(num('W')).replace('{T}', Math.round(2 * num('H') + 2 * num('G'))).split('{H}').join(num('H')).replace('{B2}', Math.round(2 * num('G')))
        : st.shape === 'gusset' ? TX.tipG.replace('{T}', Math.round(2 * num('W') + 2 * num('G') + (st.O || 0) + (st.R || 0))).replace('{H}', num('H'))
        : TX.tipP.replace('{T}', 2 * num('W')).split('{W}').join(num('W')).replace('{H}', num('H'));
      var box = $('pv-layers'); box.innerHTML = '';
      st.layers.forEach(function (l, i) {
        var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'pvchip' + (l.sel ? ' pv-on' : ''); bt.setAttribute('aria-pressed', l.sel); bt.setAttribute('aria-label', TX.img + ' ' + (i + 1));
        var im = document.createElement('img'); im.src = l.thumb; im.alt = ''; bt.appendChild(im);
        bt.addEventListener('click', function () { ed.select(i); }); box.appendChild(bt);
      });
      if (st.layers.length) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
      if (st.sel >= 0 && st.layers.length) $('pv-tools').removeAttribute('hidden'); else $('pv-tools').setAttribute('hidden', '');
      var z = st.size, sw = $('pv-selw');
      if (z) { if (document.activeElement !== sw) sw.value = z.w; $('pv-selh').textContent = z.h; $('pv-pct').textContent = z.pct == null ? '' : z.pct; }
      [$('pv-pctwrap'), $('pv-real')].forEach(function (el) { if (z && z.pct != null) el.removeAttribute('hidden'); else el.setAttribute('hidden', ''); });
      var n = st.note, np = $('pv-note');
      if (!n) np.setAttribute('hidden', ''); else {
        np.className = 'pvnote' + (n.k === 'error' ? ' err' : (n.k === 'pdf' && n.clamped ? ' warn' : ''));
        np.textContent = n.k === 'fold' ? (function (n) { return (n.switched ? TX.foldSw : '') + TX.fold.replace('{W}', n.W).replace('{G}', n.G).replace('{B}', n.back).replace('{H}', n.H).replace('{S}', (n.O || n.R) ? TX.foldS.replace('{O}', n.O).replace('{R}', n.R) : ''); })(n) : n.k === 'reading' ? TX.reading : n.k === 'error' ? TX.perr : (n.clamped ? TX.pdfBig : n.where === 'all' ? TX.pdfAll : n.where === 'back' ? TX.pdfBack : TX.pdfFront).replace('{w}', n.w).replace('{h}', n.h).replace('{sz}', (n.gusset ? TX.szG + (n.O ? TX.szO.replace('{O}', n.O) : '') : TX.szP).replace('{W}', n.W).replace('{H}', n.H).replace('{G}', n.G));
        np.removeAttribute('hidden');
      }
      $('pv-cta').setAttribute('data-pick', BES[st.shape]);
    }
    pv.addEventListener('click', function (e) {
      var b = e.target.closest('[data-shape],[data-color],[data-view],[data-place],[data-act],[data-finish]'); if (!b || !api || !ed) return;
      if (b.hasAttribute('data-finish')) { var fk = b.getAttribute('data-finish'); api.setFinish(fk); pv.querySelectorAll('[data-finish]').forEach(function (o) { var on = o === b; o.classList.toggle('pv-on', on); o.setAttribute('aria-pressed', on); }); return; }
      if (b.hasAttribute('data-shape')) {
        st.shape = b.getAttribute('data-shape'); st.O = 0; st.R = 0; var z = DEF[st.shape];
        $('pv-W').value = z.W; $('pv-H').value = z.H; $('pv-G').value = z.G || DEF.gusset.G; apply(); return;
      }
      if (b.hasAttribute('data-color')) { st.color = b.getAttribute('data-color'); ed.setColor(st.color); }
      else if (b.hasAttribute('data-place')) ed.place(b.getAttribute('data-place'));
      else if (b.hasAttribute('data-act')) {
        var a = b.getAttribute('data-act');
        if (a === 'zin') ed.zoom(1.1); else if (a === 'zout') ed.zoom(1 / 1.1); else if (a === 'rot') ed.rotate(); else if (a === 'fwd') ed.forward(); else if (a === 'del') ed.remove();
      }
      else api.view(b.getAttribute('data-view'));
      ui();
    });
    pv.querySelectorAll('[data-dim]').forEach(function (i) { i.addEventListener('input', apply); });
    $('pv-selw').addEventListener('input', function () { if (ed && this.value !== '') ed.setWidth(Number(this.value)); });
    $('pv-selw').addEventListener('blur', ui);
    $('pv-real').addEventListener('click', function () { if (ed) ed.realSize(); });
    var inp = $('pv-file');
    inp.addEventListener('change', function () { var file = inp.files && inp.files[0]; if (file && ed) ed.addFile(file); inp.value = ''; });
    function save(href, name) { var a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    $('pv-tpl').addEventListener('click', function () { if (ed) save(ed.template(), 'gabarit-sachet-' + st.shape + '.png'); });
    $('pv-download').addEventListener('click', function () { if (api) save(api.snapshot(), 'hn-packaging-maquette-3d.png'); });
    var ob = $('pv-open'); if (ob) ob.addEventListener('click', function () { pv.classList.add('pv-open'); setTimeout(function () { ed && ed.setColor(st.color); }, 50); });
    $('pv-canvas').addEventListener('drop', function () { pv.classList.add('pv-open'); });
    apply();
  }

  // factory videos: play while on screen, pause button, respect reduced motion
  var ug = document.getElementById('usine-grid'), ub = document.getElementById('usine-toggle');
  if (ug && ub) {
    var uvs = Array.prototype.slice.call(ug.querySelectorAll('video')), upaused = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, uvis = false;
    uvs.forEach(function (v) { v.muted = true; v.playsInline = true; v.addEventListener('playing', function () { v.classList.add('on'); }); });
    function usync() {
      uvs.forEach(function (v) { if (uvis && !upaused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); });
      ub.setAttribute('aria-pressed', upaused); ub.querySelector('span').textContent = upaused ? ub.getAttribute('data-play') : ub.getAttribute('data-pause');
    }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { uvis = es.some(function (e) { return e.isIntersecting; }); usync(); }, { threshold: 0.05, rootMargin: '300px 0px' }).observe(ug);
    else { uvis = true; }
    ub.addEventListener('click', function () { upaused = !upaused; usync(); });
    usync();
  }

  // hero: photos and factory videos alternate
  var heroEl = document.getElementById('top');
  if (heroEl) (function (el) {
    var sl = Array.prototype.slice.call(el.querySelectorAll('.slide')), t = 0, dead = false;
    if (sl.length < 2 || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return function () {};
    sl.forEach(function (s) { if (s.tagName === 'VIDEO') { s.muted = true; s.playsInline = true; } });
    function nxt(k) { return (k + 1) % sl.length; }
    function prep(k) { var s = sl[k]; if (s.tagName === 'VIDEO' && s.preload !== 'auto') { s.preload = 'auto'; try { s.load(); } catch (e) {} } }
    function show(k) {
      if (dead) return; var s = sl[k];
      var go = function () {
        if (dead) return;
        sl.forEach(function (o, j) { if (j !== k && o.classList.contains('on')) { o.classList.remove('on'); if (o.tagName === 'VIDEO') setTimeout(function () { if (!o.classList.contains('on')) o.pause(); }, 1400); } });
        s.classList.add('on'); prep(nxt(k));
        t = setTimeout(function () { show(nxt(k)); }, s.tagName === 'VIDEO' ? 7000 : 5000);
      };
      if (s.tagName !== 'VIDEO') { go(); return; }
      var ok = false, done = function () { if (!ok) { ok = true; go(); } }, skip = function () { if (!ok) { ok = true; s.pause(); show(nxt(k)); } };
      try { s.currentTime = 0; } catch (e) {}
      var p = s.play();
      if (p && p.catch) p.catch(skip);
      if (s.readyState >= 3) done(); else { s.addEventListener('playing', done, { once: true }); setTimeout(skip, 3000); }
    }
    prep(1); t = setTimeout(function () { show(1); }, 5000);
    return function () { dead = true; clearTimeout(t); sl.forEach(function (s) { if (s.tagName === 'VIDEO') s.pause(); }); };
  })(heroEl);

  // structure explorer (folded until opened)
  if (window.HNStruct) window.HNStruct(document.getElementById('stx-root'));
  var stxB = document.getElementById('stx-open');
  if (stxB) stxB.addEventListener('click', function () { document.getElementById('structures').classList.add('stx-open'); stxB.setAttribute('aria-expanded', 'true'); var f = document.querySelector('#structures [data-prod]'); if (f) f.focus(); });

  // key figures (years of experience computed from the date) with a count-up
  var kfr = document.getElementById('kfig-row');
  if (kfr) (function (row) {
    var bs = Array.prototype.slice.call(row.querySelectorAll('[data-count]'));
    bs.forEach(function (b) { var y = b.getAttribute('data-years'); if (y) { b.setAttribute('data-count', String(new Date().getFullYear() - (+y))); b.textContent = b.getAttribute('data-count'); } });
    if (row.__kfig || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || !window.IntersectionObserver) return; row.__kfig = true;
    var run = function () {
      var t0 = null;
      var step = function (t) {
        if (!t0) t0 = t; var p = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - p, 3);
        bs.forEach(function (b) { var n = +b.getAttribute('data-count') || 0, pre = b.getAttribute('data-pre') || ''; b.textContent = pre + Math.round(n * e); });
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); run(); } }, { threshold: .35 });
    io.observe(row);
  })(kfr);

  // offline support
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js'); });
})();
