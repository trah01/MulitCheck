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

  const state = {
    enabled: true,
  };

  const controller = createCheckboxRangeController({
    isFeatureEnabled: () => state.enabled,
    onRangeApplied,
  });

  const onClick = (event) => controller.handleClick(event);
  doc.addEventListener("click", onClick, false);

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
      if (!changes || changes.globalEnabled || changes.siteOverrides) {
        refreshState();
      }
    };
    chromeApi.storage.onChanged.addListener(onStorageChanged);
  }

  return () => {
    disposed = true;
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

function onRangeApplied() {}

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
  if (doc && doc.location) {
    if (typeof doc.location.hostname === "string" && doc.location.hostname) {
      return doc.location.hostname;
    }
    if (typeof doc.location.href === "string") {
      return getHostnameFromUrl(doc.location.href);
    }
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
    if (parsed.protocol === "file:") {
      return "file://";
    }
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
  ]);
  return {
    globalEnabled: normalizeGlobalEnabled(stored.globalEnabled),
    siteOverrides:
      stored.siteOverrides && typeof stored.siteOverrides === "object"
        ? stored.siteOverrides
        : {},
  };
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
