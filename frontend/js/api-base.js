(function () {
  const STORAGE_KEY = "pulsemind_api_base";
  const DEFAULT_LOCAL = "http://127.0.0.1:3000";
  const API_BASE_OVERRIDE = "https://pulsemind.onrender.com";
  // Override order: constant, window, meta tag, localStorage, then origin fallback.

  function normalize(value) {
    if (!value) return "";
    return value.replace(/\/+$/, "");
  }

  function readMeta() {
    const meta = document.querySelector('meta[name="api-base"]');
    return meta ? meta.getAttribute("content") : "";
  }

  function readStorage() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function computeDefault() {
    const origin = window.location.origin;
    if (!origin || origin === "null") {
      return DEFAULT_LOCAL;
    }
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      if (origin.includes(":3000")) {
        return origin;
      }
      return DEFAULT_LOCAL;
    }
    return origin;
  }

  window.getPulseMindApiBase = function () {
    const override = normalize(API_BASE_OVERRIDE);
    if (override) {
      window.PULSEMIND_API_BASE = override;
      return override;
    }
    if (window.PULSEMIND_API_BASE) {
      return normalize(window.PULSEMIND_API_BASE);
    }
    const resolved = normalize(readMeta() || readStorage() || computeDefault());
    window.PULSEMIND_API_BASE = resolved;
    return resolved;
  };
})();
