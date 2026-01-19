
// Helpers: labels op basis van vandaag


const API_BASE = 'http://127.0.0.1:3000';
const TOKEN_KEY = 'pulsemind_token';

function getLastNDaysLabels(days) {
  const result = [];
  const today = new Date();

  // Loop door het aantal dagen terug vanaf vandaag
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);

    // Format van datum: dag + maand
    result.push(
      d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short'
      })
    );
  }

  return result;
}

// ==============================
// Canvas context
// ==============================

// Haalt de canvas context op voor Chart.js
const ctx = document.getElementById('healthChart').getContext('2d');

// ==============================
// Backend data (wordt gevuld via API)
// ==============================

function buildEmptySeries(length) {
  return Array.from({ length }, () => null);
}

const chartData = {
  7: {
    heartRate: buildEmptySeries(7),
    temperature: buildEmptySeries(7)
  },
  30: {
    heartRate: buildEmptySeries(30),
    temperature: buildEmptySeries(30)
  },
  365: {
    heartRate: buildEmptySeries(12),
    temperature: buildEmptySeries(12)
  }
};

// ==============================
// Labels voor de x-as
// ==============================

const labels = {
  // Labels per dag
  7: getLastNDaysLabels(7),
  30: getLastNDaysLabels(30),
  // Labels per maand
  365: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
};

// ==============================
// Initialisatie van de grafiek
// ==============================

const chart = new Chart(ctx, {
  type: 'line',
  data: {
    // Standaard: 12 maanden
    labels: labels[365],
    datasets: [
      {
        // Dataset voor hartslag
        label: 'Heart rate (bpm)',
        data: chartData[365].heartRate,
        borderColor: '#2563EB',
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        yAxisID: 'yHeart'
      },
      {
        // Dataset voor lichaamstemperatuur
        label: 'Body temperature (°C)',
        data: chartData[365].temperature,
        borderColor: '#F97316',
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        yAxisID: 'yTemp'
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        // Legenda onder de grafiek
        display: true,
        position: 'bottom'
      },
      tooltip: {
        // Tooltip toont beide datasets tegelijk
        mode: 'index',
        intersect: false
      }
    },
    scales: {
      // X-as zonder gridlijnen
      x: {
        grid: { display: false }
      },

      // Linker y-as: hartslag
      yHeart: {
        type: 'linear',
        position: 'left',
        grid: { display: false },
        ticks: {
          color: '#2563EB'
        },
        title: {
          display: true,
          text: 'bpm',
          color: '#2563EB'
        }
      },

      // Rechter y-as: temperatuur
      yTemp: {
        type: 'linear',
        position: 'right',
        grid: {
          // Geen gridlijnen over de grafiek
          drawOnChartArea: false
        },
        ticks: {
          color: '#F97316'
        },
        title: {
          display: true,
          text: '°C',
          color: '#F97316'
        }
      }
    }
  }
});

// ==============================
// Interactie met filterknoppen
// ==============================

let currentRange = 365;

function applyRange(range) {
  chart.data.labels = labels[range];
  chart.data.datasets[0].data = chartData[range].heartRate;
  chart.data.datasets[1].data = chartData[range].temperature;
  chart.update();
  updateStats(range);
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {

    // Verwijdert actieve status van alle knoppen
    document.querySelectorAll('.filter-btn')
      .forEach(b => b.classList.remove('active'));

    // Zet de aangeklikte knop op actief
    btn.classList.add('active');

    const range = Number(btn.dataset.range);
    currentRange = range;

    // Update labels en datasets op basis van geselecteerde periode
    applyRange(range);
  });
});

// ==============================
// Hulpfuncties voor statistieken
// ==============================

// Berekent het gemiddelde van een array
function average(arr) {
  const valid = arr.filter(value => typeof value === 'number' && !Number.isNaN(value));
  if (!valid.length) {
    return null;
  }
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// Update de statistische waarden boven de grafiek
function updateStats(range) {
  const heartAvg = average(chartData[range].heartRate);
  const tempAvg = average(chartData[range].temperature);

  const valueEls = document.querySelectorAll('.stats-cards .stat-card .stat-value .value');
  const heartEl = valueEls[0];
  const tempEl = valueEls[1];

  if (heartEl) {
    heartEl.textContent = heartAvg === null ? '--' : Math.round(heartAvg);
  }
  if (tempEl) {
    tempEl.textContent = tempAvg === null ? '--' : tempAvg.toFixed(1);
  }
}

// ==============================
// Metingen ophalen en omzetten naar grafiekdata
// ==============================

function toLocalDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLastNDaysKeys(days) {
  const keys = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    keys.push(toLocalDayKey(d));
  }

  return keys;
}

