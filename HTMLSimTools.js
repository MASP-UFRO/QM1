/* ============================================================
   HTMLSimTools.js
   Herramientas compartidas por las simulaciones HTML.
   Se carga con UNA sola línea, dentro del <head> del HTML:
     <script src=".../HTMLSimTools.js?v=1"></script>
   Este archivo carga solo HTMLSimStyle.css (debe estar en la misma carpeta
   y se le aplica el mismo ?v=).
   Si cambias algo aquí o en el CSS, sube el número ?v= en los HTML.

   Expone un único objeto global: HTMLSim
     HTMLSim.CFG, HTMLSim.getFont()
     Física:   kOf, RT, coefficients, cmul, cdiv, cexp, cscale, cabs2
               cOf, boundStates  (caso b: estados ligados)
     Dibujo:   sizeFor, ensureSize, drawText, niceStep, fmtTick
     Controles: bindPair, getNum, setPair
     Fuentes:  onFontsReady(fn)   -> vuelve a dibujar cuando llega la tipografía
   Además avisa la altura al iframe de Moodle (renderSimulation) por sí solo.
   ============================================================ */
(function (global) {
	'use strict';

	/* Carga automática de HTMLSimStyle.css (misma carpeta y mismo ?v= que este archivo).
	   document.write en el <head> hace que la página espere al CSS: sin parpadeo. */
	(function () {
		var s = document.currentScript;
		if (!s || !s.src) { return; }
		var href = s.src.replace(/[^\/?]*\.js(\?|$)/, 'HTMLSimStyle.css$1');
		if (document.querySelector('link[href="' + href + '"]')) { return; }
		if (document.readyState === 'loading') {
			document.write('<link rel="stylesheet" href="' + href + '">');
		} else {
			var l = document.createElement('link');
			l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
		}
	})();

	/* ============================================================
	   Constantes físicas (electrón). Energías en eV, longitudes en Å.
	   k = sqrt(2 m c^2 * E) / (hbar c)
	   ============================================================ */
	// Ajuste: ancho máximo del gráfico (px). Aumentar para aprovechar un Moodle muy ancho.
	var CFG = { plotMaxWidth: 1250 };

	// Tipografía: se lee de --font (CSS) la primera vez que se necesita
	var FONT_FALLBACK = '"Segoe UI", Arial, sans-serif', fontCache = '';
	function getFont() {
		if (!fontCache) {
			fontCache = (window.getComputedStyle(document.documentElement).getPropertyValue('--font') || '').trim();
		}
		return fontCache || FONT_FALLBACK;
	}
	var MC2   = 0.511e6;        // eV  (energía en reposo del electrón)
	var HBARC = 1973.269804;    // eV·Å

	function kOf(energyEV) { return Math.sqrt(2 * MC2 * energyEV) / HBARC; }  // Å^-1

	/* ============================================================
	   Números complejos mínimos: [re, im]
	   ============================================================ */
	function cmul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
	function cdiv(a, b) {
		var d = b[0] * b[0] + b[1] * b[1];
		return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
	}
	function cexp(theta) { return [Math.cos(theta), Math.sin(theta)]; }   // e^{i theta}
	function cscale(a, s) { return [a[0] * s, a[1] * s]; }
	function cabs2(a) { return a[0] * a[0] + a[1] * a[1]; }

	/* ============================================================
	   Resultados analíticos
	   ============================================================ */

	// R y T en función de los parámetros reducidos (eta, Lambda)
	function RT(eta, lam) {
		var den = 8 * eta * (eta - 1) - Math.cos(4 * Math.PI * lam) + 1;
		var s = Math.sin(2 * Math.PI * lam);
		return [2 * s * s / den, 8 * eta * (eta - 1) / den];
	}

	// Coeficientes de las ondas (con A1 = 1) para eta, L (Å), dV (eV)
	function coefficients(eta, L, dV) {
		var q = kOf(eta * dV);          // k_in
		var k = kOf((eta - 1) * dV);    // k_out
		var e2 = cexp(2 * q * L);
		var dm = (q - k) * (q - k), dp = (q + k) * (q + k);
		var den = [dm * e2[0] - dp, dm * e2[1]];
		var numR = cscale(cmul([e2[0] - 1, e2[1]], cexp(-k * L)), k * k - q * q);
		var B1 = cdiv(numR, den);
		var A3 = cdiv(cmul([-4 * q * k, 0], cexp((q - k) * L)), den);
		// empalme en x = +L/2
		var A2 = cscale(cmul(A3, cexp((k - q) * L / 2)), (q + k) / (2 * q));
		var B2 = cscale(cmul(A3, cexp((k + q) * L / 2)), (q - k) / (2 * q));
		return { q: q, k: k, B1: B1, A2: A2, B2: B2, A3: A3 };
	}

	/* ============================================================
	   Caso (b): estados ligados  (V_in < E < V_out)
	   c = (L/2) sqrt(2 m dV) / hbar            (adimensional)
	   Los eta_n salen de  phi_n + c sin(phi_n) = n pi/2,  eta_n = sin^2(phi_n),
	   con n = 1 ... ceil(2c/pi).  n impar -> función par;  n par -> impar.
	   Devuelve { c, nbnd, states: [ {n, phi, eta, dE, par}, ... ] }  (dE en eV, medida desde V_in)
	   ============================================================ */
	function cOf(L, dV) { return (L / 2) * kOf(dV); }

	function boundStates(L, dV) {
		var c = cOf(L, dV), nb = Math.ceil(2 * c / Math.PI), states = [], n, lo, hi, mid, it, f, phi, eta;
		for (n = 1; n <= nb; n++) {
			f = function (p) { return p + c * Math.sin(p) - n * Math.PI / 2; };   // creciente en [0, pi/2]
			if (f(Math.PI / 2) <= 0) { continue; }                                 // n = 2c/pi exacto: E = V_out, no es ligado
			lo = 0; hi = Math.PI / 2;
			for (it = 0; it < 60; it++) {
				mid = (lo + hi) / 2;
				if (f(mid) < 0) { lo = mid; } else { hi = mid; }
			}
			phi = (lo + hi) / 2;
			eta = Math.sin(phi) * Math.sin(phi);
			states.push({ n: n, phi: phi, eta: eta, dE: eta * dV, par: (n % 2 === 1) });
		}
		return { c: c, nbnd: states.length, states: states };
	}

	/* ============================================================
	   Utilidades de dibujo
	   ============================================================ */
	function sizeFor(cv, ratio, minH, maxH) {
		var p = cv.parentElement, cs = window.getComputedStyle(p);
		var avail = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 6;
		var w = Math.max(300, Math.min(CFG.plotMaxWidth, Math.floor(avail)));
		var h = Math.round(Math.max(minH, Math.min(maxH, w * ratio)));
		return [w, h];
	}

	// Ajusta el tamaño del canvas al espacio disponible (nítido en pantallas de alta densidad)
	function ensureSize(S, cv, ratio, minH, maxH) {
		var d = sizeFor(cv, ratio, minH, maxH);
		if (S.ctx && S.w === d[0] && S.h === d[1]) { return; }
		var dpr = Math.min(window.devicePixelRatio || 1, 3);
		cv.width = Math.round(d[0] * dpr);
		cv.height = Math.round(d[1] * dpr);
		cv.style.width = d[0] + 'px';
		cv.style.height = d[1] + 'px';
		S.ctx = cv.getContext('2d');
		S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		S.w = d[0]; S.h = d[1];
	}

	// Texto con subíndices: "V_out", "k_{in}", "lambda_dB"; align: 'left' | 'center' | 'right'
	function drawText(ctx, str, x, y, size, align, color, weight) {
		var parts = str.split(/(_\{[^}]*\}|_[A-Za-z0-9]+)/).filter(function (p) { return p.length; });
		var font = (weight || 'normal') + ' ';
		var segs = [], total = 0, i, p, sub, t, fs, w;
		for (i = 0; i < parts.length; i++) {
			p = parts[i];
			sub = p.charAt(0) === '_';
			t = sub ? p.replace(/^_\{?|\}$/g, '') : p;
			fs = sub ? size * 0.72 : size;
			ctx.font = font + fs + 'px ' + getFont();
			w = ctx.measureText(t).width;
			segs.push({ t: t, sub: sub, fs: fs, w: w });
			total += w;
		}
		var x0 = align === 'center' ? x - total / 2 : (align === 'right' ? x - total : x);
		ctx.fillStyle = color || '#333';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		for (i = 0; i < segs.length; i++) {
			ctx.font = font + segs[i].fs + 'px ' + getFont();
			ctx.fillText(segs[i].t, x0, y + (segs[i].sub ? size * 0.22 : 0));
			x0 += segs[i].w;
		}
	}

	// Paso "bonito" para los ticks
	function niceStep(range, target) {
		var raw = range / target, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
		var f = raw / mag, s = f < 1.5 ? 1 : (f < 3.5 ? 2 : (f < 7.5 ? 5 : 10));
		return s * mag;
	}

	function fmtTick(v) {
		var r = Math.round(v * 1000) / 1000;
		return (r === 0 ? 0 : r).toString();
	}

	/* ============================================================
	   Vincular deslizador + campo numérico
	   ============================================================ */
	function bindPair(numEl, rangeEl, onChange) {
		function clamp(v) {
			var lo = parseFloat(numEl.min), hi = parseFloat(numEl.max);
			return Math.min(hi, Math.max(lo, v));
		}
		rangeEl.addEventListener('input', function () {
			numEl.value = rangeEl.value;
			onChange();
		});
		numEl.addEventListener('input', function () {
			var v = parseFloat(numEl.value);
			if (isNaN(v)) { return; }
			rangeEl.value = clamp(v);
			onChange();
		});
		numEl.addEventListener('change', function () {
			var v = parseFloat(numEl.value);
			if (isNaN(v)) { v = parseFloat(rangeEl.defaultValue); }
			v = clamp(v);
			numEl.value = v;
			rangeEl.value = v;
			onChange();
		});
	}

	function getNum(el, fallback) {
		var v = parseFloat(el.value);
		if (isNaN(v)) { v = fallback; }
		return Math.min(parseFloat(el.max), Math.max(parseFloat(el.min), v));
	}

	function setPair(numEl, rangeEl, v) { numEl.value = v; rangeEl.value = v; }

	/* ============================================================
	   Redibujar cuando la tipografía termina de cargar
	   (evita que los títulos cambien de fuente después)
	   ============================================================ */
	function onFontsReady(fn) {
		if (!document.fonts) { return; }
		var redraw = function () { fn(); };
		if (document.fonts.load) {
			Promise.all([document.fonts.load('400 16px ' + getFont()), document.fonts.load('700 16px ' + getFont())])
				.then(redraw, redraw);
		}
		if (document.fonts.ready) { document.fonts.ready.then(redraw); }
	}

	/* ============================================================
	   Aviso de altura al contenedor (iframe de Moodle).
	   Envía la altura del contenido con postMessage para que
	   renderSimulation ajuste el iframe y no se recorte nada.
	   Si la página se abre sola, no hace nada.
	   ============================================================ */
	(function () {
		if (window.parent === window) { return; }
		var last = 0, pending = false;
		function send() {
			pending = false;
			if (!document.body) { return; }
			var h = Math.ceil(document.body.getBoundingClientRect().height);
			if (Math.abs(h - last) < 2) { return; }
			last = h;
			window.parent.postMessage({ type: 'sim-resize', height: h }, '*');
		}
		function schedule() {
			if (pending) { return; }
			pending = true;
			window.setTimeout(send, 30);
		}
		window.addEventListener('load', schedule);
		window.addEventListener('resize', schedule);
		// el script se carga en el <head>: el <body> aún no existe, hay que esperarlo
		function start() {
			if (window.ResizeObserver && document.body) { new ResizeObserver(schedule).observe(document.body); }
			schedule();
		}
		if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); }
		else { start(); }
	})();

	global.HTMLSim = {
		CFG: CFG, getFont: getFont,
		kOf: kOf, RT: RT, coefficients: coefficients, cOf: cOf, boundStates: boundStates,
		cmul: cmul, cdiv: cdiv, cexp: cexp, cscale: cscale, cabs2: cabs2,
		sizeFor: sizeFor, ensureSize: ensureSize, drawText: drawText,
		niceStep: niceStep, fmtTick: fmtTick,
		bindPair: bindPair, getNum: getNum, setPair: setPair,
		onFontsReady: onFontsReady
	};
})(window);
