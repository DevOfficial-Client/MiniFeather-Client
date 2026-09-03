(function () {
  'use strict';

  const KEY = '__MINIFEATHER_MAIN_I18N__';
  const EVENT = 'minifeather:language-config';

  try {
    globalThis[KEY]?.destroy?.();
  } catch (_) {}

  const state = {
    language: 'en',
    entries: new Map(),
    exact: new Map(),
    templates: [],
    inline: [],
    inlineTemplates: [],
    observer: null,
    originals: {
      alert: globalThis.alert,
      confirm: globalThis.confirm,
      prompt: globalThis.prompt
    }
  };

  function format(value, vars) {
    return String(value ?? '').replace(/\{(\w+)\}/g, (_, key) => key in vars ? String(vars[key]) : '');
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function compileTemplate(value) {
    const names = [];
    let pattern = '';
    let index = 0;
    const source = String(value || '');
    for (const match of source.matchAll(/\{(\w+)\}/g)) {
      pattern += escapeRegex(source.slice(index, match.index));
      pattern += '(.+?)';
      names.push(match[1]);
      index = match.index + match[0].length;
    }
    pattern += escapeRegex(source.slice(index));
    return names.length ? { regex: new RegExp(`^${pattern}$`), names } : null;
  }

  function rebuild() {
    state.exact.clear();
    state.templates.length = 0;
    state.inline.length = 0;
    state.inlineTemplates.length = 0;

    for (const [key, values] of state.entries) {
      for (const value of Object.values(values)) {
        if (typeof value !== 'string' || !value) continue;
        const compiled = compileTemplate(value);
        if (compiled) {
          state.templates.push({ key, ...compiled });
          if (!/\{\w+\}$/.test(value)) {
            state.inlineTemplates.push({
              key,
              names: compiled.names,
              regex: new RegExp(compiled.regex.source.slice(1, -1), 'g')
            });
          }
        } else {
          state.exact.set(value, key);
          if (value.length >= 4) state.inline.push({ key, value });
        }
      }
    }
    state.inline.sort((a, b) => b.value.length - a.value.length);
  }

  function register(entries) {
    if (!entries || typeof entries !== 'object') return;
    for (const [key, values] of Object.entries(entries)) {
      if (!values || typeof values !== 'object') continue;
      state.entries.set(key, { ...values });
    }
    rebuild();
    translateDocument();
  }

  function translateCore(value) {
    if (!value) return value;

    for (const prefix of ['⚠ ', '❌ ', '✅ ']) {
      if (!value.startsWith(prefix)) continue;
      const rest = value.slice(prefix.length);
      const translatedRest = translateCore(rest);
      if (translatedRest !== rest) return prefix + translatedRest;
    }

    const exactKey = state.exact.get(value);
    if (exactKey) {
      const values = state.entries.get(exactKey) || {};
      return values[state.language] ?? values.en ?? value;
    }

    for (const template of state.templates) {
      const match = value.match(template.regex);
      if (!match) continue;
      const vars = {};
      template.names.forEach((name, index) => {
        vars[name] = match[index + 1];
      });
      const values = state.entries.get(template.key) || {};
      return format(values[state.language] ?? values.en ?? value, vars);
    }

    return value;
  }

  function translate(value) {
    if (typeof value !== 'string' || !value) return value;
    const leading = value.match(/^\s*/)?.[0] || '';
    const trailing = value.match(/\s*$/)?.[0] || '';
    const end = trailing.length ? value.length - trailing.length : value.length;
    const core = value.slice(leading.length, end);
    const translated = translateCore(core);
    return translated === core ? value : leading + translated + trailing;
  }


  function translateInline(value) {
    if (typeof value !== 'string' || !value) return value;
    const direct = translate(value);
    if (direct !== value) return direct;

    let output = value;
    for (const template of state.inlineTemplates) {
      output = output.replace(template.regex, (...args) => {
        const vars = {};
        template.names.forEach((name, index) => {
          vars[name] = args[index + 1];
        });
        const values = state.entries.get(template.key) || {};
        return format(values[state.language] ?? values.en ?? args[0], vars);
      });
    }
    for (const item of state.inline) {
      if (!output.includes(item.value)) continue;
      const values = state.entries.get(item.key) || {};
      const replacement = values[state.language] ?? values.en ?? item.value;
      if (replacement === item.value) continue;
      output = output.split(item.value).join(replacement);
    }
    return output;
  }

  function isClientElement(element) {
    let current = element?.nodeType === Node.ELEMENT_NODE ? element : element?.parentElement;
    for (let depth = 0; current && depth < 14; depth += 1, current = current.parentElement) {
      const id = current.id || '';
      if (/^(mf-|mfs-|mff-|mfm-|mfsch-|mfse-|mft-|mfn-)/.test(id)) return true;
      const classes = typeof current.className === 'string' ? current.className.split(/\s+/) : [];
      if (classes.some(name => /^(mf-|mfs-|mff-|mfm-|mfsch-|mfse-|mft-|mfn-)/.test(name))) return true;
    }
    return false;
  }

  function translateElement(element) {
    if (!(element instanceof Element) || !isClientElement(element)) return;
    for (const attr of ['title', 'placeholder', 'aria-label']) {
      if (!element.hasAttribute(attr)) continue;
      const value = element.getAttribute(attr);
      const next = translate(value);
      if (next !== value) element.setAttribute(attr, next);
    }
  }

  function translateNode(node) {
    if (!node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      if (!isClientElement(node)) return;
      const next = translate(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }

    if (!(node instanceof Element)) return;
    if (isClientElement(node)) translateElement(node);

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let current = walker.currentNode;
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        if (isClientElement(current)) {
          const next = translate(current.nodeValue);
          if (next !== current.nodeValue) current.nodeValue = next;
        }
      } else if (current instanceof Element && isClientElement(current)) {
        translateElement(current);
      }
      current = walker.nextNode();
    }
  }

  function translateDocument() {
    if (!document.documentElement) return;
    translateNode(document.documentElement);
  }

  function setLanguage(language) {
    const next = ['en', 'es', 'ja', 'it'].includes(language) ? language : 'en';
    if (state.language === next) {
      translateDocument();
      return;
    }
    state.language = next;
    translateDocument();
  }

  function onLanguage(event) {
    let detail = null;
    try {
      detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
    } catch (_) {}
    if (detail?.language) setLanguage(detail.language);
  }

  function patchDialogs() {
    if (typeof state.originals.alert === 'function') {
      globalThis.alert = function (message) {
        return state.originals.alert.call(this, translate(String(message ?? '')));
      };
    }
    if (typeof state.originals.confirm === 'function') {
      globalThis.confirm = function (message) {
        return state.originals.confirm.call(this, translate(String(message ?? '')));
      };
    }
    if (typeof state.originals.prompt === 'function') {
      globalThis.prompt = function (message, defaultValue) {
        return state.originals.prompt.call(this, translate(String(message ?? '')), defaultValue);
      };
    }
  }

  function destroy() {
    document.removeEventListener(EVENT, onLanguage);
    state.observer?.disconnect();
    if (typeof state.originals.alert === 'function') globalThis.alert = state.originals.alert;
    if (typeof state.originals.confirm === 'function') globalThis.confirm = state.originals.confirm;
    if (typeof state.originals.prompt === 'function') globalThis.prompt = state.originals.prompt;
    if (globalThis[KEY]?.destroy === destroy) delete globalThis[KEY];
    if (globalThis.MiniFeatherI18n?.destroy === destroy) delete globalThis.MiniFeatherI18n;
  }

  document.addEventListener(EVENT, onLanguage);
  state.observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateNode(mutation.target);
      if (mutation.type === 'attributes') translateElement(mutation.target);
      mutation.addedNodes?.forEach(translateNode);
    }
  });
  state.observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'placeholder', 'aria-label']
  });
  patchDialogs();

  const api = { register, translate, translateInline, setLanguage, destroy };
  globalThis.MiniFeatherI18n = api;
  globalThis[KEY] = api;
})();
