const STATUS_INDICATOR_ID = "checkbox-range-selector-status";
const SettingsUtils = resolveSettingsUtils();

function createCheckboxRangeController(options = {}) {
  let anchor = null;

  const isFeatureEnabled =
    typeof options.isFeatureEnabled === "function"
      ? options.isFeatureEnabled
      : () => true;
  const onRangeApplied =
    typeof options.onRangeApplied === "function" ? options.onRangeApplied : () => {};

  return {
    handleClick(event) {
      if (!isFeatureEnabled()) {
        return;
      }

      const target = event && event.target;
      if (!isCheckbox(target)) {
        return;
      }

      if (!event || !event.shiftKey || !anchor) {
        anchor = target;
        return;
      }

      if (!isConnected(anchor)) {
        anchor = target;
        return;
      }

      const rangeContainer = findRangeContainer(anchor, target);
      if (!rangeContainer) {
        anchor = target;
        return;
      }

      const checkboxes = Array.from(
        rangeContainer.querySelectorAll('input[type="checkbox"]')
      ).filter((box) => isCheckbox(box) && !box.disabled && isVisible(box));

      const startIndex = checkboxes.indexOf(anchor);
      const endIndex = checkboxes.indexOf(target);

      if (startIndex === -1 || endIndex === -1) {
        anchor = target;
        return;
      }

      const left = Math.min(startIndex, endIndex);
      const right = Math.max(startIndex, endIndex);
      const nextState = !!target.checked;

      for (let index = left; index <= right; index += 1) {
        const checkbox = checkboxes[index];
        if (checkbox.checked !== nextState) {
          checkbox.checked = nextState;
          emitInputAndChange(checkbox);
        }
      }

      onRangeApplied(right - left + 1, nextState);
      anchor = target;
    },
    getAnchor() {
      return anchor;
    },
  };
}

function initContentScript(doc, options = {}) {
  if (!doc || typeof doc.addEventListener !== "function") {
    return () => {};
  }

  ensureStatusIndicator(doc);

  const state = {
    enabled: true,
    baseLabel: "active",
    language: resolveCurrentLanguage(options.languagePreference),
  };

  const controller = createCheckboxRangeController({
    isFeatureEnabled: () => state.enabled,
    onRangeApplied(count, checked) {
      notifyRangeApplied(doc, count, checked, state.language, () =>
        statusTextFromLabel(state.baseLabel, state.language)
      );
    },
  });

  const onClick = (event) => controller.handleClick(event);
  doc.addEventListener("click", onClick, false);

  hideIndicator(doc);

  const chromeApi = resolveChromeApi(options.chromeApi);
  const hostname = resolveHostname(doc, options.hostname);

  let disposed = false;
  let onStorageChanged = null;

  const refreshState = async () => {
    const settings = await readStoredSettings(chromeApi);
    if (disposed) {
      return;
    }

    const effective = resolveEffectiveForHost(settings, hostname);
    state.enabled = !!effective.enabled;
    state.baseLabel = effective.label;
    state.language = resolveCurrentLanguage(settings.languagePreference);
    applyBaseState(doc, state.enabled, state.baseLabel, state.language);
  };

  refreshState();

  if (
    chromeApi &&
    chromeApi.storage &&
    chromeApi.storage.onChanged &&
    typeof chromeApi.storage.onChanged.addListener === "function"
  ) {
    onStorageChanged = (changes, areaName) => {
      if (areaName && areaName !== "sync") {
        return;
      }
      if (!changes || changes.globalEnabled || changes.siteOverrides || changes.languagePreference) {
        refreshState();
      }
    };
    chromeApi.storage.onChanged.addListener(onStorageChanged);
  }

  return () => {
    disposed = true;
    clearRangeNotifyTimer(doc);
    if (typeof doc.removeEventListener === "function") {
      doc.removeEventListener("click", onClick, false);
    }
    if (
      onStorageChanged &&
      chromeApi &&
      chromeApi.storage &&
      chromeApi.storage.onChanged &&
      typeof chromeApi.storage.onChanged.removeListener === "function"
    ) {
      chromeApi.storage.onChanged.removeListener(onStorageChanged);
    }
  };
}

function isCheckbox(node) {
  if (!node) {
    return false;
  }

  if (typeof node.matches === "function") {
    return node.matches('input[type="checkbox"]');
  }

  return node.tagName === "INPUT" && node.type === "checkbox";
}

function isConnected(node) {
  if (!node) {
    return false;
  }
  if (typeof node.isConnected === "boolean") {
    return node.isConnected;
  }
  return true;
}

