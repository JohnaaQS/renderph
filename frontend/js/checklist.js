document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = (typeof getPulseMindApiBase === "function")
    ? getPulseMindApiBase()
    : (window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "http://127.0.0.1:3000");
  const TOKEN_KEY = "pulsemind_token";

  const moodSlider = document.querySelector(".mood-slider:not(.sleep-slider) .mood-range");
  const moodEmoji = document.querySelector(".mood-slider:not(.sleep-slider) .mood-emoji");
  const moodTrack = document.querySelector(".mood-slider:not(.sleep-slider) .mood-track");

  const dateInput = document.getElementById("date-field");
  const dateDisplay = document.querySelector(".date-display");
  const continueBtn = document.querySelector(".continue-btn");
  const dateInputWrapper = document.querySelector(".date-input");

  const notesField = document.querySelector("textarea");
  const activityButtons = document.querySelectorAll(".activity-btn");

  const sleepRange = document.getElementById("sleepRange");
  const sleepBubble = document.getElementById("sleepBubble");

  const statusEl = document.getElementById("checklist-status");

  if (!moodSlider || !moodEmoji || !moodTrack || !dateInput || !dateDisplay || !continueBtn) {
    return;
  }

  const gevoelens = ["heel slecht", "slecht", "neutraal", "goed", "heel goed"];
  const emojiImages = [
    "images/emoji/heel_slecht_face.png",
    "images/emoji/slecht_face.png",
    "images/emoji/neutraal_face.png",
    "images/emoji/goed_face.png",
    "images/emoji/heel_goed_face.png"
  ];

  let hasInteractedWithMood = false;

  function setChecklistStatus(message, state = "info") {
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

  function updateEmojiPosition() {
    const value = Number(moodSlider.value);

    if (!hasInteractedWithMood) {
      moodEmoji.src = "images/emoji/empty_face.png";
    } else {
      moodEmoji.src = emojiImages[value];
    }

    const min = Number(moodSlider.min);
    const max = Number(moodSlider.max);
    const percent = (value - min) / (max - min);

    const trackWidth = moodTrack.offsetWidth;
    const thumbSize = 20;
    const emojiSize = 24;

    const position = percent * (trackWidth - thumbSize);
    moodEmoji.style.left = `${position + thumbSize / 2 - emojiSize / 2}px`;
  }

  moodSlider.addEventListener("input", () => {
    hasInteractedWithMood = true;
    updateEmojiPosition();
  });

  window.addEventListener("resize", updateEmojiPosition);
  updateEmojiPosition();

  const today = new Date();
  const defaultDateLabel = dateDisplay.textContent;

  function toInputDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const maxDate = toInputDate(today);
  dateInput.max = maxDate;

  function parseInputDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function formatDate(value) {
    const date = value instanceof Date ? value : parseInputDate(value);
    if (!date || Number.isNaN(date.getTime())) return value || "";
    return date.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function isToday(dateString) {
    return dateString === maxDate;
  }

  function updateDateState() {
    if (!dateInput.value) {
      dateDisplay.textContent = defaultDateLabel;
      continueBtn.textContent = "Continue to Measurements";
      delete continueBtn.dataset.mode;
      return;
    }

    dateDisplay.textContent = formatDate(dateInput.value);

    if (isToday(dateInput.value)) {
      continueBtn.textContent = "Continue to Measurements";
      continueBtn.dataset.mode = "continue";
    } else {
      continueBtn.textContent = "Save data";
      continueBtn.dataset.mode = "save";
    }
  }

  dateInput.addEventListener("change", updateDateState);
  dateInput.addEventListener("input", updateDateState);

  if (!dateInput.value) {
    dateInput.value = maxDate;
  }
  updateDateState();

  if (dateInputWrapper) {
    dateInputWrapper.addEventListener("click", (event) => {
      if (event.target === dateInput) return;
      if (typeof dateInput.showPicker === "function") {
        dateInput.showPicker();
      } else {
        dateInput.focus();
        dateInput.click();
      }
    });
  }

  activityButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
    });
  });

  function updateSleepBubble() {
    if (!sleepRange || !sleepBubble) return;
    const min = sleepRange.min;
    const max = sleepRange.max;
    const val = sleepRange.value;

    const percent = (val - min) / (max - min);
    sleepBubble.style.left = `${percent * 100}%`;
    sleepBubble.textContent = `${val}h`;
  }

  if (sleepRange) {
    sleepRange.addEventListener("input", updateSleepBubble);
    updateSleepBubble();
  }

  function getGevoelValue() {
    const value = Number(moodSlider.value);
    return Number.isFinite(value) ? gevoelens[value] : null;
  }

  function collectUserInput() {
    return {
      date: dateInput.value || null,
      gevoel: getGevoelValue(),
      uren_geslapen: sleepRange ? sleepRange.value : null,
      note: notesField?.value || "",
      activiteiten: Array.from(
        document.querySelectorAll(".activity-btn.active")
      ).map((btn) => btn.textContent.trim())
    };
  }

  async function postDailyLog(payload) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      throw new Error("Je bent niet ingelogd.");
    }

    const response = await fetch(`${API_BASE}/api/daily-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error || data.message || "Opslaan mislukt.";
      throw new Error(message);
    }

    return data;
  }

  continueBtn.addEventListener("click", async () => {
    setChecklistStatus("");

    if (!dateInput.value) {
      setChecklistStatus("Selecteer eerst een datum.", "error");
      return;
    }

    if (!hasInteractedWithMood) {
      setChecklistStatus("Kies eerst je mood.", "error");
      return;
    }

    const payload = collectUserInput();
    localStorage.setItem("checkinUserInput", JSON.stringify(payload));

    try {
      await postDailyLog(payload);
      setChecklistStatus("Check-in opgeslagen.", "success");

      const mode = continueBtn.dataset.mode || (isToday(dateInput.value) ? "continue" : "save");
      const target = mode === "continue" ? "measurements.html" : "dashboard.html";
      setTimeout(() => {
        window.location.href = target;
      }, 600);
    } catch (error) {
      setChecklistStatus(error.message, "error");
    }
  });
});
