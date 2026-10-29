/*
 * InteractiveHTML.js
 *
 * renderSimulation(simUrl, containerId, simHeight = '1000px', maxWidth = '1000px')
 *
 *  - simUrl      : URL del HTML de la simulación (p. ej. en GitHub Pages).
 *  - containerId : id del elemento de Moodle donde se inserta el iframe.
 *  - simHeight   : altura inicial (y definitiva para simulaciones antiguas).
 *  - maxWidth    : ancho máximo del iframe (p. ej. '1400px' en un Moodle ancho).
 *
 * Las simulaciones nuevas avisan su altura con postMessage({type:'sim-resize', height}),
 * y el iframe se ajusta solo. Las antiguas no avisan: conservan simHeight, como antes.
 */
(function () {
	var frames = [];
	var listening = false;

	function onMessage(event) {
		var data = event.data;
		if (!data || data.type !== 'sim-resize') return;
		var h = Number(data.height);
		if (!isFinite(h) || h <= 0) return;
		for (var i = 0; i < frames.length; i++) {
			var f = frames[i];
			if (!f.isConnected) continue;
			if (f.contentWindow === event.source) {
				f.style.setProperty('height', h + 'px', 'important');
				f.style.setProperty('min-height', h + 'px', 'important');
			}
		}
	}

	window.renderSimulation = function (simUrl, containerId, simHeight = '1000px', maxWidth = '1000px') {
		const container = document.getElementById(containerId);
		if (!container) return;

		container.innerHTML = `
		<p></p>
		<!-- /** 
		<h3 style="text-align: center;"><strong>Título de ejemplo</strong></h3>
		<p style="text-align: center;">Subtítulo de ejemplo: </p>
		*/ -->
		<div style="width: 100%; text-align: center;">
				<iframe 
						src="${simUrl}" 
						style="width: 100%; max-width: ${maxWidth}; height: ${simHeight} !important; min-height: ${simHeight} !important; max-height: none !important; border: 1px solid #ccc; border-radius: 8px; overflow: hidden;" 
						scrolling="no" 
						allowfullscreen="true">
				</iframe>
		</div>
		<p><br /><br /></p>
	`;

		var iframe = container.querySelector('iframe');
		frames = frames.filter(function (f) { return f.isConnected; });
		if (iframe) frames.push(iframe);
		if (!listening) {
			window.addEventListener('message', onMessage);
			listening = true;
		}
	};
})();
