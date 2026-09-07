// FeatherLite — metas base (ISOLATED, document_start)
// pasa chrome.runtime.getURL a MAIN world vía meta tags (mismo patrón del
// cliente completo). MF_Facial lee mf-skins-base para cargar los packs.
try {
    if (document.documentElement) {
        const m = document.createElement('meta');
        m.name = 'mf-skins-base';
        m.content = chrome.runtime.getURL('skins/');
        document.documentElement.appendChild(m);
    }
} catch (_) {}
