// 1. THE HTML PHONEBOOK
// Each entry is either:
//   { type: "github", url: "https://username.github.io/repo/path/file.html" }
//   { type: "drive",  id: "GOOGLE_FILE_ID" }

const htmlRegistry = {
  "QM1_PozoFinito_A":    { type: "github", url: "https://masp-ufro.github.io/QM1/PozoFinito_A.html" },
  "QM1_PozoFinito_B":    { type: "github", url: "https://masp-ufro.github.io/QM1/PozoFinito_B.html" },
};
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxO_3k0Sc6uvuxKBsD-0Bxl1orNDKoxXmrXYo0sdjvgOwhZsuEEsNpjeSb7ZHtdVwwRdw/exec';

// 2. THE RENDER FUNCTION
function renderDriveHtmlSnippet(htmlKey) {
  const targetId = `html-contained-${htmlKey}`;
  const container = document.getElementById(targetId);

  if (!container) {
    console.error(`Error: Moodle is missing the <div id="${targetId}"></div>`);
    return;
  }

  const entry = htmlRegistry[htmlKey];

  if (!entry) {
    container.innerHTML = `<p style="color:red;">Error: HTML "${htmlKey}" no registrado.</p>`;
    return;
  }

  // Drive: cache for the session, no expiry
  if (entry.type === "drive") {
    const cacheKey = `moodle_html_${htmlKey}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      container.innerHTML = cached;
      return;
    }
  }

  container.innerHTML = `<p style="text-align:center;color:#666;font-style:italic;">Cargando contenido...</p>`;

  const fetchUrl = entry.type === "github"
    ? entry.url
    : `${APPS_SCRIPT_URL}?id=${entry.id}`;

  // GitHub: bypass browser HTTP cache. Drive: normal fetch.
  const fetchOptions = entry.type === "github" ? { cache: "no-cache" } : {};

  fetch(fetchUrl, fetchOptions)
    .then(r => r.text())
    .then(html => {
      if (entry.type === "drive") {
        sessionStorage.setItem(`moodle_html_${htmlKey}`, html);
      }
      container.innerHTML = html;
    })
    .catch(err => {
      console.error(`Error fetching "${htmlKey}":`, err);
      container.innerHTML = `<p style="color:red;">Error cargando las instrucciones.</p>`;
    });
}
