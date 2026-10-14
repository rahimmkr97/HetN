/* H&N Packaging - 3D packaging preview (self-contained WebGL, no dependencies).
   HN3D.mount(canvas, {shape, color, logo}) -> {setShape, setColor, setLogo, view, destroy} */
(function () {
  'use strict';
  // ---------- tiny matrix helpers (column-major) ----------
  function persp(fovy, asp, n, f) { var t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]; }
  function mul(a, b) { var o = new Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
  function trans(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function spow(x, p) { return Math.pow(Math.max(x, 0), p); }

  // ---------- geometry ----------
  function hsh(i, j) { var h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }
  function vn(x, y) { var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = hsh(i, j), b = hsh(i + 1, j), c = hsh(i, j + 1), d = hsh(i + 1, j + 1), ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy; }
  function fbm(x, y) { return .55 * vn(x, y) + .3 * vn(2.03 * x + 17, 2.03 * y + 5) + .15 * vn(4.1 * x + 3, 4.1 * y + 31); }
  // soft film wrinkles: creases fanning under the top seal, ripples along the side seals, gentle overall undulation
  function wrinkle(s, v, seed, top0, top1) {
    var top = sstep(top0 || .5, top1 || .86, v) * (1 - sstep((top1 || .86) + .04, (top1 || .86) + .075, v));
    var cr = (fbm(s * 11 + seed, v * 2.2 + seed * .7) - .5) * .05 * top;
    var ed = 1 - sstep(0, .14, Math.min(s, 1 - s));
    var rp = (fbm(s * 4 + seed * 1.3, v * 16) - .5) * .022 * ed;
    var gen = (fbm(s * 3.2 + seed * 2.1, v * 3.6 + seed) - .5) * .018;
    return cr + rp + gen;
  }
  function grid(nu, nv, fn, flip) {      // fn(s, v) -> [x, y, z, u, v]
    var P = [], U = [], I = [];
    for (var j = 0; j <= nv; j++) for (var i = 0; i <= nu; i++) { var p = fn(i / nu, j / nv, i, j); P.push(p[0], p[1], p[2]); U.push(p[3], p[4]); }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (flip) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d);
    }
    return mesh(P, U, I);
  }
  function mesh(P, U, I) {
    var N = new Float32Array(P.length);
    for (var k = 0; k < I.length; k += 3) {
      var a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
      var ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      [a, b, c].forEach(function (q) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; });
    }
    for (k = 0; k < N.length; k += 3) { var l = Math.hypot(N[k], N[k + 1], N[k + 2]) || 1; N[k] /= l; N[k + 1] /= l; N[k + 2] /= l; }
    return { P: new Float32Array(P), N: N, U: new Float32Array(U), I: new Uint16Array(I) };
  }
  function scaleMesh(m, f) { var P = Array.prototype.slice.call(m.P); for (var i = 0; i < P.length; i += 3) P[i] *= f; return mesh(P, Array.prototype.slice.call(m.U), Array.prototype.slice.call(m.I)); }
  function lathe(profile, nu, uMap) { // profile: [[r, y], ...] bottom->top
    var nv = profile.length - 1;
    return grid(nu, nv, function (s, t, i, j) { var r = profile[j][0], y = profile[j][1], a = 2 * Math.PI * s - Math.PI; return [r * Math.sin(a), y, r * Math.cos(a), s, uMap ? uMap(y) : t]; }, true);
  }
  function disc(r, y, up, n) {
    var P = [0, y, 0], U = [.5, .5], I = [];
    for (var i = 0; i <= n; i++) { var a = 2 * Math.PI * i / n; P.push(r * Math.sin(a), y, r * Math.cos(a)); U.push(.5 + .5 * Math.sin(a), .5 + .5 * Math.cos(a)); }
    for (i = 1; i <= n; i++) if (up) I.push(0, i, i + 1); else I.push(0, i + 1, i);
    return mesh(P, U, I);
  }
  function ring(r, y0, y1, n, uMap) { return lathe([[r, y0], [r, y1]], n, uMap); }

  // ---------- shapes ----------
  var SH = {
    pouch: { sw: 1.36, sh: 2, box: [.13, .87, .30, .74], tex: [1024, 1024], cam: 7.4, build: function () {   // doypack: zipper, tear notches, crimped top seal, bottom gusset
      var W = .68, NU = 96, NV = 150;
      function tf(v) { return .34 * (1 - sstep(.5, .935, v)) * (.62 + .38 * (1 - v)); }
      function w(v) { var n = (v > .925 && v < .95) ? .03 * (1 - Math.abs(v - .9375) / .0125) : 0; return W * (1 - .035 * (1 - v)) - n; }
      function zig(v, i) { return v === 1 ? ((i % 2) ? 0 : -.022) : 0; }
      function zip(v) { return .016 * Math.exp(-Math.pow((v - .882) / .0065, 2)); }
      function crimp(v) { return v > .945 ? .0026 * (1 + Math.sin(v * NV * Math.PI)) : 0; }
      function z(s, v, seed) { var p = tf(v) * spow(Math.sin(Math.PI * s), .5), k = clamp(p / .05, 0, 1); return p + k * (wrinkle(s, v, seed) + zip(v) * spow(Math.sin(Math.PI * s), .25)) + crimp(v) + .0015; }
      var f = grid(NU, NV, function (s, v, i) { var x = -w(v) + 2 * w(v) * s; return [x, -1 + 2 * v + zig(v, i), z(s, v, 1.7), s, 1 - v]; }, false);
      var b = grid(NU, NV, function (s, v, i) { var x = -w(v) + 2 * w(v) * s; return [x, -1 + 2 * v + zig(v, i), -z(1 - s, v, 9.3), 1 - s, 1 - v]; }, true);
      var P = [], U = [], I = [], n = 64;                       // gusset (bottom)
      for (var i = 0; i <= n; i++) { var s = i / n, x = -w(0) + 2 * w(0) * s, zz = tf(0) * spow(Math.sin(Math.PI * s), .5); P.push(x, -1, zz, x, -1, -zz); U.push(s, .995, s, .995); }
      for (i = 0; i < n; i++) { var a = 2 * i; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      return [{ m: f, tex: 'front' }, { m: b, tex: 'back' }, { m: mesh(P, U, I), tex: 'front' }];
    } },
    flat: { sw: 1.4, sh: 1.9, box: [.14, .86, .24, .76], tex: [1024, 1024], cam: 7.2, build: function () {   // flat pillow bag: top + bottom crimp seals only, folded sides, central seal on the back
      var B = .07, NU = 128, NV = 150;
      function win(v) { return v < B || v > 1 - B ? 0 : spow(Math.sin(Math.PI * (v - B) / (1 - 2 * B)), .42); }
      function puff(s, v) { return .2 * spow(Math.sin(Math.PI * s), .55) * win(v); }
      function z(s, v, seed) {
        if (v < B || v > 1 - B) return .0022 * (1 + Math.sin(s * 1.4 * Math.PI * 2 * 26)) + .0012;            // crimped seal bands
        var p = puff(s, v), k = clamp(p / .04, 0, 1);
        return p + k * (wrinkle(s, v, seed, .6, .86) * .75 + wrinkle(s, 1 - v, seed + 5.1, .6, .86) * .55) + .0012;
      }
      function y(s, v, i) { var e = (v === 0 || v === 1) ? ((i % 2) ? 0 : (v === 0 ? .018 : -.018)) : 0; return -.95 + 1.9 * v + e; }   // serrated cut edges
      function nx(s, v) { var d = (v > .945 && v < .975) ? .026 * (1 - Math.abs(v - .96) / .015) : 0, x = -.7 + 1.4 * s; return clamp(x, -.7 + d, .7 - d); }  // tear notches in the top seal
      var f = grid(NU, NV, function (s, v, i) { return [nx(s, v), y(s, v, i), z(s, v, 2.4), s, 1 - v]; }, false);
      var b = grid(NU, NV, function (s, v, i) { return [nx(s, v), y(s, v, i), -z(1 - s, v, 7.1), 1 - s, 1 - v]; }, true);
      // central (fin) seal along the back, folded flat to one side
      var wF = .085, nu = 6, FP = [], FU = [], FI = [];
      for (var j = 0; j <= NV; j++) {
        var v = j / NV;
        for (var i = 0; i <= nu; i++) {
          var t = i / nu, x = -t * wF, sb = (x + .7) / 1.4;
          FP.push(x, y(sb, v, j === NV || j === 0 ? i : 1), -z(1 - sb, v, 7.1) - .004 - .003 * Math.sin(Math.PI * t));
          FU.push(.5 + .06 * t, 1 - v);
        }
      }
      for (j = 0; j < NV; j++) for (i = 0; i < nu; i++) { var a = j * (nu + 1) + i, c = a + nu + 1; FI.push(a, a + 1, c, a + 1, c + 1, c); }
      return [{ m: f, tex: 'front' }, { m: b, tex: 'back' }, { m: mesh(FP, FU, FI), tex: 'back' }];
    } },
    chips: { sw: 1.5, sh: 2, box: [.12, .88, .27, .73], tex: [1024, 1024], cam: 7.4, build: function () {
      function body(v) { return clamp((v - .1) / .8, 0, 1); }
      function w(v) { return .75 * (1 - .07 * (1 - Math.sin(Math.PI * body(v)))); }
      function z(s, v) {
        if (v < .1 || v > .9) return .007 * Math.sin(s * Math.PI * 2 * 30);
        return .31 * spow(Math.sin(Math.PI * s), .5) * spow(Math.sin(Math.PI * body(v)), .42);
      }
      var f = grid(80, 100, function (s, v) { return [-w(v) + 2 * w(v) * s, -1 + 2 * v, z(s, v), s, 1 - v]; }, false);
      var b = grid(80, 100, function (s, v) { return [-w(v) + 2 * w(v) * s, -1 + 2 * v, -z(s, v), 1 - s, 1 - v]; }, true);
      return [{ m: f, tex: 'front' }, { m: b, tex: 'back' }];
    } },
    label: { sw: 2 * Math.PI * .606, sh: .9, box: [.36, .64, .12, .88], wrap: true, tex: [2048, 512], cam: 7.0, build: function () {
      var lab = function (y) { return 1 - (y + .55) / .9; };
      return [
        { m: ring(.6, -.95, .8, 72), mat: 'glass', alpha: true }, { m: disc(.6, -.95, false, 72), mat: 'glass', alpha: true },
        { m: ring(.606, -.55, .35, 96, lab), tex: 'wrap' },
        { m: ring(.625, .8, 1.08, 96, function (y) { return (y - .8) / .28; }), mat: 'lid' }, { m: disc(.625, 1.08, true, 72), mat: 'lidtop' }
      ];
    } },
    gusset: { cam: 6.6, build: function (st) { return buildGusset(st.dims); } },
    sleeve: { sw: 2 * Math.PI * .424, sh: 1.56, box: [.36, .64, .30, .72], wrap: true, tex: [2048, 1024], cam: 7.2, build: function () {
      var prof = [[0, -1], [.33, -1], [.39, -.97], [.42, -.9], [.42, .38], [.4, .48], [.36, .6], [.28, .74], [.2, .86], [.16, .92], [.155, 1.0]];
      var sl = prof.filter(function (p) { return p[1] >= -.9 && p[1] <= .66; }).map(function (p) { return [p[0] + .005, p[1]]; });
      sl.unshift([.425, -.9]); sl.push([.33, .66]);
      return [
        { m: lathe(prof, 72), mat: 'plastic', alpha: true },
        { m: lathe(sl, 96, function (y) { return 1 - (y + .9) / 1.56; }), tex: 'wrap' },
        { m: ring(.17, 1.0, 1.2, 72, function (y) { return (y - 1) / .2; }), mat: 'cap' }, { m: disc(.17, 1.2, true, 48), mat: 'cap' }
      ];
    } }
  };

  // ---------- textures ----------
  function lum(hex) { var n = parseInt(hex.slice(1), 16); return (.2126 * ((n >> 16) & 255) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255)) / 255; }
  function prepLogo(img) {   // remove white background, trim, report luminance
    var c = document.createElement('canvas'), mx = 900, sc = Math.min(1, mx / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * sc)); c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * sc));
    var x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
    var d = x.getImageData(0, 0, c.width, c.height), p = d.data, x0 = c.width, y0 = c.height, x1 = 0, y1 = 0, L = 0, Ln = 0;
    for (var i = 0; i < p.length; i += 4) {
      var m = Math.min(p[i], p[i + 1], p[i + 2]);
      if (m > 236) p[i + 3] = 0; else if (m > 212) p[i + 3] = Math.round(p[i + 3] * (236 - m) / 24);
      if (p[i + 3] > 40) { var k = i / 4, px = k % c.width, py = (k / c.width) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; L += (p[i] + p[i + 1] + p[i + 2]) / 765; Ln++; }
    }
    x.putImageData(d, 0, 0);
    if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
    var t = document.createElement('canvas'); t.width = x1 - x0 + 1; t.height = y1 - y0 + 1; t.getContext('2d').drawImage(c, -x0, -y0);
    t.lum = Ln ? L / Ln : .5; return t;
  }
  function whiteVersion(src) { var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; var x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height); return c; }
  function drawFit(x, logo, cw, ch, sa, bx) {      // bx in surface fractions [x0,x1,y0,y1]
    var bw = (bx[1] - bx[0]) * cw, bh = (bx[3] - bx[2]) * ch, k = (cw / ch) / sa, A = logo.width / logo.height;
    var dh = bh, dw = dh * A * k; if (dw > bw) { dw = bw; dh = dw / (A * k); }
    x.drawImage(logo, bx[0] * cw + (bw - dw) / 2, bx[2] * ch + (bh - dh) / 2, dw, dh);
  }
  function backPanel(x, logo, cw, ch, sa, x0, x1, col) {
    var ink = lum(col) < .45 ? 'rgba(255,255,255,.75)' : 'rgba(20,31,69,.55)';
    if (logo) drawFit(x, logo, cw, ch, sa, [x0 + (x1 - x0) * .25, x1 - (x1 - x0) * .25, .10, .26]);
    x.fillStyle = ink;
    for (var r = 0; r < 7; r++) { var w = (x1 - x0) * (r % 3 === 2 ? .55 : .8); x.fillRect((x0 + (x1 - x0) * .1) * cw, (.34 + r * .045) * ch, w * cw, .016 * ch); }
    var bx0 = x0 + (x1 - x0) * .52, bxw = (x1 - x0) * .38;
    x.fillStyle = '#FFFFFF'; x.fillRect(bx0 * cw, .70 * ch, bxw * cw, .16 * ch);
    x.fillStyle = '#111'; var seed = 7;
    for (var b = bx0 + .01; b < bx0 + bxw - .012;) { seed = (seed * 9301 + 49297) % 233280; var bw2 = .0025 + (seed / 233280) * .007; x.fillRect(b * cw, .72 * ch, bw2 * cw, .11 * ch); b += bw2 + .004; }
  }
  function drawArt(x, img, rx, ry, rw, rh, sa, mode) {   // place artwork in a region; sa = region's real aspect (w/h)
    var A = (img.naturalWidth || img.width) / (img.naturalHeight || img.height), k = (rw / rh) / sa;
    var dh = mode === 'contain' ? Math.min(rh, rw / (A * k)) : Math.max(rh, rw / (A * k)), dw = A * k * dh;
    x.save(); x.beginPath(); x.rect(rx, ry, rw, rh); x.clip(); x.drawImage(img, rx + (rw - dw) / 2, ry + (rh - dh) / 2, dw, dh); x.restore();
  }
  function makeTex(shape, which, col, logo, faces, fit, sa) {
    var S = SH[shape]; sa = sa || S.sw / S.sh; var cw = S.tex[0], ch = S.tex[1], c = document.createElement('canvas'); c.width = cw; c.height = ch;
    var x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, cw, ch);
    var dark = lum(col) < .4, lg = logo && dark && logo.lum < .45 ? whiteVersion(logo) : logo;
    var g = x.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, 'rgba(255,255,255,.06)'); g.addColorStop(1, 'rgba(0,0,0,.06)'); x.fillStyle = g; x.fillRect(0, 0, cw, ch);
    if (shape === 'pouch') {
      x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(0, 0, cw, .065 * ch);
      x.fillStyle = 'rgba(0,0,0,.10)'; for (var yy = 4; yy < .06 * ch; yy += 7) x.fillRect(0, yy, cw, 2);
      x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(.03 * cw, .118 * ch, .94 * cw, 3); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(.03 * cw, .118 * ch + 4, .94 * cw, 2);
    }
    if (shape === 'chips') {
      [[0, .1], [.9, 1]].forEach(function (z) { for (var xx = 0; xx < cw; xx += 17) { x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(xx, z[0] * ch, 6, (z[1] - z[0]) * ch); } });
    }
    var art = faces && faces[which];
    if (art && art.img) x.drawImage(art.img, art.sx, 0, art.sw, art.img.naturalHeight || art.img.height, 0, 0, cw, ch);
    else if (art) drawArt(x, art, 0, 0, cw, ch, sa, fit);
    else if (which === 'front' && lg) drawFit(x, lg, cw, ch, sa, S.box);
    else if (which === 'back') backPanel(x, lg, cw, ch, sa, .1, .9, col);
    if (art && shape === 'pouch') { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(.03 * cw, .118 * ch, .94 * cw, 3); x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(.03 * cw, .118 * ch + 4, .94 * cw, 2); }
    if (shape === 'flat') { x.fillStyle = 'rgba(255,255,255,.14)'; [[0, 0, 1, .07], [0, .93, 1, .07]].forEach(function (r) { x.fillRect(r[0] * cw, r[1] * ch, r[2] * cw, r[3] * ch); }); }
    if (which === 'wrap') { if (lg) drawFit(x, lg, cw, ch, S.sw / S.sh, S.box); backPanel(x, lg, cw, ch, S.sw / S.sh, -.13, .13, col); backPanel(x, lg, cw, ch, S.sw / S.sh, .87, 1.13, col); }
    if (shape === 'label') { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 0, cw, 3); x.fillRect(0, ch - 3, cw, 3); }
    return c;
  }


  // ---------- side-gusset bag wrapped with a full flat print layout ----------
  // layout left -> right: back half | gusset | FRONT | gusset | back half (front centred)
  function layout(d) {   // [seal L | back half | gusset | FRONT | gusset | back half | seal R], front centred between the seals
    var O = (d.O || 0) / d.W, R = (d.R || 0) / d.W, f = d.F / d.W, g = d.G / d.W, c = O + (1 - O - R) / 2, u2 = c - f / 2, u3 = c + f / 2;
    return [Math.max(0, Math.min(O, u2 - g - .01)), Math.max(.01, u2 - g), u2, u3, Math.min(.99, u3 + g), Math.max(u3 + g + .01, Math.min(1, 1 - R))];
  }
  function buildGusset(d) {
    var sc = 2 / d.H, F = d.F * sc, D = d.G * sc, U = layout(d), NV = 170, R = Math.min(F, D) * .14;
    function open(v) { return 1 - sstep(.74, .93, v); }
    function depth(v) { return Math.max(.006, D * open(v) * (v < .05 ? .86 + .14 * (v / .05) : 1)); }
    var P = [], UV = [], I = [], NC = 0, rows = [];
    for (var j = 0; j <= NV; j++) {
      var v = j / NV, hz = depth(v) / 2, hx = F / 2, r = Math.min(R, hz * .95), y = -1 + 2 * v, bF = .05 * D * open(v), bG = .015 * F * open(v), pts = [];
      var seg = function (x0, z0, x1, z1, u0, u1, n, bf) { for (var k = 0; k < n; k++) { var t = k / n, o = bf(t); pts.push([x0 + (x1 - x0) * t + o[0], z0 + (z1 - z0) * t + o[1], u0 + (u1 - u0) * t]); } };
      var arc = function (cx, cz, a0, a1, u, n) { for (var k = 0; k < n; k++) { var a = a0 + (a1 - a0) * k / n; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a), u]); } };
      seg(0, -hz, -hx + r, -hz, U[0], U[1], 20, function (t) { return [0, -bF * Math.cos(Math.PI / 2 * t)]; });
      arc(-hx + r, -hz + r, -Math.PI / 2, -Math.PI, U[1], 5);
      seg(-hx, -hz + r, -hx, hz - r, U[1], U[2], 20, function (t) { return [-bG * Math.sin(Math.PI * t), 0]; });
      arc(-hx + r, hz - r, Math.PI, Math.PI / 2, U[2], 5);
      seg(-hx + r, hz, hx - r, hz, U[2], U[3], 28, function (t) { return [0, bF * Math.sin(Math.PI * t)]; });
      arc(hx - r, hz - r, Math.PI / 2, 0, U[3], 5);
      seg(hx, hz - r, hx, -hz + r, U[3], U[4], 20, function (t) { return [bG * Math.sin(Math.PI * t), 0]; });
      arc(hx - r, -hz + r, 0, -Math.PI / 2, U[4], 5);
      seg(hx - r, -hz, 0, -hz, U[4], U[5], 20, function (t) { return [0, -bF * Math.sin(Math.PI / 2 * t)]; });
      pts.push([0, -hz - bF, 1]);
      var op = open(v), cz = v > .945 ? .0028 * (1 + Math.sin(v * NV * Math.PI)) : 0;
      pts = pts.map(function (q) {   // wrinkles push the film along its outward direction; crimp ridges on the top seal
        var ax = Math.abs(q[0]) / (hx + 1e-4), az = Math.abs(q[1]) / (hz + bF + 1e-4), wr = wrinkle(q[2], v, 3.3, .58, .86) * .55 * op;
        if (az >= ax) return [q[0], q[1] + (q[1] < 0 ? -1 : 1) * (wr + cz), q[2]];
        return [q[0] + (q[0] < 0 ? -1 : 1) * wr * .6, q[1] + (q[1] < 0 ? -1 : 1) * cz, q[2]];
      });
      NC = pts.length; rows.push(pts);
      pts.forEach(function (q, i) { P.push(q[0], y + (j === NV && i % 2 === 0 ? -.016 : 0), q[1]); UV.push(q[2], 1 - v); });
    }
    for (j = 0; j < NV; j++) for (var i = 0; i < NC - 1; i++) { var a = j * NC + i, b = a + 1, c = a + NC, e = c + 1; I.push(a, c, b, b, c, e); }
    var side = mesh(P, UV, I);
    // central (fin) seal on the back: the sealed strip folded flat against the back panel
    var wF = Math.min(.1, F * .2), U0 = U[0] > .004 ? U[0] : .012, nu = 6, FP = [], FU = [], FI = [];
    for (j = 0; j <= NV; j++) {
      var v2 = j / NV, hz2 = depth(v2) / 2, bF2 = .05 * D * open(v2), r2 = Math.min(R, hz2 * .95), y2 = -1 + 2 * v2;
      for (i = 0; i <= nu; i++) {
        var t2 = i / nu, x2 = -t2 * wF, tt = Math.min(1, -x2 / (F / 2 - r2)), cz2 = v2 > .945 ? .0028 * (1 + Math.sin(v2 * NV * Math.PI)) : 0;
        FP.push(x2, y2 + (j === NV && i % 2 === 0 ? -.016 : 0), -hz2 - bF2 * Math.cos(Math.PI / 2 * tt) - .005 - .003 * Math.sin(Math.PI * t2) - cz2);
        FU.push(U0 * (.15 + .7 * t2), 1 - v2);
      }
    }
    for (j = 0; j < NV; j++) for (i = 0; i < nu; i++) { var fa = j * (nu + 1) + i, fb = fa + 1, fc = fa + nu + 1, fd = fc + 1; FI.push(fa, fb, fc, fb, fd, fc); }
    var fin = mesh(FP, FU, FI);
    var BP = [0, -1, 0], BU = [.5, .995], BI = [];
    rows[0].forEach(function (q) { BP.push(q[0], -1, q[1]); BU.push(q[2], .995); });
    for (i = 1; i < rows[0].length; i++) BI.push(0, i, i + 1);
    return [{ m: side, tex: 'die' }, { m: mesh(BP, BU, BI), tex: 'die' }, { m: fin, tex: 'die' }];
  }
  function sampleDie(c, d, logo) {
    var x = c.getContext('2d'), cw = c.width, ch = c.height, U = layout(d);
    function px(u) { return u * cw; }
    x.fillStyle = '#141F45'; x.fillRect(0, 0, cw, ch);
    x.fillStyle = '#F5B869'; x.fillRect(px(U[1]), 0, px(U[2]) - px(U[1]), ch); x.fillRect(px(U[3]), 0, px(U[4]) - px(U[3]), ch);
    x.fillStyle = '#FFFFFF'; x.fillRect(px(U[2]), 0, px(U[3]) - px(U[2]), ch);
    x.fillStyle = '#2A4185'; x.fillRect(px(U[2]), .80 * ch, px(U[3]) - px(U[2]), .06 * ch);
    x.fillStyle = '#F5B869'; x.fillRect(px(U[2]), .865 * ch, px(U[3]) - px(U[2]), .012 * ch);
    if (logo) { x.save(); x.translate(px(U[2]), 0); drawFit(x, logo, px(U[3]) - px(U[2]), ch, d.F / d.H, [.12, .88, .26, .62]); x.restore(); }
    x.save(); x.translate(0, 0); backPanel(x, logo, px(U[1]), ch, (d.W * U[1]) / d.H, .08, .92, '#141F45'); x.restore();
    x.save(); x.translate(px(U[4]), 0); backPanel(x, null, cw - px(U[4]), ch, (d.W * (1 - U[4])) / d.H, .08, .92, '#141F45'); x.restore();
    x.fillStyle = 'rgba(0,0,0,.18)'; for (var yy = 0; yy < .07 * ch; yy += 10) x.fillRect(0, yy, cw, 3);
    for (yy = .95 * ch; yy < ch; yy += 10) x.fillRect(0, yy, cw, 3);
  }

  function composeDie(c, st) {
    var x = c.getContext('2d'), cw = c.width, ch = c.height, d = st.dims, U = layout(d), f = st.faces, m = st.fit;
    function reg(u0, u1, img, sa) { if (!img) return; x.fillStyle = st.color; x.fillRect(u0 * cw, 0, (u1 - u0) * cw, ch); drawArt(x, img, u0 * cw, 0, (u1 - u0) * cw, ch, sa, m); }
    reg(U[1], U[2], f.left, d.G / d.H); reg(U[2], U[3], f.front, d.F / d.H); reg(U[3], U[4], f.right, d.G / d.H);
    if (f.back) {   // back artwork is split across the back seam: right half at the far left, left half at the far right
      var bw = Math.round((U[1] + 1 - U[4]) * cw), t = document.createElement('canvas'); t.width = bw; t.height = ch;
      var tx = t.getContext('2d'); tx.fillStyle = st.color; tx.fillRect(0, 0, bw, ch); drawArt(tx, f.back, 0, 0, bw, ch, d.F / d.H, m);
      var half = Math.round(U[1] * cw);
      x.drawImage(t, bw - half, 0, half, ch, 0, 0, half, ch);
      x.drawImage(t, 0, 0, bw - half, ch, U[4] * cw, 0, cw - U[4] * cw, ch);
    }
  }

  // ---------- WebGL ----------
  var VS = 'attribute vec3 p;attribute vec3 n;attribute vec2 t;uniform mat4 M;uniform mat4 VP;varying vec3 wn;varying vec3 wp;varying vec2 vt;void main(){vec4 w=M*vec4(p,1.0);wp=w.xyz;wn=mat3(M)*n;vt=t;gl_Position=VP*w;}';
  // studio look: soft key/fill light for the print + a glossy film that reflects three softboxes (moves across the bag as it turns)
  var FS = 'precision highp float;varying vec3 wn;varying vec3 wp;varying vec2 vt;uniform sampler2D tx;uniform float useTex;uniform vec3 col;uniform float alpha;uniform float spec;uniform float shine;uniform float mode;uniform vec3 cam;uniform float shadowA;' +
    'vec3 tone(vec3 c){c*=0.85;return clamp((c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14),0.0,1.0);}' +
    'float bx(vec3 r,float p0,float p1,float t0,float t1,float s){float ph=atan(r.x,r.z);float th=asin(clamp(r.y,-1.0,1.0));' +
    'return smoothstep(p0-s,p0+s,ph)*(1.0-smoothstep(p1-s,p1+s,ph))*smoothstep(t0-s,t0+s,th)*(1.0-smoothstep(t1-s,t1+s,th));}' +
    'vec3 env(vec3 r,float g){float s=mix(0.26,0.09,g);vec3 c=mix(vec3(0.16,0.17,0.19),vec3(0.55,0.57,0.6),smoothstep(-0.45,0.2,r.y));c=mix(c,vec3(0.8,0.82,0.86),smoothstep(0.35,0.95,r.y));' +
    'c+=vec3(1.0,0.99,0.97)*7.0*bx(r,-1.25,-0.85,-0.25,0.75,s);c+=vec3(0.95,0.97,1.0)*4.5*bx(r,0.62,0.86,-0.05,0.55,s);c+=vec3(1.0)*2.6*bx(r,-0.35,0.35,1.1,1.6,s*1.4);return c;}' +
    'void main(){if(mode>1.5){float d=length(vt*2.0-1.0);gl_FragColor=vec4(0.0,0.0,0.0,(1.0-smoothstep(0.0,1.0,d))*shadowA);return;}' +
    'vec3 n=normalize(wn);vec3 v=normalize(cam-wp);if(dot(n,v)<0.0)n=-n;' +
    'vec3 base=useTex>0.5?pow(texture2D(tx,vt).rgb,vec3(2.2)):pow(col,vec3(2.2));' +
    'vec3 k=normalize(vec3(-0.55,0.75,0.9));vec3 f=normalize(vec3(0.9,0.15,0.55));vec3 r=normalize(vec3(0.2,0.6,-1.0));' +
    'float hemi=mix(0.32,0.5,n.y*0.5+0.5);float dif=hemi+0.74*max(dot(n,k),0.0)+0.2*max(dot(n,f),0.0)+0.16*max(dot(n,r),0.0);' +
    'float g=clamp(spec/0.55,0.0,1.0);float ndv=max(dot(n,v),0.0);float F=mix(0.012,0.05,g)+(1.0-mix(0.012,0.05,g))*pow(1.0-ndv,5.0)*mix(0.25,1.0,g);' +
    'vec3 rf=reflect(-v,n);vec3 e=env(rf,g);' +
    'float sp=pow(max(dot(n,normalize(k+v)),0.0),mix(10.0,60.0,g))*mix(0.05,0.18,g);' +
    'vec3 c=base*dif*(1.0-F)+e*F+vec3(sp);' +
    'float hl=dot(e*F,vec3(0.333));' +
    'gl_FragColor=vec4(pow(tone(c),vec3(1.0/2.2)),alpha+clamp(hl,0.0,1.0)*(1.0-alpha));}';

  function mount(canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    var A = { p: gl.getAttribLocation(pr, 'p'), n: gl.getAttribLocation(pr, 'n'), t: gl.getAttribLocation(pr, 't') };
    var Un = {}; ['M', 'VP', 'tx', 'useTex', 'col', 'alpha', 'spec', 'shine', 'mode', 'cam', 'shadowA'].forEach(function (k) { Un[k] = gl.getUniformLocation(pr, k); });
    function upload(m) {
      function buf(arr, tgt) { var b = gl.createBuffer(); gl.bindBuffer(tgt || gl.ARRAY_BUFFER, b); gl.bufferData(tgt || gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b; }
      return { p: buf(m.P), n: buf(m.N), t: buf(m.U), i: buf(m.I, gl.ELEMENT_ARRAY_BUFFER), c: m.I.length };
    }
    function texFrom(cv) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var ext = gl.getExtension('EXT_texture_filter_anisotropic'); if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      return t;
    }
    var ground = upload(grid(1, 1, function (s, v) { return [(s - .5) * 3.2, -1.03, (v - .5) * 1.6, s, v]; }, true));
    var MAT = {
      glass: { col: [.86, .91, .95], alpha: .22, spec: .9, shine: 90 }, plastic: { col: [.88, .93, .97], alpha: .25, spec: .9, shine: 90 },
      lid: { col: [.72, .74, .78], alpha: 1, spec: .8, shine: 40 }, lidtop: { col: [.78, .8, .83], alpha: 1, spec: .7, shine: 30 }, cap: { col: [.93, .94, .96], alpha: 1, spec: .35, shine: 30 }
    };
    var st = { shape: opts.shape || 'pouch', color: opts.color || '#FFFFFF', logo: null, parts: null, tex: {}, faces: {}, fit: 'cover', die: null, dims: opts.dims || { W: 280, H: 230, F: 80, G: 45, O: 0 } };
    var yaw = -.35, pitch = .08, ty = yaw, tp = pitch, auto = true, drag = null, raf = 0, dead = false;

    function classify() {     // what kind of artwork did the client upload, given the bag size?
      st.mode = null; if (!st.design || !st.size) return;
      var z = st.size, r = (st.design.naturalWidth || st.design.width) / (st.design.naturalHeight || st.design.height);
      function d(a, b) { return Math.abs(Math.log(a / b)); }
      if (st.shape === 'gusset') { var full = (2 * z.W + 2 * (z.G || 0)) / z.H, front = z.W / z.H; st.mode = (r >= full * .97 || d(r, full) < d(r, front)) ? 'full' : 'front'; }
      else { var pair = 2 * z.W / z.H, single = z.W / z.H; st.mode = d(r, pair) < d(r, single) ? 'pair' : 'single'; }
      if (opts.onInfo) opts.onInfo(st.mode);
    }
    function sizeDims() {
      var z = st.size || { W: 80, H: 230, G: 45 }, base = 2 * z.W + 2 * (z.G || 45), O = z.O || 0, R = z.R || 0, total = base + O + R;
      if (st.design && st.mode === 'full') { var t2 = (st.design.naturalWidth || st.design.width) / (st.design.naturalHeight || st.design.height) * z.H; if (t2 > total) { O += t2 - total; total = t2; } }
      st.dims = { W: total, H: z.H, F: z.W, G: z.G || 45, O: O, R: R };
    }
    function build() {
      if (st.parts) st.parts.forEach(function (p) { ['p', 'n', 't', 'i'].forEach(function (k) { gl.deleteBuffer(p.g[k]); }); });
      var S = SH[st.shape], parts;
      if (st.shape === 'gusset') { if (st.size) sizeDims(); parts = S.build(st); }
      else {
        parts = S.build(st); st.sa = null;
        if (st.size && S.sw) { st.sa = st.size.W / st.size.H; var f = (S.sh * st.sa) / S.sw; parts.forEach(function (p) { p.m = scaleMesh(p.m, f); }); }
      }
      st.parts = parts.map(function (p) { return { g: upload(p.m), tex: p.tex, mat: p.mat, alpha: p.alpha }; });
      retex();
    }
    function retex() {
      Object.keys(st.tex).forEach(function (k) { gl.deleteTexture(st.tex[k]); }); st.tex = {};
      if (st.shape === 'gusset') {
        var mx = gl.getParameter(gl.MAX_TEXTURE_SIZE), c = document.createElement('canvas'); c.width = mx >= 4096 ? 4096 : 2048; c.height = c.width / 2;
        var hasFace = st.faces.front || st.faces.back || st.faces.left || st.faces.right;
        if (st.art) { var gx = c.getContext('2d'); gx.fillStyle = st.color; gx.fillRect(0, 0, c.width, c.height); gx.drawImage(st.art, 0, 0, c.width, c.height); }
        else if (st.design && st.mode === 'full') c.getContext('2d').drawImage(st.design, 0, 0, c.width, c.height);
        else if (st.design && st.mode === 'front') { var keep = st.faces; st.faces = { front: st.design }; sampleDie(c, st.dims, st.logo); composeDie(c, st); st.faces = keep; }
        else if (st.die) c.getContext('2d').drawImage(st.die, 0, 0, c.width, c.height);
        else { sampleDie(c, st.dims, st.logo); if (hasFace) composeDie(c, st); }
        st.tex.die = texFrom(c); return;
      }
      var faces = st.faces;
      if (st.art) { var aw = st.art.width; faces = { front: { img: st.art, sx: 0, sw: aw / 2 }, back: { img: st.art, sx: aw / 2, sw: aw / 2 } }; }
      else if (st.design) {
        var iw = st.design.naturalWidth || st.design.width;
        if (st.mode === 'pair') { var L = { img: st.design, sx: 0, sw: iw / 2 }, Rr = { img: st.design, sx: iw / 2, sw: iw / 2 }; faces = st.swap ? { front: Rr, back: L } : { front: L, back: Rr }; }
        else faces = { front: { img: st.design, sx: 0, sw: iw } };
      }
      ['front', 'back', 'wrap'].forEach(function (w) { st.tex[w] = texFrom(makeTex(st.shape, w, st.color, st.logo, faces, st.fit, st.sa)); });
    }
    function loadLogo(src) {
      if (!src) { st.logo = null; retex(); return; }
      var im = new Image(); im.onload = function () { if (dead) return; st.logo = prepLogo(im); retex(); }; im.src = src;
    }
    function draw(p, M) {
      gl.uniformMatrix4fv(Un.M, false, M);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.g.p); gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.g.n); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.g.t); gl.vertexAttribPointer(A.t, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.g.i);
      var kraft = st.color.toUpperCase() === '#C8A27A', matte = kraft || st.finish === 'matte';
      if (p.tex) { gl.uniform1f(Un.useTex, 1); gl.bindTexture(gl.TEXTURE_2D, st.tex[p.tex]); gl.uniform1f(Un.alpha, 1); gl.uniform1f(Un.spec, matte ? (kraft ? .05 : .12) : .55); gl.uniform1f(Un.shine, matte ? 12 : 70); }
      else { var m = MAT[p.mat]; gl.uniform1f(Un.useTex, 0); gl.uniform3fv(Un.col, m.col); gl.uniform1f(Un.alpha, m.alpha); gl.uniform1f(Un.spec, m.spec); gl.uniform1f(Un.shine, m.shine); }
      gl.drawElements(gl.TRIANGLES, p.g.c, gl.UNSIGNED_SHORT, 0);
    }
    function frame() {
      if (dead) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
      if (auto && !drag) ty += .0045;
      yaw += (ty - yaw) * .12; pitch += (tp - pitch) * .12;
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
      gl.enableVertexAttribArray(A.p); gl.enableVertexAttribArray(A.n); gl.enableVertexAttribArray(A.t);
      var dist = SH[st.shape].cam, VP = mul(persp(.42, canvas.width / Math.max(canvas.height, 1), .1, 50), trans(0, -.05, -dist));
      gl.uniformMatrix4fv(Un.VP, false, VP); gl.uniform3fv(Un.cam, [0, .05, dist]); gl.uniform1i(Un.tx, 0);
      var M = mul(rotX(pitch), rotY(yaw));
      gl.uniform1f(Un.mode, 2); gl.uniform1f(Un.shadowA, .32 * Math.max(0, Math.cos(pitch * 1.6))); gl.depthMask(false);
      draw({ g: ground, mat: 'cap' }, trans(0, 0, 0)); gl.uniform1f(Un.mode, 0); gl.depthMask(true);
      st.parts.forEach(function (p) { if (!p.alpha) draw(p, M); });
      gl.depthMask(false); st.parts.forEach(function (p) { if (p.alpha) draw(p, M); }); gl.depthMask(true);
      raf = requestAnimationFrame(frame);
    }
    function down(e) { drag = { x: e.clientX, y: e.clientY }; auto = false; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
    function move(e) { if (!drag) return; ty += (e.clientX - drag.x) * .011; tp = clamp(tp + (e.clientY - drag.y) * .009, -1.45, 1.45); drag = { x: e.clientX, y: e.clientY }; }
    function up() { drag = null; canvas.style.cursor = 'grab'; }
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
    build(); loadLogo(opts.logo); frame();
    function nearest(target) { var two = Math.PI * 2; return target + Math.round((ty - target) / two) * two; }
    return {
      setShape: function (s) { if (SH[s] && s !== st.shape) { st.shape = s; build(); } },
      setModel: function (shape, size) {
        if (!SH[shape]) return; st.shape = shape;
        if (size) st.size = { W: clamp(+size.W || 100, 20, 800), H: clamp(+size.H || 150, 20, 1000), G: clamp(+size.G || 0, 0, 300), O: clamp(+size.O || 0, 0, 300), R: clamp(+size.R || 0, 0, 300) };
        classify(); build();
      },
      setDesign: function (src) {
        if (!src) { st.design = null; st.mode = null; if (opts.onInfo) opts.onInfo(null); build(); return; }
        var im = new Image(); im.onload = function () { if (dead) return; st.design = im; classify(); build(); }; im.src = src;
      },
      setSwap: function (b) { st.swap = !!b; retex(); },
      setFinish: function (f) { st.finish = f === 'matte' ? 'matte' : 'gloss'; },
      setArt: function (c) { st.art = c || null; retex(); },
      setFace: function (face, src) {
        if (!src) { delete st.faces[face]; retex(); return; }
        var im = new Image(); im.onload = function () { if (dead) return; st.faces[face] = im; retex(); }; im.src = src;
      },
      clearFaces: function () { st.faces = {}; retex(); },
      setFit: function (m) { st.fit = m === 'contain' ? 'contain' : 'cover'; retex(); },
      snapshot: function () { return canvas.toDataURL('image/png'); },
      setDieline: function (src) { if (!src) { st.die = null; if (st.shape === 'gusset') retex(); return; } var im = new Image(); im.onload = function () { if (dead) return; st.die = im; if (st.shape === 'gusset') retex(); }; im.src = src; },
      setDims: function (d) { var n = { W: +d.W, H: +d.H, F: +d.F, G: +d.G, O: Math.max(0, +d.O || 0) }; if (!(n.W > 0 && n.H > 0 && n.F > 0 && n.G > 0) || n.F + 2 * n.G >= n.W) return false; st.dims = n; if (st.shape === 'gusset') build(); return true; },
      setColor: function (c) { if (c !== st.color) { st.color = c; retex(); } },
      setLogo: function (src) { loadLogo(src); },
      view: function (v) {
        auto = false;
        if (v === 'front') { ty = nearest(0); tp = 0; } else if (v === 'back') { ty = nearest(Math.PI); tp = 0; }
        else if (v === 'top') { tp = 1.2; } else if (v === 'bottom') { tp = -1.2; } else if (v === 'spin') { auto = true; tp = .08; }
      },
      destroy: function () { dead = true; cancelAnimationFrame(raf); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); }
    };
  }


  // ---------- fold-line detection: find the vertical lines / panel edges that run the full height of a dieline ----------
  function foldProfile(img) {
    var W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height, w = Math.min(1600, W0), h = Math.max(8, Math.round(H0 * w / W0));
    var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    var px = x.getImageData(0, 0, w, h).data, e = new Float32Array(w), rows = 0, step = Math.max(1, Math.floor(h / 500)), g = new Float32Array(w);
    for (var y = Math.floor(h * .02); y < h * .98; y += step) {
      rows++; for (var i = 0; i < w; i++) { var p = (y * w + i) * 4; g[i] = .3 * px[p] + .59 * px[p + 1] + .11 * px[p + 2]; }
      for (i = 2; i < w - 2; i++) { var d1 = Math.abs(g[i + 1] - g[i - 1]), d2 = Math.abs(2 * g[i] - g[i - 2] - g[i + 2]) / 2; if (d1 > 26 || d2 > 26) e[i]++; }
    }
    for (i = 0; i < w; i++) e[i] /= rows || 1;
    return { e: e, w: w };
  }
  function detectGusset(img) {
    var P = foldProfile(img), e = P.e, w = P.w, best = null;
    [.72, .55].some(function (th) {
      var pk = [];
      for (var i = 3; i < w - 3; i++) if (e[i] >= th && e[i] >= e[i - 1] && e[i] >= e[i + 1]) {
        if (pk.length && i - pk[pk.length - 1].x <= w * .006) { if (e[i] > pk[pk.length - 1].s) pk[pk.length - 1] = { x: i, s: e[i] }; } else pk.push({ x: i, s: e[i] });
      }
      if (pk.length > 40) pk = pk.sort(function (a, b) { return b.s - a.s; }).slice(0, 40).sort(function (a, b) { return a.x - b.x; });
      var L = [{ x: 0, s: .5, edge: 1 }].concat(pk);
      for (var a2 = 0; a2 < pk.length; a2++) for (var a3 = a2 + 1; a3 < pk.length; a3++) {
        var b2 = pk[a2], b3 = pk[a3], F = b3.x - b2.x; if (F < w * .12) continue;
        for (var a1 = 0; a1 < a2; a1++) {
          var b1 = pk[a1], G = b2.x - b1.x; if (G < F * .08 || G > F * 1.3) continue;
          for (var a4 = a3 + 1; a4 < pk.length; a4++) {
            var b4 = pk[a4], G2 = b4.x - b3.x; if (Math.abs(G2 - G) > w * .025) continue;
            L.forEach(function (sl) {   // back = face width: left back half from the left seal, the rest is on the right, beyond it = right seal/overlap
              if (sl.x >= b1.x || sl.x > w * .15) return;
              var hl = b1.x - sl.x, hr = F - hl, R = w - b4.x - hr;
              if (hl < F * .15 || hl > F * .85 || R < -w * .012 || R > w * .15) return;
              var sc = b1.s + b2.s + b3.s + b4.s + sl.s - 6 * (Math.abs(G2 - G) + .4 * Math.abs(Math.max(R, 0) - sl.x) + .3 * Math.abs(hl - hr)) / w;
              if (!best || sc > best.sc) best = { sc: sc, sL: sl.x / w, b1: b1.x / w, b2: b2.x / w, b3: b3.x / w, b4: b4.x / w, sR: (w - Math.max(R, 0)) / w };
            });
          }
        }
      }
      return !!best;
    });
    return best;
  }

  // ---------- 2D placement editor: the flat bag template where the client drags his artwork ----------
  // flat layout (mm): pouch/chips/flat = [FRONT | BACK]; gusset = [back half | gusset | FRONT | gusset | back half] (wraps round)
  function editor(cv, api, o) {
    o = o || {}; var Lb = o.labels || {}, E = { shape: 'pouch', size: { W: 160, H: 230, G: 0 }, color: '#FFFFFF', layers: [], sel: -1 };
    var flat = document.createElement('canvas'), ptrs = {}, drag = null, pinch = null, guides = [], pend = 0, last = 0, dead = false;
    function dims() { var z = E.size; return { FW: E.shape === 'gusset' ? 2 * z.W + 2 * z.G + (z.O || 0) + (z.R || 0) : 2 * z.W, FH: z.H }; }
    function seal() { return E.shape === 'gusset' ? (E.size.O || 0) : 0; }
    function sealR() { return E.shape === 'gusset' ? (E.size.R || 0) : 0; }
    function period() { return dims().FW - seal() - sealR(); }
    function panels() {
      var z = E.size, d = dims();
      if (E.shape !== 'gusset') return [{ k: 'front', x0: 0, x1: z.W }, { k: 'back', x0: z.W, x1: 2 * z.W }];
      var h = z.W / 2, O = seal(), ps = O > 0 ? [{ k: 'seal', x0: 0, x1: O }] : [];
      var e = d.FW - sealR(), pr = sealR() > 0 ? [{ k: 'seal', x0: e, x1: d.FW }] : [];
      return ps.concat([{ k: 'back', x0: O, x1: O + h }, { k: 'gusset', x0: O + h, x1: O + h + z.G }, { k: 'front', x0: O + h + z.G, x1: O + h + z.G + z.W }, { k: 'gusset', x0: O + h + z.G + z.W, x1: O + h + 2 * z.G + z.W }, { k: 'back', x0: O + h + 2 * z.G + z.W, x1: e }]).concat(pr);
    }
    function wrap() { return E.shape === 'gusset'; }
    function iw(l) { return l.img.naturalWidth || l.img.width; } function ih(l) { return l.img.naturalHeight || l.img.height; }
    function box(l) { var r = (l.rot % 180) ? iw(l) / ih(l) : ih(l) / iw(l); return { w: l.w, h: l.w * r }; }   // displayed size in mm
    function drawLayer(x, l, k, dx) {
      var b = box(l), rw = (l.rot % 180 ? b.h : b.w) * k, rh = (l.rot % 180 ? b.w : b.h) * k;
      x.save(); x.translate((l.cx + (dx || 0)) * k, l.cy * k); x.rotate(l.rot * Math.PI / 180); x.drawImage(l.img, -rw / 2, -rh / 2, rw, rh); x.restore();
    }
    function drawAll(x, k) { var P = period(); E.layers.forEach(function (l) { drawLayer(x, l, k); if (wrap() && box(l).w < P * .98) { drawLayer(x, l, k, -P); drawLayer(x, l, k, P); } }); }   // repeat round the back seam, except full-width layouts
    function compose(res) {
      var d = dims(); flat.width = res; flat.height = Math.max(2, Math.round(res * d.FH / d.FW));
      var x = flat.getContext('2d'); x.clearRect(0, 0, flat.width, flat.height); drawAll(x, res / d.FW); return flat;
    }
    function push(full) {
      if (!api) return;
      if (!E.layers.length) { api.setArt(null); return; }
      var now = Date.now();
      if (!full && now - last < 70) { if (!pend) pend = setTimeout(function () { pend = 0; push(false); }, 75); return; }
      last = now; api.setArt(compose(full ? 2048 : 1024));
    }
    var k = 1, cssW = 0, cssH = 0;
    function render() {
      if (dead) return;
      var d = dims(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = cv.clientWidth || 400; cssH = cssW * d.FH / d.FW; cv.style.height = cssH + 'px';
      var w = Math.round(cssW * dpr), h = Math.round(cssH * dpr); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      k = cssW / d.FW; var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = E.color; x.fillRect(0, 0, cssW, cssH);
      x.save(); x.beginPath(); x.rect(0, 0, cssW, cssH); x.clip(); drawAll(x, k); x.restore();
      if (seal() || sealR()) { x.save(); x.fillStyle = 'rgba(20,31,69,.18)'; x.fillRect(0, 0, seal() * k, cssH); x.fillRect((dims().FW - sealR()) * k, 0, sealR() * k, cssH); x.restore(); }
      // print zones
      var dark = lum(E.color) < .4 && !E.layers.length, ln = dark ? 'rgba(255,255,255,.55)' : 'rgba(42,65,133,.75)';
      x.save(); x.setLineDash([6, 5]); x.strokeStyle = ln; x.lineWidth = 1.2;
      panels().forEach(function (p, i) { if (i) { x.beginPath(); x.moveTo(p.x0 * k, 0); x.lineTo(p.x0 * k, cssH); x.stroke(); } });
      x.setLineDash([3, 4]); x.strokeStyle = 'rgba(163,38,27,.55)';
      var sy = E.shape === 'pouch' ? [.118] : E.shape === 'chips' ? [.1, .9] : E.shape === 'flat' ? [.07, .93] : [.07, .95];
      sy.forEach(function (v) { x.beginPath(); x.moveTo(0, v * cssH); x.lineTo(cssW, v * cssH); x.stroke(); });
      x.restore();
      x.font = '700 11px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'top';
      panels().forEach(function (p) {
        var t = Lb[p.k] || p.k, cx = (p.x0 + p.x1) / 2 * k, tw = x.measureText(t).width + 12; if ((p.x1 - p.x0) * k < tw) return;
        x.fillStyle = 'rgba(20,31,69,.78)'; x.beginPath(); if (x.roundRect) x.roundRect(cx - tw / 2, 6, tw, 18, 9); else x.rect(cx - tw / 2, 6, tw, 18); x.fill();
        x.fillStyle = '#FFFFFF'; x.fillText(t, cx, 10);
      });
      if (!E.layers.length && Lb.empty) {
        var fp = panels().filter(function (p) { return p.k === 'front'; })[0], fx = (fp.x0 + fp.x1) / 2 * k;
        x.fillStyle = dark ? 'rgba(255,255,255,.8)' : 'rgba(20,31,69,.6)'; x.font = '600 13px system-ui, sans-serif'; x.textBaseline = 'middle';
        wrapText(x, Lb.empty, fx, cssH / 2, (fp.x1 - fp.x0) * k - 20, 18);
      }
      x.strokeStyle = 'rgba(20,31,69,.35)'; x.lineWidth = 1; x.setLineDash([]); x.strokeRect(.5, .5, cssW - 1, cssH - 1);
      guides.forEach(function (g) { x.strokeStyle = '#E8912D'; x.lineWidth = 1; x.beginPath(); if (g.x !== undefined) { x.moveTo(g.x * k, 0); x.lineTo(g.x * k, cssH); } else { x.moveTo(0, g.y * k); x.lineTo(cssW, g.y * k); } x.stroke(); });
      var l = E.layers[E.sel];
      if (l) {
        var b = box(l), r = [(l.cx - b.w / 2) * k, (l.cy - b.h / 2) * k, b.w * k, b.h * k];
        x.strokeStyle = '#F5B869'; x.lineWidth = 2; x.strokeRect(r[0], r[1], r[2], r[3]);
        corners(l).forEach(function (c) { x.fillStyle = '#FFFFFF'; x.strokeStyle = '#E8912D'; x.lineWidth = 2; x.fillRect(c.x * k - 6, c.y * k - 6, 12, 12); x.strokeRect(c.x * k - 6, c.y * k - 6, 12, 12); });
      }
    }
    function wrapText(x, s, cx, cy, mw, lh) {
      var words = s.split(' '), lines = [], cur = '';
      words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > mw && cur) { lines.push(cur); cur = w; } else cur = t; }); lines.push(cur);
      lines.forEach(function (t, i) { x.fillText(t, cx, cy + (i - (lines.length - 1) / 2) * lh); });
    }
    function corners(l) { var b = box(l); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (s) { return { x: l.cx + s[0] * b.w / 2, y: l.cy + s[1] * b.h / 2 }; }); }
    function pt(e) { var r = cv.getBoundingClientRect(), d = dims(); return { x: (e.clientX - r.left) / r.width * d.FW, y: (e.clientY - r.top) / r.height * d.FH }; }
    function inside(l, p) { var b = box(l), FW = period(); return [0, -FW, FW].some(function (o) { if (o && !wrap()) return false; return Math.abs(p.x - (l.cx + o)) <= b.w / 2 && Math.abs(p.y - l.cy) <= b.h / 2; }); }
    function nearCx(l, p) { if (!wrap()) return l.cx; var FW = period(); return [l.cx, l.cx - FW, l.cx + FW].sort(function (a, b) { return Math.abs(a - p.x) - Math.abs(b - p.x); })[0]; }
    function notify() {
      var l = E.layers[E.sel], b = l && box(l);
      if (o.onChange) o.onChange({ layers: E.layers.map(function (m, i) { return { thumb: m.src, sel: i === E.sel }; }), sel: E.sel,
        size: b ? { w: Math.round(b.w), h: Math.round(b.h), pct: l.real ? Math.round(100 * b.w / ((l.rot % 180) ? l.real.h : l.real.w)) : null } : null });
    }
    function centres() { var d = dims(), z = E.size, O = seal(); return wrap() ? { front: [O + period() / 2], back: [O, d.FW - sealR()] } : { front: [z.W / 2], back: [z.W * 1.5] }; }
    function anchor(l) {   // where a layer sits, relative to its panel, so it follows the panel when the model or size changes
      var d = dims(), z = E.size;
      if (l.w >= d.FW * .9) return { k: 'all', fx: l.cx / d.FW, fy: l.cy / d.FH, fw: l.w / d.FW };
      var c = centres(), best = null;
      ['front', 'back'].forEach(function (k) { c[k].forEach(function (x) { var dd = Math.abs(l.cx - x); if (!best || dd < best.dd) best = { k: k, x: x, dd: dd }; }); });
      return { k: best.k, dx: (l.cx - best.x) / z.W, fy: l.cy / d.FH, fw: l.w / z.W };
    }
    function unanchor(l, a) {
      var d = dims(), z = E.size;
      if (a.k === 'all') { l.cx = a.fx * d.FW; l.cy = a.fy * d.FH; l.w = a.fw * d.FW; return; }
      var x = centres()[a.k][0]; l.cx = x + a.dx * z.W; l.cy = a.fy * d.FH; l.w = a.fw * z.W;
    }
    function fitTo(l, where, how) {
      var d = dims(), z = E.size, b0 = { w: 1, h: box(l).h / box(l).w }, rx, rw, ry = d.FH / 2, rh = d.FH;
      if (where === 'all') { rx = d.FW / 2; rw = d.FW; }
      else if (where === 'front') { var f = panels().filter(function (p) { return p.k === 'front'; })[0]; rx = (f.x0 + f.x1) / 2; rw = z.W; }
      else { if (wrap()) { rx = seal(); rw = z.W; } else { rx = z.W * 1.5; rw = z.W; } }
      var ra = rw / rh, ia = b0.w / b0.h, close = Math.abs(Math.log(ra / ia)) < .15;
      var cover = how === 'cover' || (how !== 'contain' && close);
      l.w = cover ? Math.max(rw, rh * ia) : Math.min(rw, rh * ia); l.cx = rx; l.cy = ry;
    }
    function snap(l) {
      guides = []; var d = dims(), th = d.FW * .012, xs = [d.FW / 2];
      panels().forEach(function (p) { if (p.k !== 'gusset' && p.k !== 'seal') xs.push((p.x0 + p.x1) / 2); });
      if (wrap()) xs.push(seal(), d.FW - sealR());
      for (var i = 0; i < xs.length; i++) if (Math.abs(l.cx - xs[i]) < th) { l.cx = xs[i]; guides.push({ x: xs[i] }); break; }
      if (Math.abs(l.cy - d.FH / 2) < th) { l.cy = d.FH / 2; guides.push({ y: d.FH / 2 }); }
    }
    function down(e) {
      e.preventDefault(); cv.focus && cv.focus({ preventScroll: true });
      var p = pt(e); ptrs[e.pointerId] = p; try { cv.setPointerCapture(e.pointerId); } catch (er) {}
      var ids = Object.keys(ptrs), l = E.layers[E.sel];
      if (ids.length === 2 && l) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, w: l.w }; drag = null; return; }
      var hk = 14 / k;
      if (l) { var cs = corners(l); for (var i = 0; i < 4; i++) if (Math.abs(p.x - cs[i].x) < hk && Math.abs(p.y - cs[i].y) < hk) { drag = { mode: 'size', w: l.w, d0: Math.hypot(p.x - l.cx, p.y - l.cy) || 1 }; return; } }
      var hit = -1; for (var j = E.layers.length - 1; j >= 0; j--) if (inside(E.layers[j], p)) { hit = j; break; }
      E.sel = hit; notify();
      if (hit >= 0) { var m = E.layers[hit]; m.cx = nearCx(m, p); drag = { mode: 'move', dx: p.x - m.cx, dy: p.y - m.cy }; }
      render();
    }
    function move(e) {
      if (!ptrs[e.pointerId]) return; var p = pt(e); ptrs[e.pointerId] = p; var l = E.layers[E.sel]; if (!l) return;
      if (pinch) { var ids = Object.keys(ptrs); if (ids.length < 2) return; var a = ptrs[ids[0]], b = ptrs[ids[1]]; l.w = clamp(pinch.w * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 5, dims().FW * 4); }
      else if (drag && drag.mode === 'move') { l.cx = p.x - drag.dx; l.cy = p.y - drag.dy; snap(l); }
      else if (drag && drag.mode === 'size') { l.w = clamp(drag.w * Math.hypot(p.x - l.cx, p.y - l.cy) / drag.d0, 5, dims().FW * 4); }
      else return;
      render(); push(false); if (!drag || drag.mode !== 'move') notifySoon();
    }
    function up(e) {
      delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null;
      if (drag || !Object.keys(ptrs).length) { var was = drag; drag = null; guides = []; render(); if (was) { normalize(); push(true); notify(); } }
    }
    function notifySoon() { if (notifySoon.t) return; notifySoon.t = setTimeout(function () { notifySoon.t = 0; notify(); }, 60); }
    // ---- PDF (e.g. exported from Illustrator): read the artboard size in mm and render it ----
    var pdfP = null;
    function pdfLib() {
      if (!pdfP) { var abs = function (u) { return new URL(u, document.baseURI).href; }; pdfP = import(abs(o.pdf.lib)).then(function (m) { m.GlobalWorkerOptions.workerSrc = abs(o.pdf.worker); return m; }); pdfP.catch(function () { pdfP = null; }); }
      return pdfP;
    }
    function loadPdf(file) {
      return file.arrayBuffer().then(function (buf) { return pdfLib().then(function (m) { return m.getDocument({ data: new Uint8Array(buf) }).promise; }); })
        .then(function (doc) { return doc.getPage(1); })
        .then(function (page) {
          var v1 = page.getViewport({ scale: 1 }), mm = 25.4 / 72, sc = Math.min(2600 / Math.max(v1.width, v1.height), 10), vp = page.getViewport({ scale: sc });
          var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          var cx = c.getContext('2d');
          return page.render({ canvas: c, canvasContext: cx, viewport: vp, background: 'rgba(0,0,0,0)' }).promise.then(function () { return { c: c, w: v1.width * mm, h: v1.height * mm }; });
        });
    }
    function thumbOf(c) { var t = document.createElement('canvas'), s = 120 / Math.max(c.width, c.height); t.width = Math.max(1, Math.round(c.width * s)); t.height = Math.max(1, Math.round(c.height * s)); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/png'); }
    function note(n) { if (o.onNote) o.onNote(n); }
    function addLayer(img, src, real) {
      var l = { img: img, src: src, cx: 0, cy: 0, w: 10, rot: 0, real: real || null }, d = dims(), a = iw(l) / ih(l), z = E.size;
      var fp = panels().filter(function (p) { return p.k === 'front'; })[0], fcx = (fp.x0 + fp.x1) / 2;
      var onFront = E.layers.some(function (m) { return Math.abs(m.cx - fcx) < z.W / 2; });
      var det = a > 1.05 ? detectGusset(img) : null;
      if (det) {   // fold lines found: face, gussets, back halves and seal strips come straight from the design
        var T = real ? real.w : z.H * a, Hm = real ? real.h : z.H, r1 = function (v) { return Math.round(v * 10) / 10; };
        var dz = { W: r1((det.b3 - det.b2) * T), G: r1(((det.b2 - det.b1) + (det.b4 - det.b3)) / 2 * T), O: r1(det.sL * T), R: r1((1 - det.sR) * T), H: r1(Hm) };
        var switched = E.shape !== 'gusset';
        E.layers = []; E.shape = 'gusset'; ctl.setModel('gusset', dz); if (o.onSize) o.onSize(Object.assign({ shape: 'gusset' }, dz));
        fitTo(l, 'all', 'cover');
        note({ k: 'fold', w: Math.round(T), h: Math.round(Hm), W: dz.W, H: dz.H, G: dz.G, O: dz.O, R: dz.R, back: r1(((det.b1 - det.sL) + (det.sR - det.b4)) * T), switched: switched, pdf: !!real });
      } else if (real) {   // PDF: the bag adapts to the artboard size, then the artwork fills it exactly
        var LIMS = o.limits || { W: [30, 600], H: [30, 800], G: [10, 200] }, cl = function (k, v) { return Math.round(clamp(v, LIMS[k][0], LIMS[k][1])); };
        var portrait = real.w < real.h * .9, G = E.shape === 'gusset' ? (z.G || 45) : 0, nz, where;
        if (E.shape === 'gusset') {
          if (portrait) { nz = { W: cl('W', real.w), H: cl('H', real.h), G: G, O: z.O || 0 }; where = 'front'; }
          else {
            var base = 2 * z.W + 2 * G; where = 'all';
            if (real.w >= base - 3 && real.w <= base + 60) nz = { W: z.W, H: cl('H', real.h), G: G, O: Math.max(0, Math.round(real.w - base)) };   // extra = seal strip
            else { if (real.w - 2 * G < 60) G = cl('G', real.w * .15); nz = { W: cl('W', (real.w - 2 * G) / 2), H: cl('H', real.h), G: G, O: 0 }; }
          }
        } else if (portrait) { nz = { W: cl('W', real.w), H: cl('H', real.h), G: 0 }; where = 'front'; }
        else { nz = { W: cl('W', real.w / 2), H: cl('H', real.h), G: 0 }; where = 'all'; }
        var onK = function (k) { return E.layers.some(function (m) { return anchor(m).k === k; }); };
        if (where === 'front' && onK('front') && !onK('back') && Math.abs(real.w - z.W) <= 3 && Math.abs(real.h - z.H) <= 3) { where = 'back'; nz = { W: z.W, H: z.H, G: z.G || nz.G, O: z.O || 0 }; }
        E.layers = E.layers.filter(function (m) { var k = anchor(m).k; return where !== 'all' && k !== where && k !== 'all'; });
        var clamped = where === 'all' ? Math.abs((E.shape === 'gusset' ? 2 * nz.W + 2 * nz.G + (nz.O || 0) : 2 * nz.W) - real.w) > 2 || Math.abs(nz.H - real.h) > 2
                                      : Math.abs(nz.W - real.w) > 2 || Math.abs(nz.H - real.h) > 2;
        ctl.setModel(E.shape, nz); if (o.onSize) o.onSize(nz);
        fitTo(l, where, 'cover');
        note({ k: 'pdf', w: Math.round(real.w), h: Math.round(real.h), W: nz.W, H: nz.H, G: nz.G, O: nz.O || 0, gusset: E.shape === 'gusset', where: where, clamped: clamped });
      } else {
        if (Math.abs(Math.log(a / (d.FW / d.FH))) < .15) fitTo(l, 'all', 'cover');
        else fitTo(l, onFront && E.layers.length === 1 ? 'back' : 'front', 'cover');
        note(null);
      }
      E.layers.push(l); E.sel = E.layers.length - 1; notify(); render(); push(true);
    }
    function normalize() { if (!wrap()) return; var P = period(), O = seal(); E.layers.forEach(function (l) { while (l.cx < O - P / 2) l.cx += P; while (l.cx > O + P * 1.5) l.cx -= P; }); }
    function wheel(e) { var l = E.layers[E.sel]; if (!l) return; e.preventDefault(); l.w = clamp(l.w * Math.exp(-e.deltaY * .0012), 5, dims().FW * 4); render(); push(false); notifySoon(); clearTimeout(wheel.t); wheel.t = setTimeout(function () { push(true); }, 200); }
    function key(e) {
      var l = E.layers[E.sel]; if (!l) return; var s = e.shiftKey ? 10 : 1, used = true;
      if (e.key === 'ArrowLeft') l.cx -= s; else if (e.key === 'ArrowRight') l.cx += s; else if (e.key === 'ArrowUp') l.cy -= s; else if (e.key === 'ArrowDown') l.cy += s;
      else if (e.key === '+' || e.key === '=') l.w *= 1.05; else if (e.key === '-') l.w /= 1.05;
      else if (e.key === 'Delete' || e.key === 'Backspace') { ctl.remove(E.sel); return e.preventDefault(); } else used = false;
      if (used) { e.preventDefault(); render(); notify(); push(true); }
    }
    function readFile(file, cb) { if (!file || !/^image\//.test(file.type)) return; var r = new FileReader(); r.onload = function () { cb(r.result); }; r.readAsDataURL(file); }
    function dropOn(el) {
      el.addEventListener('dragover', function (e) { e.preventDefault(); });
      el.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; ctl.addFile(f); });
    }
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('keydown', key);
    cv.style.touchAction = 'none'; cv.style.cursor = 'move'; if (!cv.hasAttribute('tabindex')) cv.setAttribute('tabindex', '0');
    dropOn(cv); if (o.dropTarget) dropOn(o.dropTarget);
    var ro = window.ResizeObserver ? new ResizeObserver(function () { render(); }) : null; if (ro) ro.observe(cv); else window.addEventListener('resize', render);
    var ctl = {
      setModel: function (shape, size) {
        var od = dims(), anc = E.layers.map(anchor); E.shape = shape; E.size = { W: +size.W, H: +size.H, G: shape === 'gusset' ? +size.G : 0, O: shape === 'gusset' ? (+size.O || 0) : 0, R: shape === 'gusset' ? (+size.R || 0) : 0 };
        E.layers.forEach(function (l, i) { unanchor(l, anc[i]); });
        if (api) api.setModel(shape, E.size); render(); notify(); push(true);
      },
      add: function (src) { var im = new Image(); im.onload = function () { if (!dead) addLayer(im, src, null); }; im.src = src; },
      addFile: function (file) {
        if (!file) return;
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
          if (!o.pdf) { note({ k: 'error' }); return; }
          note({ k: 'reading' });
          loadPdf(file).then(function (r) { if (!dead) addLayer(r.c, thumbOf(r.c), { w: r.w, h: r.h }); }, function (er) { if (window.console) console.warn('PDF', er); note({ k: 'error' }); });
          return;
        }
        readFile(file, function (src) { ctl.add(src); });
      },
      realSize: function () { var l = E.layers[E.sel]; if (!l || !l.real) return; l.w = (l.rot % 180) ? l.real.h : l.real.w; render(); notify(); push(true); },
      select: function (i) { E.sel = i >= 0 && i < E.layers.length ? i : -1; notify(); render(); },
      remove: function (i) { if (i === undefined) i = E.sel; if (i < 0 || i >= E.layers.length) return; E.layers.splice(i, 1); E.sel = E.layers.length ? Math.min(i, E.layers.length - 1) : -1; notify(); render(); push(true); },
      place: function (where) { var l = E.layers[E.sel]; if (!l) return; fitTo(l, where); render(); notify(); push(true); },
      zoom: function (f) { var l = E.layers[E.sel]; if (!l) return; l.w = clamp(l.w * f, 5, dims().FW * 4); render(); notify(); push(true); },
      setWidth: function (mm) { var l = E.layers[E.sel]; mm = +mm; if (!l || !(mm >= 5 && mm <= dims().FW * 4)) return false; l.w = mm; render(); notify(); push(true); return true; },
      rotate: function () { var l = E.layers[E.sel]; if (!l) return; var h = box(l).h; l.rot = (l.rot + 90) % 360; l.w = h; render(); notify(); push(true); },
      forward: function () { var l = E.layers[E.sel]; if (!l) return; E.layers.splice(E.sel, 1); E.layers.push(l); E.sel = E.layers.length - 1; notify(); render(); push(true); },
      setColor: function (c) { E.color = c; if (api) api.setColor(c); render(); },
      setLabels: function (lb) { Lb = lb || {}; render(); },
      template: function () {   // blank flat template with fold lines, for the client's designer
        var d = dims(), res = 2400, c = document.createElement('canvas'), kk = res / d.FW; c.width = res; c.height = Math.round(res * d.FH / d.FW);
        var x = c.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height);
        x.strokeStyle = '#2A4185'; x.lineWidth = 3; x.setLineDash([18, 12]);
        panels().forEach(function (p, i) { if (i) { x.beginPath(); x.moveTo(p.x0 * kk, 0); x.lineTo(p.x0 * kk, c.height); x.stroke(); } });
        x.setLineDash([]); x.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
        x.fillStyle = '#2A4185'; x.font = '700 34px sans-serif'; x.textAlign = 'center';
        panels().forEach(function (p) { x.fillText((Lb[p.k] || p.k) + '  ' + Math.round(p.x1 - p.x0) + ' mm', (p.x0 + p.x1) / 2 * kk, 60); });
        x.fillText(Math.round(d.FW) + ' × ' + Math.round(d.FH) + ' mm', c.width / 2, c.height - 40);
        return c.toDataURL('image/png');
      },
      count: function () { return E.layers.length; },
      destroy: function () { dead = true; if (ro) ro.disconnect(); cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('wheel', wheel); cv.removeEventListener('keydown', key); }
    };
    render(); return ctl;
  }
  window.HN3D = { mount: mount, editor: editor, detectGusset: detectGusset };
})();
