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
    settingsKey: entry.settingsKey == null ? '' : String(entry.settingsKey),
    levelKey: entry.levelKey == null ? '' : String(entry.levelKey),
    levelLabelKey: entry.levelLabelKey == null ? '' : String(entry.levelLabelKey),
    levels: Array.isArray(entry.levels) ? entry.levels.map(level => Object.freeze({
      value: String(level?.value || ''),
      labelKey: String(level?.labelKey || ''),
      label: String(level?.label || level?.value || '')
    })).filter(level => level.value) : Object.freeze([]),
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




// First real Experimental feature. The renderer itself lives in MAIN world;
// this registry only tells the panel how to present and persist the toggle.
api.register({
  id: 'aurora-borealis',
  settingsKey: 'experimentalAurora',
  levelKey: 'experimentalAuroraLevel',
  levelLabelKey: 'experimentalAuroraQuality',
  levels: [
    { value: 'low', labelKey: 'experimentalAuroraLow', label: 'Low' },
    { value: 'medium', labelKey: 'experimentalAuroraMedium', label: 'Medium' },
    { value: 'high', labelKey: 'experimentalAuroraHigh', label: 'High' }
  ],
  title: 'Aurora Borealis',
  titleKey: 'experimentalAuroraTitle',
  descriptionKey: 'experimentalAuroraDesc',
  icon: '🌌',
  badge: 'EXPERIMENTAL',
  order: 10
});



api.register({
  id: 'interactive-vegetation',
  settingsKey: 'experimentalInteractiveVegetation',
  levelKey: 'experimentalInteractiveVegetationLevel',
  levelLabelKey: 'experimentalInteractiveVegetationQuality',
  levels: [
    { value: 'low', labelKey: 'experimentalInteractiveVegetationLow', label: 'Low' },
    { value: 'medium', labelKey: 'experimentalInteractiveVegetationMedium', label: 'Medium' },
    { value: 'high', labelKey: 'experimentalInteractiveVegetationHigh', label: 'High' },
    { value: 'extreme', labelKey: 'experimentalInteractiveVegetationExtreme', label: 'Extreme' }
  ],
  title: '3D Grass Physics',
  titleKey: 'experimentalInteractiveVegetationTitle',
  descriptionKey: 'experimentalInteractiveVegetationDesc',
  icon: '🌾',
  badge: 'EXPERIMENTAL',
  order: 18
});

api.register({
  id: 'natural-grass-details',
  settingsKey: 'experimentalGrassFlowers',
  title: 'Natural Grass Details',
  titleKey: 'experimentalGrassFlowersTitle',
  descriptionKey: 'experimentalGrassFlowersDesc',
  icon: '🌼',
  badge: 'EXPERIMENTAL',
  order: 20
});




api.register({
  id: 'better-animation-cape',
  settingsKey: 'experimentalBetterAnimationCape',
  title: 'Better Animation Cape',
  titleKey: 'experimentalBetterAnimationCapeTitle',
  descriptionKey: 'experimentalBetterAnimationCapeDesc',
  icon: '🧥',
  badge: 'EXPERIMENTAL',
  order: 25
});

api.register({
  id: 'animated-items',
  settingsKey: 'experimentalAnimatedItems',
  title: 'Animated Items',
  titleKey: 'experimentalAnimatedItemsTitle',
  descriptionKey: 'experimentalAnimatedItemsDesc',
  icon: '✨',
  badge: 'EXPERIMENTAL',
  order: 30
});
})();