function isVisible(node) {
  if (!node || node.hidden) {
    return false;
  }

  if (typeof window !== "undefined" && window.getComputedStyle) {
    const style = window.getComputedStyle(node);
    if (
      style &&
      (style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse")
    ) {
      return false;
    }
  }

  return true;
}

function emitInputAndChange(node) {
  if (!node || typeof node.dispatchEvent !== "function") {
    return;
  }

  node.dispatchEvent(createEvent("input"));
  node.dispatchEvent(createEvent("change"));
}

function findRangeContainer(anchor, target) {
  if (!anchor || !target) {
    return null;
  }

  if (anchor.parentElement && anchor.parentElement === target.parentElement) {
    return anchor.parentElement;
  }

  const targetAncestors = new Set(getAncestors(target));
  const anchorAncestors = getAncestors(anchor);

  for (const ancestor of anchorAncestors) {
    if (!targetAncestors.has(ancestor)) {
      continue;
    }

    if (isValidRangeContainer(ancestor)) {
      return ancestor;
    }
  }

  return null;
}

function getAncestors(node) {
  const ancestors = [];
  let current = node && node.parentElement;

  while (current) {
    ancestors.push(current);
    current = current.parentElement;
  }

  return ancestors;
}

function isValidRangeContainer(container) {
  if (!container || typeof container.querySelectorAll !== "function") {
    return false;
  }

  const tag = typeof container.tagName === "string" ? container.tagName.toUpperCase() : "";
  if (tag === "HTML" || tag === "BODY") {
    return false;
  }

  return true;
}

function createEvent(type) {
  if (typeof Event === "function") {
    return new Event(type, { bubbles: true });
  }
  return { type };
}

function resolveSettingsUtils() {
  if (typeof module !== "undefined" && module.exports) {
    try {
      return require("./settings.js");
    } catch (_error) {
      return null;
    }
  }
  if (typeof window !== "undefined") {
    return window.CheckboxRangeSettings || null;
  }
  return null;
}

function resolveEffectiveForHost(settings, hostname) {
  if (SettingsUtils && typeof SettingsUtils.resolveEffectiveForHost === "function") {
    return SettingsUtils.resolveEffectiveForHost(settings, hostname);
  }

  const enabled = normalizeGlobalEnabled(settings && settings.globalEnabled);
  return {
    enabled,
    label: enabled ? "active" : "disabled by global",
    mode: "inherit",
  };
}

function normalizeGlobalEnabled(value) {
  if (SettingsUtils && typeof SettingsUtils.normalizeGlobalEnabled === "function") {
    return SettingsUtils.normalizeGlobalEnabled(value);
  }
  return typeof value === "boolean" ? value : true;
}

function statusTextFromLabel(label, language) {
  return `${translate("indicatorPrefix", language)}${indicatorLabelText(label, language)}`;
}

function indicatorLabelText(label, language) {
  if (label === "forced on by site") {
    return translate("indicatorForcedOnBySite", language);
  }
  if (label === "disabled by site") {
    return translate("indicatorDisabledBySite", language);
  }
  if (label === "disabled by global") {
    return translate("indicatorDisabledByGlobal", language);
  }
  return translate("indicatorActive", language);
}

function applyBaseState(doc, enabled, label, language) {
  if (!enabled) {
    hideIndicator(doc);
    return;
  }

  showIndicator(doc);
  setIndicatorText(doc, statusTextFromLabel(label, language), false);
}

function notifyRangeApplied(doc, count, checked, language, idleTextGetter) {
  const indicator = getStatusIndicator(doc);
  if (!indicator) {
    return;
  }

  showIndicator(doc);
  const messageKey = checked ? "indicatorSelected" : "indicatorUnselected";
  const message = `${translate("indicatorPrefix", language)}${translate(
    messageKey,
    language,
    { count }
  )}`;

  indicator.textContent = message;
  indicator.style.opacity = "1";

  clearRangeNotifyTimer(doc);
  indicator._rangeTimer = setTimeout(() => {
    const idleText =
      typeof idleTextGetter === "function"
        ? idleTextGetter()
        : statusTextFromLabel("active", language);
    indicator.textContent = idleText;
    indicator.style.opacity = "0.55";
  }, 1300);
}

function clearRangeNotifyTimer(doc) {
  const indicator = getStatusIndicator(doc);
  if (!indicator || !indicator._rangeTimer) {
    return;
  }
  clearTimeout(indicator._rangeTimer);
  indicator._rangeTimer = null;
}

function setIndicatorText(doc, text, highlighted) {
  const indicator = getStatusIndicator(doc);
  if (!indicator) {
    return;
  }
  indicator.textContent = text;
  indicator.style.opacity = highlighted ? "1" : "0.55";
}

function getStatusIndicator(doc) {
  if (!doc || typeof doc.getElementById !== "function") {
    return null;
  }
  return doc.getElementById(STATUS_INDICATOR_ID);
}

function ensureStatusIndicator(doc) {
  if (!doc || !doc.body || typeof doc.createElement !== "function") {
    return;
  }

  if (getStatusIndicator(doc)) {
    return;
  }

  const indicator = doc.createElement("div");
  indicator.id = STATUS_INDICATOR_ID;
  indicator.textContent = statusTextFromLabel("active", resolveCurrentLanguage());
  indicator.style.position = "fixed";
  indicator.style.right = "12px";
  indicator.style.bottom = "12px";
  indicator.style.zIndex = "2147483647";
  indicator.style.padding = "6px 10px";
  indicator.style.borderRadius = "8px";
  indicator.style.background = "rgba(25, 25, 25, 0.88)";
  indicator.style.color = "#fff";
  indicator.style.fontSize = "12px";
  indicator.style.fontFamily =
    "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  indicator.style.lineHeight = "1.2";
  indicator.style.opacity = "0.55";
  indicator.style.pointerEvents = "none";
  indicator.style.transition = "opacity 0.2s ease";
  indicator.style.display = "none";
  doc.body.appendChild(indicator);
}

function showIndicator(doc) {
  const indicator = getStatusIndicator(doc);
  if (!indicator) {
    return;
  }
  indicator.style.display = "block";
}

function hideIndicator(doc) {
  const indicator = getStatusIndicator(doc);
  if (!indicator) {
    return;
  }
  indicator.style.display = "none";
}

function resolveChromeApi(explicitChromeApi) {
  if (explicitChromeApi) {
    return explicitChromeApi;
  }
  if (typeof chrome !== "undefined") {
    return chrome;
  }
  return null;
}

function resolveHostname(doc, providedHostname) {
  if (typeof providedHostname === "string") {
    return providedHostname;
  }
  if (doc && doc.location && typeof doc.location.hostname === "string") {
    return doc.location.hostname || null;
  }
  if (typeof location !== "undefined" && typeof location.href === "string") {
    return getHostnameFromUrl(location.href);
  }
  return null;
}

function getHostnameFromUrl(url) {
  if (SettingsUtils && typeof SettingsUtils.getHostnameFromUrl === "function") {
    return SettingsUtils.getHostnameFromUrl(url);
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.hostname || null;
    }
  } catch (_error) {
    return null;
  }
  return null;
}

