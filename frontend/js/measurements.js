// ===============================
// MEASUREMENT LOCK
// ===============================
let activeMeasurement = null; // null | "heart" | "temperature"

// ===============================
// GLOBAL UI LOCK (BUTTONS + LINKS)
// ===============================
function lockUI(except = []) {
  document.body.classList.add("ui-locked");

  document.querySelectorAll("button").forEach((btn) => {
    if (!except.includes(btn)) {
      btn.disabled = true;
      btn.classList.add("ui-locked");
    }
  });
}

function unlockUI() {
  document.body.classList.remove("ui-locked");

  document.querySelectorAll("button").forEach((btn) => {
    btn.disabled = false;
    btn.classList.remove("ui-locked");
  });
}

// Block <a> while UI is locked
document.addEventListener(
  "click",
  (e) => {
    if (document.body.classList.contains("ui-locked") && e.target.closest("a")) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true
);

// ===============================
// DAGELIJKSE CHECK-IN STATUS
// ===============================
let dailyCheckinDone = true;

const API_BASE = (window.location.origin && (
  window.location.origin.includes(":3000")
  || window.location.origin.endsWith(".onrender.com")
))
  ? window.location.origin
  : "http://10.166.0.154:3000";
const TOKEN_KEY = "pulsemind_token";
const HEART_MEASUREMENT_DURATION_SEC = 10;
const TEMP_MEASUREMENT_DURATION_SEC = 30;
const MEASUREMENT_POLL_MS = 1000;
const MEASUREMENT_FALLBACK_WINDOW_MS = 5 * 60 * 1000;

// ===============================
// DATUM SELECTIE EN WEERGAVE
// ===============================
const dateInput = document.getElementById("date-field");
const dateDisplay = document.querySelector(".date-display");

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

dateInput?.addEventListener("change", () => {
  dateDisplay.textContent = formatDate(dateInput.value);
});

// ===============================
// API HELPERS
// ===============================
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function apiFetch(path, options = {}) {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing auth token");
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

async function startMeasurementSession(durationSec) {
  return apiFetch("/api/measurements/start", {
    method: "POST",
    body: JSON.stringify({ duration_sec: durationSec }),
  });
}

function parseApiTimestamp(value) {
  if (!value) return NaN;
  const raw = String(value).trim();
  if (!raw) return NaN;

  const hasTimezone = /[zZ]|[+-]\\d{2}:?\\d{2}$/.test(raw);
  const normalized = hasTimezone ? raw : `${raw}Z`;
  return Date.parse(normalized);
}

function selectMeasurementAfter(rows, startedAtIso) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  if (!startedAtIso) {
    return rows[0] || null;
  }

  const startedAtMs = parseApiTimestamp(startedAtIso);
  if (!Number.isFinite(startedAtMs)) {
    return rows[0] || null;
  }
  return (
    rows.find((row) => {
      if (!row?.timestamp) {
        return false;
      }
      return parseApiTimestamp(row.timestamp) >= startedAtMs;
    }) || null
  );
}

async function waitForMeasurement(startedAtIso, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastRows = null;

  while (Date.now() < deadline) {
    const rows = await apiFetch(`/api/measurements/me?limit=1&t=${Date.now()}`);
    if (Array.isArray(rows) && rows.length > 0) {
      lastRows = rows;
    }
    const measurement = selectMeasurementAfter(rows, startedAtIso);

    if (measurement) {
      return measurement;
    }

    await delay(MEASUREMENT_POLL_MS);
  }

  if (Array.isArray(lastRows) && lastRows.length > 0) {
    const fallback = lastRows[0];
    if (!startedAtIso || !fallback?.timestamp) {
      return fallback;
    }
    const startedAtMs = parseApiTimestamp(startedAtIso);
    const fallbackMs = parseApiTimestamp(fallback.timestamp);
    if (
      Number.isFinite(startedAtMs)
      && Number.isFinite(fallbackMs)
      && fallbackMs >= startedAtMs - MEASUREMENT_FALLBACK_WINDOW_MS
    ) {
      return fallback;
    }
  }

  throw new Error("No measurement received yet");
}

// ===============================
// TIMER
// ===============================
function startCircleTimer({ duration = 30, timerId, textId }) {
  return new Promise((resolve) => {
    let timeLeft = duration;

    const circle = document.querySelector(
      `#${timerId} .progress-ring__circle`
    );
    const text = document.getElementById(textId);

    const radius = 28;
    const circumference = 2 * Math.PI * radius;

    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = 0;
    text.textContent = `${timeLeft}s`;

    const interval = setInterval(() => {
      timeLeft--;

      const progress = (duration - timeLeft) / duration;
      circle.style.strokeDashoffset = circumference * progress;
      text.textContent = `${timeLeft}s`;

      if (timeLeft <= 0) {
        clearInterval(interval);
        circle.style.strokeDashoffset = circumference;
        text.textContent = "✓";
        resolve();
      }
    }, 1000);
  });
}

// ===============================
// HEART RATE MEASUREMENT
// ===============================
const startBtn = document.getElementById("startHeartRateBtn");
const redoBtn = document.getElementById("redoHeartRateBtn");
const valueEl = document.getElementById("heartRateValue");
const statusEl = document.getElementById("heartRateStatus");

function setIdleState() {
  valueEl.textContent = "--";
  statusEl.classList.add("hidden");

  startBtn.disabled = false;
  startBtn.classList.remove("hidden", "measuring");
  startBtn.querySelector(".btn-label").textContent = "Start measurement";
  startBtn.querySelector(".loader").classList.add("hidden");
  startBtn.querySelector(".btn_icon").classList.remove("hidden");

  redoBtn.disabled = true;
  redoBtn.classList.add("hidden");
}

function setMeasuringState() {
  startBtn.disabled = true;
  startBtn.classList.add("measuring");
  startBtn.querySelector(".btn-label").textContent = "Measuring...";
  startBtn.querySelector(".loader").classList.remove("hidden");
  startBtn.querySelector(".btn_icon").classList.add("hidden");
  statusEl.classList.add("hidden");
}

function setSuccessState(bpm) {
  valueEl.textContent = bpm;
  startBtn.classList.add("hidden");
  redoBtn.disabled = false;
  redoBtn.classList.remove("hidden");
}

function setErrorState() {
  valueEl.textContent = "--";
  statusEl.textContent = "Sorry, connection error";
  statusEl.classList.remove("hidden");
  startBtn.disabled = false;
  startBtn.classList.remove("measuring");
  startBtn.querySelector(".btn-label").textContent = "Start measurement";
  startBtn.querySelector(".loader").classList.add("hidden");
  startBtn.querySelector(".btn_icon").classList.remove("hidden");
}

async function readHeartRateFromArduino(startedAtIso) {
  const timeoutMs = HEART_MEASUREMENT_DURATION_SEC * 1000 + 5000;
  const measurement = await waitForMeasurement(startedAtIso, timeoutMs);

  if (measurement?.bpm == null) {
    throw new Error("Missing heart rate");
  }

  return measurement.bpm;
}

startBtn?.addEventListener("click", async () => {
  if (activeMeasurement) return;

  activeMeasurement = "heart";
  lockUI([startBtn]);
  setMeasuringState();

  let session;
  try {
    session = await startMeasurementSession(HEART_MEASUREMENT_DURATION_SEC);
  } catch (error) {
    console.error(error);
    setErrorState();
    activeMeasurement = null;
    unlockUI();
    return;
  }

  try {
    const timerPromise = startCircleTimer({
      duration: HEART_MEASUREMENT_DURATION_SEC,
      timerId: "heartRateTimer",
      textId: "heartTimerText",
    });
    const measurementPromise = readHeartRateFromArduino(session?.started_at);
    const [, bpm] = await Promise.all([timerPromise, measurementPromise]);
    setSuccessState(bpm);
  } catch (error) {
    console.error(error);
    setErrorState();
  } finally {
    activeMeasurement = null;
    unlockUI();
  }
});

redoBtn?.addEventListener("click", setIdleState);
setIdleState();

// ===============================
// TEMPERATURE MEASUREMENT
// ===============================
const startTemperatureBtn = document.getElementById("startTemperatureBtn");
const redoTemperatureBtn = document.getElementById("redoTemperatureBtn");
const temperatureValueEl = document.getElementById("temperatureValue");
const temperatureStatusEl = document.getElementById("temperatureStatus");

function setTemperatureIdleState() {
  temperatureValueEl.textContent = "--";
  temperatureStatusEl.classList.add("hidden");

  startTemperatureBtn.disabled = false;
  startTemperatureBtn.classList.remove("hidden", "measuring");
  startTemperatureBtn.querySelector(".btn-label").textContent =
    "Start measurement";
  startTemperatureBtn.querySelector(".loader").classList.add("hidden");
  startTemperatureBtn.querySelector(".btn_icon").classList.remove("hidden");

  redoTemperatureBtn.disabled = true;
  redoTemperatureBtn.classList.add("hidden");
}

function setTemperatureMeasuringState() {
  startTemperatureBtn.disabled = true;
  startTemperatureBtn.classList.add("measuring");
  startTemperatureBtn.querySelector(".btn-label").textContent = "Measuring...";
  startTemperatureBtn.querySelector(".loader").classList.remove("hidden");
  startTemperatureBtn.querySelector(".btn_icon").classList.add("hidden");
  temperatureStatusEl.classList.add("hidden");
}

function setTemperatureSuccessState(temp) {
  temperatureValueEl.textContent = temp;
  startTemperatureBtn.classList.add("hidden");
  redoTemperatureBtn.disabled = false;
  redoTemperatureBtn.classList.remove("hidden");
}

function setTemperatureErrorState() {
  temperatureValueEl.textContent = "--";
  temperatureStatusEl.textContent = "Sorry, connection error";
  temperatureStatusEl.classList.remove("hidden");
  startTemperatureBtn.disabled = false;
  startTemperatureBtn.classList.remove("measuring");
  startTemperatureBtn.querySelector(".btn-label").textContent =
    "Start measurement";
  startTemperatureBtn.querySelector(".loader").classList.add("hidden");
  startTemperatureBtn.querySelector(".btn_icon").classList.remove("hidden");
}

async function readTemperatureFromArduino(startedAtIso) {
  const timeoutMs = TEMP_MEASUREMENT_DURATION_SEC * 1000 + 5000;
  const measurement = await waitForMeasurement(startedAtIso, timeoutMs);

  if (measurement?.temp == null) {
    throw new Error("Missing temperature");
  }

  return Number(measurement.temp).toFixed(1);
}

startTemperatureBtn?.addEventListener("click", async () => {
  if (activeMeasurement) return;

  activeMeasurement = "temperature";
  lockUI([startTemperatureBtn]);
  setTemperatureMeasuringState();

  let session;
  try {
    session = await startMeasurementSession(TEMP_MEASUREMENT_DURATION_SEC);
  } catch (error) {
    console.error(error);
    setTemperatureErrorState();
    activeMeasurement = null;
    unlockUI();
    return;
  }

  try {
    const timerPromise = startCircleTimer({
      duration: TEMP_MEASUREMENT_DURATION_SEC,
      timerId: "temperatureTimer",
      textId: "tempTimerText",
    });
    const measurementPromise = readTemperatureFromArduino(session?.started_at);
    const [, temp] = await Promise.all([timerPromise, measurementPromise]);
    setTemperatureSuccessState(temp);
  } catch (error) {
    console.error(error);
    setTemperatureErrorState();
  } finally {
    activeMeasurement = null;
    unlockUI();
  }
});

redoTemperatureBtn?.addEventListener("click", setTemperatureIdleState);
setTemperatureIdleState();

// ===============================
// TOOLTIP
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".info-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      btn
        .closest(".info-tooltip")
        ?.querySelector(".tooltip-content")
        ?.classList.toggle("active");
    });
  });
});

// ===============================
// CHECK-IN OPSLAAN
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const completeBtn = document.getElementById("completeCheckinBtn");
  const skipBtn = document.getElementById("skipMeasurementsBtn");

  function collectMeasurements() {
    return {
      heartRate: valueEl?.textContent || null,
      bodyTemperature: temperatureValueEl?.textContent || null,
    };
  }

  function submitCheckin(type) {
    localStorage.setItem(
      "dailyCheckin",
      JSON.stringify({
        type,
        measurements: collectMeasurements(),
        completedAt: new Date().toISOString(),
      })
    );
    localStorage.setItem("dailyCheckinDone", "true");
    window.location.href = "dashboard.html";
  }

  completeBtn?.addEventListener("click", () => submitCheckin("full"));
  skipBtn?.addEventListener("click", () => submitCheckin("partial"));
});

// ===============================
// TODAY INIT + LOCK
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  dateDisplay.textContent = formatDate(today);
  dateInput.valueAsDate = today;
  dateInput.disabled = true;
});
