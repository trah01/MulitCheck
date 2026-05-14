const SITE_MODE_INHERIT = "inherit";
const SITE_MODE_FORCE_ON = "force-on";
const SITE_MODE_FORCE_OFF = "force-off";
const LANGUAGE_AUTO = "auto";
const LANGUAGE_EN = "en";
const LANGUAGE_ZH_CN = "zh-CN";

const TRANSLATIONS = {
  [LANGUAGE_EN]: {
    appTitle: "mulitcheck",
    statusLoading: "Status: loading...",
    statusPrefix: "Status: ",
    globalSwitch: "Global switch",
    languageLabel: "Language",
    languageAuto: "Auto (browser language)",
    languageZhCn: "Simplified Chinese",
    languageEn: "English",
    currentSite: "Current site: ",
    localFileSite: "Local files",
    loading: "Loading...",
    unsupportedPage: "Unsupported page",
    inheritGlobal: "Follow global",
    forceOn: "Force on for this site",
    forceOff: "Force off for this site",
    ruleText: "Rule: site setting has priority. Force on/off for a site overrides the global switch.",
    siteForceOnDescription: "Current site: forced on (overrides global).",
    siteForceOffDescription: "Current site: forced off (overrides global).",
    siteInheritDescription: "Current site: follows the global switch.",
    siteUnsupportedDescription:
      "Site-level switches support http/https pages and local files after file URL access is allowed.",
    fileAccessRequiredDescription:
      "Local file pages require enabling \"Allow access to file URLs\" on this extension's details page.",
    effectiveForcedOnBySite: "Enabled (forced on by site)",
    effectiveDisabledBySite: "Disabled (forced off by site)",
    effectiveDisabledByGlobal: "Disabled (global switch)",
    effectiveActive: "Enabled",
  },
  [LANGUAGE_ZH_CN]: {
    appTitle: "mulitcheck",
    statusLoading: "状态：读取中...",
    statusPrefix: "状态：",
    globalSwitch: "全局开关",
    languageLabel: "语言",
    languageAuto: "自动（跟随浏览器）",
    languageZhCn: "简体中文",
    languageEn: "英文",
    currentSite: "当前网站：",
    localFileSite: "本地文件",
    loading: "读取中...",
    unsupportedPage: "当前页面不支持",
    inheritGlobal: "跟随全局",
    forceOn: "本网站强制开启",
    forceOff: "本网站强制关闭",
    ruleText: "规则：网站优先。网站强制开启/关闭会覆盖全局开关。",
    siteForceOnDescription: "当前网站：强制开启（覆盖全局）。",
    siteForceOffDescription: "当前网站：强制关闭（覆盖全局）。",
    siteInheritDescription: "当前网站：跟随全局开关。",
    siteUnsupportedDescription: "网站级开关支持 http/https 页面；本地文件需要先允许访问文件网址。",
    fileAccessRequiredDescription: "本地页面需要在扩展详情页开启“允许访问文件网址”。",
    effectiveForcedOnBySite: "已启用（网站强制开启）",
    effectiveDisabledBySite: "已停用（网站强制关闭）",
    effectiveDisabledByGlobal: "已停用（全局开关）",
    effectiveActive: "已启用",
  },
};

function normalizeSiteMode(mode) {
  if (
    mode === SITE_MODE_INHERIT ||
    mode === SITE_MODE_FORCE_ON ||
    mode === SITE_MODE_FORCE_OFF
  ) {
    return mode;
  }
  return SITE_MODE_INHERIT;
}

function normalizeGlobalEnabled(value) {
  return typeof value === "boolean" ? value : true;
}

function normalizeLanguagePreference(value) {
  if (
    value === LANGUAGE_AUTO ||
    value === LANGUAGE_EN ||
    value === LANGUAGE_ZH_CN
  ) {
    return value;
  }
  return LANGUAGE_AUTO;
}

function resolveLanguage(preference, browserLanguages) {
  const normalizedPreference = normalizeLanguagePreference(preference);
  if (normalizedPreference !== LANGUAGE_AUTO) {
    return normalizedPreference;
  }

  const candidates = normalizeBrowserLanguages(browserLanguages);
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (lower === "zh" || lower.startsWith("zh-")) {
      return LANGUAGE_ZH_CN;
    }
    if (lower === "en" || lower.startsWith("en-")) {
      return LANGUAGE_EN;
    }
  }

  return LANGUAGE_EN;
}

function normalizeBrowserLanguages(browserLanguages) {
  if (Array.isArray(browserLanguages)) {
    return browserLanguages.filter((language) => typeof language === "string");
  }
  if (typeof browserLanguages === "string") {
    return [browserLanguages];
  }
  return [];
}

function translate(key, language, substitutions) {
  const resolvedLanguage = language === LANGUAGE_ZH_CN ? LANGUAGE_ZH_CN : LANGUAGE_EN;
  const dictionary = TRANSLATIONS[resolvedLanguage] || TRANSLATIONS[LANGUAGE_EN];
  let text = dictionary[key] || TRANSLATIONS[LANGUAGE_EN][key] || key;

  if (substitutions && typeof substitutions === "object") {
    Object.keys(substitutions).forEach((name) => {
      text = text.replaceAll(`{${name}}`, String(substitutions[name]));
    });
  }

  return text;
}

function resolveEffectiveState(globalEnabled, siteMode) {
  const normalizedMode = normalizeSiteMode(siteMode);
  const normalizedGlobal = normalizeGlobalEnabled(globalEnabled);

  if (normalizedMode === SITE_MODE_FORCE_ON) {
    return {
      enabled: true,
      label: "forced on by site",
      mode: normalizedMode,
    };
  }

  if (normalizedMode === SITE_MODE_FORCE_OFF) {
    return {
      enabled: false,
      label: "disabled by site",
      mode: normalizedMode,
    };
  }

  return {
    enabled: normalizedGlobal,
    label: normalizedGlobal ? "active" : "disabled by global",
    mode: normalizedMode,
  };
}

function getHostnameFromUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (_error) {
    return null;
  }

  if (parsed.protocol === "file:") {
    return "file://";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.hostname || null;
}

function getSiteModeForHost(siteOverrides, hostname) {
  if (!siteOverrides || typeof siteOverrides !== "object") {
    return SITE_MODE_INHERIT;
  }
  if (!hostname || typeof hostname !== "string") {
    return SITE_MODE_INHERIT;
  }
  return normalizeSiteMode(siteOverrides[hostname]);
}

function resolveEffectiveForHost(settings, hostname) {
  const safeSettings = settings && typeof settings === "object" ? settings : {};
  const globalEnabled = normalizeGlobalEnabled(safeSettings.globalEnabled);
  const siteMode = getSiteModeForHost(safeSettings.siteOverrides, hostname);
  return resolveEffectiveState(globalEnabled, siteMode);
}

const SettingsApi = {
  SITE_MODE_INHERIT,
  SITE_MODE_FORCE_ON,
  SITE_MODE_FORCE_OFF,
  LANGUAGE_AUTO,
  LANGUAGE_EN,
  LANGUAGE_ZH_CN,
  normalizeSiteMode,
  normalizeGlobalEnabled,
  normalizeLanguagePreference,
  resolveLanguage,
  translate,
  resolveEffectiveState,
  getSiteModeForHost,
  resolveEffectiveForHost,
  getHostnameFromUrl,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = SettingsApi;
} else if (typeof window !== "undefined") {
  window.CheckboxRangeSettings = SettingsApi;
}