async function readStoredSettings(chromeApi) {
  const defaults = {
    globalEnabled: true,
    siteOverrides: {},
    languagePreference: "auto",
  };

  if (
    !chromeApi ||
    !chromeApi.storage ||
    !chromeApi.storage.sync ||
    typeof chromeApi.storage.sync.get !== "function"
  ) {
    return defaults;
  }

  const stored = await storageGet(chromeApi.storage.sync, [
    "globalEnabled",
    "siteOverrides",
    "languagePreference",
  ]);
  return {
    globalEnabled: normalizeGlobalEnabled(stored.globalEnabled),
    siteOverrides:
      stored.siteOverrides && typeof stored.siteOverrides === "object"
        ? stored.siteOverrides
        : {},
    languagePreference: normalizeLanguagePreference(stored.languagePreference),
  };
}

function normalizeLanguagePreference(value) {
  if (SettingsUtils && typeof SettingsUtils.normalizeLanguagePreference === "function") {
    return SettingsUtils.normalizeLanguagePreference(value);
  }
  if (value === "en" || value === "zh-CN" || value === "auto") {
    return value;
  }
  return "auto";
}

function resolveCurrentLanguage(languagePreference) {
  if (SettingsUtils && typeof SettingsUtils.resolveLanguage === "function") {
    return SettingsUtils.resolveLanguage(languagePreference, getBrowserLanguages());
  }
  if (languagePreference === "zh-CN") {
    return "zh-CN";
  }
  if (languagePreference === "en") {
    return "en";
  }
  return getBrowserLanguages().some((language) => /^zh\b|^zh-/i.test(language)) ? "zh-CN" : "en";
}

function getBrowserLanguages() {
  if (typeof navigator !== "undefined" && Array.isArray(navigator.languages)) {
    return navigator.languages;
  }
  if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
    return [navigator.language];
  }
  return [];
}

function translate(key, language, substitutions) {
  if (SettingsUtils && typeof SettingsUtils.translate === "function") {
    return SettingsUtils.translate(key, language, substitutions);
  }
  return key;
}

function storageGet(storageArea, keys) {
  if (!storageArea || typeof storageArea.get !== "function") {
    return Promise.resolve({});
  }

  if (storageArea.get.length >= 2) {
    return new Promise((resolve) => {
      try {
        storageArea.get(keys, (value) => resolve(value || {}));
      } catch (_error) {
        resolve({});
      }
    });
  }

  try {
    const value = storageArea.get(keys);
    if (value && typeof value.then === "function") {
      return value.then((result) => result || {}).catch(() => ({}));
    }
  } catch (_error) {
    return Promise.resolve({});
  }

  return Promise.resolve({});
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createCheckboxRangeController,
    initContentScript,
  };
} else if (typeof document !== "undefined") {
  initContentScript(document);
}
