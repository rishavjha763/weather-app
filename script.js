

const CONFIG = {
  GEOCODE_URL: "https://geocoding-api.open-meteo.com/v1/search",
  FORECAST_URL: "https://api.open-meteo.com/v1/forecast",
  COUNTRY: "IN",
  REQUEST_TIMEOUT_MS: 8000,
};

// IMD-style rainfall categories, mapped to IMD's official warning colours.
// Thresholds follow IMD's standard 24hr rainfall classification (mm).
const CATEGORY_SCALE = [
  { max: 0, label: "No Rain", color: "var(--warn-green)" },
  { max: 15, label: "Light Rain", color: "var(--warn-green)" },
  { max: 64, label: "Moderate Rain", color: "var(--warn-yellow)" },
  { max: 115, label: "Heavy Rain", color: "var(--warn-orange)" },
  { max: 204, label: "Very Heavy Rain", color: "var(--warn-red)" },
  { max: Infinity, label: "Extremely Heavy Rain", color: "var(--warn-red)" },
];

// Minimal WMO weather-code → plain-English map (Open-Meteo uses WMO codes).
const WMO = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Light showers",
  81: "Showers",
  82: "Violent showers",
  95: "Thunderstorm",
  96: "Thunderstorm, hail",
  99: "Severe thunderstorm, hail",
};


const el = {
  citySearch: document.getElementById("citySearch"),
  suggestList: document.getElementById("suggestList"),
  fetchBtn: document.getElementById("fetchBtn"),
  statusBanner: document.getElementById("statusBanner"),
  heroLocation: document.getElementById("heroLocation"),
  heroActual: document.getElementById("heroActual"),
  heroDate: document.getElementById("heroDate"),
  heroNormal: document.getElementById("heroNormal"),
  heroDeparture: document.getElementById("heroDeparture"),
  heroBadge: document.getElementById("heroBadge"),
  forecastStrip: document.getElementById("forecastStrip"),
  gaugeFill: document.getElementById("gaugeFill"),
  fillGradStart: document.getElementById("fillGradStart"),
  fillGradEnd: document.getElementById("fillGradEnd"),
  heroTemp: document.getElementById("heroTemp"),
  unitC: document.getElementById("unitC"),
  unitF: document.getElementById("unitF"),
  geoBtn: document.getElementById("geoBtn"),
  hero: document.getElementById("hero"),
};

// Stat labels swap out from IMD's "Normal/Departure" framing to plain
// temperature stats, since Open-Meteo doesn't publish a climatological
// "normal" baseline the way IMD's own rainfall API does.
document.addEventListener("DOMContentLoaded", () => {
  const labels = document.querySelectorAll(".stat__label");
  if (labels[0]) labels[0].textContent = "High / Low";
  if (labels[1]) labels[1].textContent = "Conditions";
});

let currentDays = []; // normalized 5-day forecast currently on screen
let selectedPlace = null; // { name, admin1, lat, lon }
let suggestions = [];
let activeSuggestIndex = -1;
let searchDebounce = null;
let currentDayIndex = 0;
let tempUnit = "C"; // 'C' or 'F' — Open-Meteo data is fetched in °C and converted on display


function init() {
  el.citySearch.addEventListener("input", onSearchInput);
  el.citySearch.addEventListener("keydown", onSearchKeydown);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".field--search")) hideSuggestions();
  });
  el.fetchBtn.addEventListener("click", () => {
    if (selectedPlace) loadForecast(selectedPlace);
    else if (el.citySearch.value.trim())
      searchAndPickFirst(el.citySearch.value.trim());
  });
  el.unitC.addEventListener("click", () => setTempUnit("C"));
  el.unitF.addEventListener("click", () => setTempUnit("F"));
  el.geoBtn.addEventListener("click", useMyLocation);

  // Load a sensible default so the page never looks empty on first paint.
  searchAndPickFirst("New Delhi");
}

function onSearchInput() {
  selectedPlace = null;
  const q = el.citySearch.value.trim();
  clearTimeout(searchDebounce);
  if (q.length < 2) {
    hideSuggestions();
    return;
  }
  searchDebounce = setTimeout(() => fetchSuggestions(q), 300);
}

async function fetchSuggestions(query) {
  try {
   
    const url = new URL(CONFIG.GEOCODE_URL);
    url.searchParams.set("name", query);
    url.searchParams.set("count", "20");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const res = await fetchWithTimeout(url.toString());
    const data = await res.json();
    const results = data.results || [];

  
    suggestions = results
      .filter((r) => r.country_code === CONFIG.COUNTRY)
      .slice(0, 8)
      .map((r) => ({
        name: r.name,
        admin1: r.admin1 && r.admin1 !== r.name ? r.admin1 : "",
        lat: r.latitude,
        lon: r.longitude,
      }));
    renderSuggestions();
  } catch (err) {
    console.warn("[MEGH] geocoding failed:", err.message);
    suggestions = [];
    renderSuggestions();
  }
}

