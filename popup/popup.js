(async function runPopup() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const settingsApi = window.CheckboxRangeSettings;
  if (!settingsApi || typeof chrome === "undefined") {
    return;
  }

  const globalToggle = document.getElementById("global-enabled");
  const languageSelect = document.getElementById("language-select");
  const siteHostname = document.getElementById("site-hostname");
  const effectiveStatus = document.getElementById("effective-status");
  const siteSection = document.getElementById("site-section");
  const siteNote = document.getElementById("site-note");
  const textNodes = {
    globalLabel: document.getElementById("global-label"),
    languageLabel: document.getElementById("language-label"),
    currentSiteLabel: document.getElementById("current-site-label"),
    siteModeInheritLabel: document.getElementById("site-mode-inherit-label"),
    siteModeForceOnLabel: document.getElementById("site-mode-force-on-label"),
    siteModeForceOffLabel: document.getElementById("site-mode-force-off-label"),
    ruleNote: document.getElementById("rule-note"),
  };
  const siteModeInputs = Array.from(
    document.querySelectorAll('input[name="site-mode"]')
  );

  const state = {
    hostname: null,
    settings: {
      globalEnabled: true,
      siteOverrides: {},
      languagePreference: "auto",
    },
  };

  const activeTab = await getActiveTab();
  state.hostname = settingsApi.getHostnameFromUrl(activeTab && activeTab.url);
  state.settings = await loadSettings();
  render();
  bindEvents();
  bindStorageEvents();

  function bindEvents() {
    if (globalToggle) {
      globalToggle.addEventListener("change", async () => {
        state.settings.globalEnabled = !!globalToggle.checked;
        await saveSettings({
          globalEnabled: state.settings.globalEnabled,
        });
        render();
      });
    }

    if (languageSelect) {
      languageSelect.addEventListener("change", async () => {
        state.settings.languagePreference = settingsApi.normalizeLanguagePreference(
          languageSelect.value
        );
        await saveSettings({
          languagePreference: state.settings.languagePreference,
        });
        render();
      });
    }

    siteModeInputs.forEach((input) => {
      input.addEventListener("change", async () => {
        if (!input.checked || !state.hostname) {
          return;
        }

        const nextMode = settingsApi.normalizeSiteMode(input.value);
        const nextOverrides = {
          ...state.settings.siteOverrides,
        };

        if (nextMode === settingsApi.SITE_MODE_INHERIT) {
          delete nextOverrides[state.hostname];
        } else {
          nextOverrides[state.hostname] = nextMode;
        }

        state.settings.siteOverrides = nextOverrides;
        await saveSettings({
          siteOverrides: nextOverrides,
        });
        render();
      });
    });
  }

  function bindStorageEvents() {
    if (
      !chrome.storage ||
      !chrome.storage.onChanged ||
      typeof chrome.storage.onChanged.addListener !== "function"
    ) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      if (changes.globalEnabled) {
        state.settings.globalEnabled = typeof changes.globalEnabled.newValue === "boolean"
          ? changes.globalEnabled.newValue
          : true;
      }

      if (changes.siteOverrides) {
        state.settings.siteOverrides =
          changes.siteOverrides.newValue && typeof changes.siteOverrides.newValue === "object"
            ? changes.siteOverrides.newValue
            : {};
      }

      if (changes.languagePreference) {
        state.settings.languagePreference = settingsApi.normalizeLanguagePreference(
          changes.languagePreference.newValue
        );
      }

      render();
    });
  }

  function render() {
    const language = resolveCurrentLanguage();
    renderText(language);

    const siteSupported = !!state.hostname;
    const siteMode = settingsApi.getSiteModeForHost(
      state.settings.siteOverrides,
      state.hostname
    );
    const effective = settingsApi.resolveEffectiveForHost(state.settings, state.hostname);

    if (globalToggle) {
      globalToggle.checked = !!state.settings.globalEnabled;
    }

    if (siteHostname) {
      siteHostname.textContent = siteSupported ? state.hostname : t("unsupportedPage", language);
    }

    siteModeInputs.forEach((input) => {
      input.disabled = !siteSupported;
      input.checked = siteSupported ? input.value === siteMode : input.value === "inherit";
    });

    if (siteSection) {
      siteSection.style.opacity = siteSupported ? "1" : "0.72";
    }

    if (siteNote) {
      siteNote.textContent = siteSupported
        ? siteModeDescription(siteMode, language)
        : t("siteUnsupportedDescription", language);
    }

    if (effectiveStatus) {
      effectiveStatus.textContent = `${t("statusPrefix", language)}${uiLabelFromEffective(
        effective.label,
        language
      )}`;
      effectiveStatus.classList.remove("enabled", "disabled");
      effectiveStatus.classList.add(effective.enabled ? "enabled" : "disabled");
    }
  }

  function renderText(language) {
    document.documentElement.lang = language;
    document.title = t("appTitle", language);

    if (languageSelect) {
      languageSelect.value = settingsApi.normalizeLanguagePreference(
        state.settings.languagePreference
      );
      setOptionText("auto", t("languageAuto", language));
      setOptionText("zh-CN", t("languageZhCn", language));
      setOptionText("en", t("languageEn", language));
    }

    setText(textNodes.globalLabel, t("globalSwitch", language));
    setText(textNodes.languageLabel, t("languageLabel", language));
    setText(textNodes.currentSiteLabel, t("currentSite", language));
    setText(textNodes.siteModeInheritLabel, t("inheritGlobal", language));
    setText(textNodes.siteModeForceOnLabel, t("forceOn", language));
    setText(textNodes.siteModeForceOffLabel, t("forceOff", language));
    setText(textNodes.ruleNote, t("ruleText", language));
  }

  function setText(node, text) {
    if (node) {
      node.textContent = text;
    }
  }

  function setOptionText(value, text) {
    if (!languageSelect) {
      return;
    }
    const option = languageSelect.querySelector(`option[value="${value}"]`);
    if (option) {
      option.textContent = text;
    }
  }

  function siteModeDescription(mode, language) {
    if (mode === settingsApi.SITE_MODE_FORCE_ON) {
      return t("siteForceOnDescription", language);
    }
    if (mode === settingsApi.SITE_MODE_FORCE_OFF) {
      return t("siteForceOffDescription", language);
    }
    return t("siteInheritDescription", language);
  }

  function uiLabelFromEffective(label, language) {
    if (label === "forced on by site") {
      return t("effectiveForcedOnBySite", language);
    }
    if (label === "disabled by site") {
      return t("effectiveDisabledBySite", language);
    }
    if (label === "disabled by global") {
      return t("effectiveDisabledByGlobal", language);
    }
    return t("effectiveActive", language);
  }

  function t(key, language, substitutions) {
    return settingsApi.translate(key, language, substitutions);
  }

  function resolveCurrentLanguage() {
    return settingsApi.resolveLanguage(
      state.settings.languagePreference,
      getBrowserLanguages()
    );
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

  async function loadSettings() {
    const defaults = {
      globalEnabled: true,
      siteOverrides: {},
      languagePreference: "auto",
    };
    const stored = await storageGet(["globalEnabled", "siteOverrides", "languagePreference"]);

    return {
      globalEnabled:
        typeof stored.globalEnabled === "boolean" ? stored.globalEnabled : defaults.globalEnabled,
      siteOverrides:
        stored.siteOverrides && typeof stored.siteOverrides === "object"
          ? stored.siteOverrides
          : defaults.siteOverrides,
      languagePreference: settingsApi.normalizeLanguagePreference(stored.languagePreference),
    };
  }

  async function saveSettings(partial) {
    await storageSet(partial);
  }

  function storageGet(keys) {
    if (!chrome.storage || !chrome.storage.sync || typeof chrome.storage.sync.get !== "function") {
      return Promise.resolve({});
    }

    const area = chrome.storage.sync;
    if (area.get.length >= 2) {
      return new Promise((resolve) => {
        area.get(keys, (result) => resolve(result || {}));
      });
    }

    try {
      const value = area.get(keys);
      if (value && typeof value.then === "function") {
        return value.then((result) => result || {}).catch(() => ({}));
      }
    } catch (_error) {
      return Promise.resolve({});
    }

    return Promise.resolve({});
  }

  function storageSet(data) {
    if (!chrome.storage || !chrome.storage.sync || typeof chrome.storage.sync.set !== "function") {
      return Promise.resolve();
    }

    const area = chrome.storage.sync;
    if (area.set.length >= 2) {
      return new Promise((resolve) => {
        area.set(data, () => resolve());
      });
    }

    try {
      const value = area.set(data);
      if (value && typeof value.then === "function") {
        return value.then(() => undefined).catch(() => undefined);
      }
    } catch (_error) {
      return Promise.resolve();
    }

    return Promise.resolve();
  }

  function getActiveTab() {
    if (!chrome.tabs || typeof chrome.tabs.query !== "function") {
      return Promise.resolve(null);
    }

    if (chrome.tabs.query.length >= 2) {
      return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          resolve(Array.isArray(tabs) && tabs.length > 0 ? tabs[0] : null);
        });
      });
    }

    try {
      const value = chrome.tabs.query({ active: true, currentWindow: true });
      if (value && typeof value.then === "function") {
        return value.then((tabs) => (Array.isArray(tabs) && tabs.length > 0 ? tabs[0] : null));
      }
    } catch (_error) {
      return Promise.resolve(null);
    }

    return Promise.resolve(null);
  }
})();
