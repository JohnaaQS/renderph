document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "http://127.0.0.1:3000";
  const TOKEN_KEY = "pulsemind_token";

  const statusEl = document.getElementById("debug-status");
  const inputEl = document.getElementById("debug-input");
  const outputEl = document.getElementById("debug-output");
  const refreshBtn = document.getElementById("debug-refresh-btn");

  function setStatus(message, state = "info") {
    if (!statusEl) return;
    if (!message) {
      statusEl.textContent = "";
      statusEl.style.display = "none";
      return;
    }
    statusEl.textContent = message;
    statusEl.dataset.state = state;
    statusEl.style.display = "block";
  }

  function pretty(value) {
    return JSON.stringify(value, null, 2);
  }

  async function fetchJson(path) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      throw new Error("Geen login token gevonden. Log eerst in.");
    }
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error || data.message || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  }

  function buildInputPayload(user, measurements, dailyLogs) {
    return {
      user: {
        leeftijd: user?.leeftijd ?? null,
        geslacht: user?.geslacht ?? null,
        lengte_cm: user?.lengte_cm ?? null,
        gewicht_kg: user?.gewicht_kg ?? null,
        levensstijl: user?.levensstijl ?? null
      },
      metingen: (measurements || []).map((row) => ({
        timestamp: row.timestamp || null,
        bpm: row.bpm ?? null,
        temp: row.temp ?? null,
        gsr: row.gsr ?? null,
        hrv_ms: row.hrv_ms ?? null
      })),
      daily_logs: (dailyLogs || []).map((row) => ({
        date: row.date || null,
        uren_geslapen: row.uren_geslapen ?? null,
        gevoel: row.gevoel ?? null,
        activiteiten: row.activiteiten ?? null,
        note: row.note ?? null
      }))
    };
  }

  async function loadDebug() {
    setStatus("Data laden...", "info");
    if (inputEl) inputEl.textContent = "Laden...";
    if (outputEl) outputEl.textContent = "Laden...";

    try {
      const [user, measurements, dailyLogs, analysisResp] = await Promise.all([
        fetchJson("/api/auth/me"),
        fetchJson("/api/measurements/me?limit=30"),
        fetchJson("/api/daily-logs"),
        fetchJson("/api/analysis/me")
      ]);

      const inputPayload = buildInputPayload(user, measurements, dailyLogs);
      const analysis = analysisResp.analysis || analysisResp;

      if (inputEl) {
        inputEl.textContent = pretty(inputPayload);
      }
      if (outputEl) {
        outputEl.textContent = pretty(analysis);
      }
      setStatus("Klaar.", "success");
    } catch (error) {
      if (inputEl) inputEl.textContent = "Geen data.";
      if (outputEl) outputEl.textContent = "Geen data.";
      setStatus(error.message, "error");
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadDebug);
  }

  loadDebug();
});