function renderSuggestions() {
  activeSuggestIndex = -1;
  if (suggestions.length === 0) {
    el.suggestList.innerHTML = `<li class="suggest-list__empty">No Indian cities found — try a different spelling.</li>`;
    el.suggestList.hidden = false;
    el.citySearch.setAttribute("aria-expanded", "true");
    return;
  }
  el.suggestList.innerHTML = suggestions
    .map(
      (s, i) =>
        `<li role="option" data-index="${i}">${s.name}<span>${s.admin1}</span></li>`,
    )
    .join("");
  el.suggestList.hidden = false;
  el.citySearch.setAttribute("aria-expanded", "true");

  el.suggestList.querySelectorAll("li[data-index]").forEach((li) => {
    li.addEventListener("click", () =>
      pickSuggestion(Number(li.dataset.index)),
    );
  });
}

function hideSuggestions() {
  el.suggestList.hidden = true;
  el.citySearch.setAttribute("aria-expanded", "false");
}

function onSearchKeydown(e) {
  const items = el.suggestList.querySelectorAll("li[data-index]");
  if (e.key === "ArrowDown" && items.length) {
    e.preventDefault();
    activeSuggestIndex = Math.min(activeSuggestIndex + 1, items.length - 1);
    highlightSuggestion(items);
  } else if (e.key === "ArrowUp" && items.length) {
    e.preventDefault();
    activeSuggestIndex = Math.max(activeSuggestIndex - 1, 0);
    highlightSuggestion(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (activeSuggestIndex >= 0) pickSuggestion(activeSuggestIndex);
    else if (suggestions.length) pickSuggestion(0);
    else if (el.citySearch.value.trim())
      searchAndPickFirst(el.citySearch.value.trim());
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
}

function highlightSuggestion(items) {
  items.forEach((li, i) =>
    li.classList.toggle("is-active", i === activeSuggestIndex),
  );
  items[activeSuggestIndex]?.scrollIntoView({ block: "nearest" });
}

function pickSuggestion(index) {
  const place = suggestions[index];
  if (!place) return;
  selectedPlace = place;
  hideSuggestions();
  // Empty the box straight away so it's ready for the next search; the
  // placeholder quietly confirms what's currently loaded instead.
  el.citySearch.value = "";
  el.citySearch.placeholder = `Showing: ${place.name}${place.admin1 ? ", " + place.admin1 : ""} — search another city…`;
  loadForecast(place);
}

async function searchAndPickFirst(query) {
  await fetchSuggestions(query);
  if (suggestions.length) pickSuggestion(0);
  else
    setStatus(
      "error",
      `Couldn't find "${query}" in India — check the spelling and try again.`,
    );
}


function useMyLocation() {
  if (!navigator.geolocation) {
    setStatus("error", "Geolocation is not supported by this browser.");
    return;
  }
  el.geoBtn.classList.add("is-loading");
  setStatus("loading", "Finding your location…");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      el.geoBtn.classList.remove("is-loading");
      const place = {
        name: "Your location",
        admin1: "",
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      };
      selectedPlace = place;
      hideSuggestions();
      el.citySearch.value = "";
      el.citySearch.placeholder =
        "Showing: your current location — search a city…";
      loadForecast(place);
    },
    (err) => {
      el.geoBtn.classList.remove("is-loading");
      setStatus(
        "error",
        `Couldn't get your location (${err.message}). Try searching instead.`,
      );
    },
    { timeout: 10000 },
  );
}

function setStatus(tone, message) {
  el.statusBanner.dataset.tone = tone;
  el.statusBanner.textContent = message;
  el.statusBanner.classList.add("is-visible");
}
function clearStatus() {
  el.statusBanner.classList.remove("is-visible");
}


async function loadForecast(place) {
  el.fetchBtn.disabled = true;
  setStatus("loading", `Fetching live forecast for ${place.name}…`);

  try {
    const url = new URL(CONFIG.FORECAST_URL);
    url.searchParams.set("latitude", place.lat);
    url.searchParams.set("longitude", place.lon);
    url.searchParams.set(
      "daily",
      [
        "precipitation_sum",
        "temperature_2m_max",
        "temperature_2m_min",
        "weathercode",
      ].join(","),
    );
    url.searchParams.set("timezone", "Asia/Kolkata");
    url.searchParams.set("forecast_days", "5");

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    currentDays = normalizeOpenMeteo(data);
    clearStatus(); // hero + forecast strip already make the location/data clear — no banner needed on success
  } catch (err) {
    console.warn("[MEGH] forecast fetch failed:", err.message);
    setStatus(
      "error",
      `Couldn't reach the forecast service ("${err.message}"). Check your connection and try again.`,
    );
    el.fetchBtn.disabled = false;
    return;
  }

  el.fetchBtn.disabled = false;
  renderForecastStrip(currentDays);
  el.hero.classList.remove("is-ready");
  void el.hero.offsetWidth; // restart the entrance animation on every fresh search
  el.hero.classList.add("is-ready");
  selectDay(0);
}