function aggregateByDay(rows, days) {
  const buckets = {};
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  rows.forEach(row => {
    if (!row?.timestamp) return;
    const timestamp = new Date(row.timestamp);
    if (Number.isNaN(timestamp.getTime()) || timestamp < start) return;

    const key = toLocalDayKey(timestamp);
    if (!buckets[key]) {
      buckets[key] = { bpmSum: 0, bpmCount: 0, tempSum: 0, tempCount: 0 };
    }

    if (typeof row.bpm === 'number') {
      buckets[key].bpmSum += row.bpm;
      buckets[key].bpmCount += 1;
    }
    if (typeof row.temp === 'number') {
      buckets[key].tempSum += row.temp;
      buckets[key].tempCount += 1;
    }
  });

  const keys = getLastNDaysKeys(days);

  return {
    heartRate: keys.map(key => {
      const bucket = buckets[key];
      if (!bucket || bucket.bpmCount === 0) return null;
      return bucket.bpmSum / bucket.bpmCount;
    }),
    temperature: keys.map(key => {
      const bucket = buckets[key];
      if (!bucket || bucket.tempCount === 0) return null;
      return Number((bucket.tempSum / bucket.tempCount).toFixed(1));
    })
  };
}

function aggregateByMonth(rows) {
  const now = new Date();
  const year = now.getFullYear();
  const buckets = Array.from({ length: 12 }, () => ({
    bpmSum: 0,
    bpmCount: 0,
    tempSum: 0,
    tempCount: 0
  }));

  rows.forEach(row => {
    if (!row?.timestamp) return;
    const timestamp = new Date(row.timestamp);
    if (Number.isNaN(timestamp.getTime()) || timestamp.getFullYear() !== year) return;

    const monthIndex = timestamp.getMonth();

    if (typeof row.bpm === 'number') {
      buckets[monthIndex].bpmSum += row.bpm;
      buckets[monthIndex].bpmCount += 1;
    }
    if (typeof row.temp === 'number') {
      buckets[monthIndex].tempSum += row.temp;
      buckets[monthIndex].tempCount += 1;
    }
  });

  return {
    heartRate: buckets.map(bucket =>
      bucket.bpmCount ? bucket.bpmSum / bucket.bpmCount : null
    ),
    temperature: buckets.map(bucket =>
      bucket.tempCount ? Number((bucket.tempSum / bucket.tempCount).toFixed(1)) : null
    )
  };
}

async function fetchMeasurements() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    throw new Error('Log eerst in om metingen te zien.');
  }

  const response = await fetch(`${API_BASE}/api/measurements/me?days=365&limit=5000`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => []);
  if (!response.ok) {
    const message = data?.error || data?.message || 'Metingen ophalen mislukt.';
    throw new Error(message);
  }

  return Array.isArray(data) ? data : [];
}

async function loadMeasurementData() {
  try {
    const rows = await fetchMeasurements();
    chartData[7] = aggregateByDay(rows, 7);
    chartData[30] = aggregateByDay(rows, 30);
    chartData[365] = aggregateByMonth(rows);
    applyRange(currentRange);
  } catch (error) {
    console.error(error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyRange(currentRange);
  loadMeasurementData();
});

// ==============================
// AI-advies ophalen
// ==============================

const aiAdviceBtn = document.getElementById("ai-advice-btn");
const aiAdviceOutput = document.getElementById("ai-advice-output");
const aiAdviceStatus = document.getElementById("ai-advice-status");
const aiAdvicePlaceholder = document.querySelector(".ai-advice-placeholder");

function setAiAdviceStatus(message, state = "info") {
  if (!aiAdviceStatus) return;
  if (!message) {
    aiAdviceStatus.textContent = "";
    aiAdviceStatus.style.display = "none";
    return;
  }
  aiAdviceStatus.textContent = message;
  aiAdviceStatus.dataset.state = state;
  aiAdviceStatus.style.display = "block";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAiAdvice(analysis) {
  if (!aiAdviceOutput) return;
  let lines = [];

  if (typeof analysis === "string") {
    lines = [analysis];
  } else if (analysis && typeof analysis === "object") {
    if (analysis.summary) lines.push(`Samenvatting: ${analysis.summary}`);
    if (analysis.advice) lines.push(`Advies: ${analysis.advice}`);
    if (analysis.risk_level) lines.push(`Risico: ${analysis.risk_level}`);
    if (analysis.mood) lines.push(`Mood: ${analysis.mood}`);
  }

  if (lines.length === 0) {
    lines = ["Geen AI-advies beschikbaar."];
  }

  aiAdviceOutput.innerHTML = lines
    .map(line => `<p>${escapeHtml(line)}</p>`)
    .join("");
  aiAdviceOutput.classList.remove("hidden");
  if (aiAdvicePlaceholder) aiAdvicePlaceholder.classList.add("hidden");
}

async function fetchAiAdvice() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    throw new Error("Log eerst in om AI-advies te krijgen.");
  }

  const response = await fetch(`${API_BASE}/api/analysis/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || data.message || "AI-advies ophalen mislukt.";
    throw new Error(message);
  }
  return data.analysis || data;
}

if (aiAdviceBtn) {
  aiAdviceBtn.addEventListener("click", async () => {
    aiAdviceBtn.disabled = true;
    setAiAdviceStatus("AI-advies ophalen...", "info");
    try {
      const analysis = await fetchAiAdvice();
      renderAiAdvice(analysis);
      setAiAdviceStatus("AI-advies bijgewerkt.", "success");
    } catch (error) {
      setAiAdviceStatus(error.message, "error");
    } finally {
      aiAdviceBtn.disabled = false;
    }
  });
}
