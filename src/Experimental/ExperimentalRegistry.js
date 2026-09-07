(function(){
'use strict';

if (globalThis.MF_ExperimentalRegistry) return;

const experiments = new Map();

function normalize(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id || '').trim();
  if (!id) return null;
  return Object.freeze({
    id,
    title: String(entry.title || id),
    titleKey: entry.titleKey == null ? '' : String(entry.titleKey),
    description: String(entry.description || ''),
    descriptionKey: entry.descriptionKey == null ? '' : String(entry.descriptionKey),
    icon: String(entry.icon || '🧪'),
    badge: entry.badge == null ? '' : String(entry.badge),
    status: entry.status == null ? '' : String(entry.status),
    statusKey: entry.statusKey == null ? '' : String(entry.statusKey),
    order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 100
  });
}

function emitChanged() {
  try { window.dispatchEvent(new CustomEvent('minifeather:experimental-registry-changed')); } catch (_) {}
}

const api = Object.freeze({
  register(entry) {
    const normalized = normalize(entry);
    if (!normalized) return false;
    experiments.set(normalized.id, normalized);
    emitChanged();
    return true;
  },
  unregister(id) {
    const removed = experiments.delete(String(id || ''));
    if (removed) emitChanged();
    return removed;
  },
  get(id) {
    return experiments.get(String(id || '')) || null;
  },
  list() {
    return Array.from(experiments.values()).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }
});

globalThis.MF_ExperimentalRegistry = api;

// Built-in marker: this is infrastructure, not a gameplay experiment.
api.register({
  id: 'experimental-core',
  title: 'Experimental Core',
  titleKey: 'experimentalCoreTitle',
  description: '',
  descriptionKey: 'experimentalCoreDesc',
  icon: '🧪',
  badge: 'CORE',
  status: '',
  statusKey: 'experimentalCoreStatus',
  order: 0
});
})();