function normalizeOpenMeteo(data) {
  const d = data.daily;
  if (!d || !Array.isArray(d.time))
    throw new Error("unexpected response shape");

  return d.time.map((date, i) => {
    const actual = Math.round((d.precipitation_sum?.[i] ?? 0) * 10) / 10;
    return {
      date,
      actual,
      tMax: Math.round(d.temperature_2m_max?.[i] ?? 0),
      tMin: Math.round(d.temperature_2m_min?.[i] ?? 0),
      conditions: WMO[d.weathercode?.[i]] || "Mixed conditions",
      category: categorize(actual),
    };
  });
}

function categorize(mm) {
  return CATEGORY_SCALE.find((c) => mm <= c.max);
}

function celsiusTo(unit, c) {
  return unit === "F" ? Math.round((c * 9) / 5 + 32) : Math.round(c);
}

function setTempUnit(unit) {
  if (unit === tempUnit) return;
  tempUnit = unit;
  el.unitC.classList.toggle("is-active", unit === "C");
  el.unitF.classList.toggle("is-active", unit === "F");
  if (currentDays.length) selectDay(currentDayIndex); // re-render with new unit
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CONFIG.REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function renderForecastStrip(days) {
  el.forecastStrip.innerHTML = days
    .map((d, i) => {
      const dateObj = new Date(d.date);
      const dayLabel =
        i === 0 ? "Today" : DAY_NAMES[dateObj.getDay()] || `Day ${i + 1}`;
      const barPct = Math.min(100, Math.round((d.actual / 60) * 100));
      return `
        <button class="day-card" data-index="${i}" style="--dot:${d.category.color}" aria-pressed="${i === 0}">
          <div class="day-card__top">
            <span class="day-card__day">${dayLabel}</span>
            <span class="day-card__date">${formatDate(d.date)}</span>
          </div>
          <div class="day-card__mm">${d.actual}<span>mm</span></div>
          <div class="day-card__bar"><i style="width:${barPct}%"></i></div>
          <div class="day-card__cat">${d.category.label}</div>
        </button>
      `;
    })
    .join("");

  el.forecastStrip.querySelectorAll(".day-card").forEach((card) => {
    card.addEventListener("click", () => selectDay(Number(card.dataset.index)));
  });
}

function selectDay(index) {
  const day = currentDays[index];
  if (!day) return;
  currentDayIndex = index;

  el.forecastStrip.querySelectorAll(".day-card").forEach((card, i) => {
    const active = i === index;
    card.classList.toggle("is-active", active);
    card.setAttribute("aria-pressed", String(active));
  });

  const label = selectedPlace
    ? `${selectedPlace.name}${selectedPlace.admin1 ? ", " + selectedPlace.admin1 : ""}`
    : el.citySearch.value;

  const tMax = celsiusTo(tempUnit, day.tMax);
  const tMin = celsiusTo(tempUnit, day.tMin);
  const tAvg = celsiusTo(tempUnit, (day.tMax + day.tMin) / 2);

  el.heroLocation.textContent = label;
  el.heroActual.textContent = day.actual;
  el.heroDate.textContent = formatDate(day.date, true);
  el.heroNormal.textContent = `${tMax}° / ${tMin}°${tempUnit}`;
  el.heroDeparture.textContent = day.conditions;
  el.heroBadge.textContent = day.category.label;
  el.heroBadge.style.setProperty("--dot", day.category.color);

  el.heroTemp.innerHTML = `${tAvg}<span class="hero__unit">°${tempUnit}</span>`;

  updateGauge(day);
}

function updateGauge(day) {
  // Map rainfall (0–120mm ceiling) to a fill height inside the cloud
  // silhouette (clip area spans roughly y:82 to y:184 in the 220x260 viewBox).
  const ceiling = 120;
  const ratio = Math.min(1, day.actual / ceiling);
  const topY = 184 - ratio * 100; // 184 = empty, 84 = full
  el.gaugeFill.setAttribute("y", String(topY));

  el.fillGradStart.setAttribute("stop-color", day.category.color);
  el.fillGradEnd.setAttribute("stop-color", "var(--rain-light)");

  // Vary droplet tempo with intensity: heavier rain = faster droplets.
  const speed = Math.max(0.7, 1.8 - ratio * 1.1);
  document.querySelectorAll(".droplet").forEach((dEl) => {
    dEl.style.animationDuration = `${speed}s`;
  });
}

function formatDate(iso, long = false) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(
    "en-IN",
    long
      ? { weekday: "long", day: "numeric", month: "long" }
      : { day: "numeric", month: "short" },
  );
}

document.addEventListener("DOMContentLoaded", init);
