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

  // quote form -> WhatsApp message
  var form = $('#quote-form'), wrap = $('#quote-form-wrap'), sent = $('#quote-sent');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var lines = [form.getAttribute('data-wa-title'), ''];
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.id || !el.value) return;
      var lab = form.querySelector('label[for="' + el.id + '"]');
      var val = el.tagName === 'SELECT' ? el.options[el.selectedIndex].text : el.value;
      lines.push((lab ? lab.textContent.trim() : el.name) + ' : ' + val);
    });
    window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
    wrap.hidden = true; sent.hidden = false;
  });
  var reset = $('#quote-reset');
  if (reset) reset.addEventListener('click', function () { form.reset(); sent.hidden = true; wrap.hidden = false; });

  // install button (Android / desktop Chrome & Edge)
  var deferred = null, ib = $('#install-app');
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; if (ib) ib.hidden = false; });
  if (ib) ib.addEventListener('click', function () {
    if (!deferred) return; deferred.prompt();
    deferred.userChoice.then(function () { deferred = null; ib.hidden = true; });
  });
  window.addEventListener('appinstalled', function () { if (ib) ib.hidden = true; });

  // offline support
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js'); });
})();
