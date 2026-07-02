

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 10000;

const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const locateBtn = document.getElementById("locateBtn");
const suggestBox = document.getElementById("suggestions");
const statusBox = document.getElementById("statusBox");
const content = document.getElementById("content");
const unitCBtn = document.getElementById("unitC");
const unitFBtn = document.getElementById("unitF");

let unit = "C"; // 'C' or 'F'
let lastData = null; // last successful API payload, used to re-render on unit toggle
let lastPlace = null;

// WMO weather code -> { icon, label }
// Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
const WMO = {
  0: { icon: "☀️", label: "Clear sky" },
  1: { icon: "🌤️", label: "Mainly clear" },
  2: { icon: "⛅", label: "Partly cloudy" },
  3: { icon: "☁️", label: "Overcast" },
  45: { icon: "🌫️", label: "Fog" },
  48: { icon: "🌫️", label: "Rime fog" },
  51: { icon: "🌦️", label: "Light drizzle" },
  53: { icon: "🌦️", label: "Drizzle" },
  55: { icon: "🌧️", label: "Dense drizzle" },
  56: { icon: "🌧️", label: "Freezing drizzle" },
  57: { icon: "🌧️", label: "Freezing drizzle" },
  61: { icon: "🌦️", label: "Light rain" },
  63: { icon: "🌧️", label: "Rain" },
  65: { icon: "🌧️", label: "Heavy rain" },
  66: { icon: "🌧️", label: "Freezing rain" },
  67: { icon: "🌧️", label: "Freezing rain" },
  71: { icon: "🌨️", label: "Light snow" },
  73: { icon: "🌨️", label: "Snow" },
  75: { icon: "❄️", label: "Heavy snow" },
  77: { icon: "❄️", label: "Snow grains" },
  80: { icon: "🌦️", label: "Rain showers" },
  81: { icon: "🌧️", label: "Rain showers" },
  82: { icon: "⛈️", label: "Violent showers" },
  85: { icon: "🌨️", label: "Snow showers" },
  86: { icon: "❄️", label: "Snow showers" },
  95: { icon: "⛈️", label: "Thunderstorm" },
  96: { icon: "⛈️", label: "Thunderstorm with hail" },
  99: { icon: "⛈️", label: "Thunderstorm with hail" },
};
function wmoInfo(code) {
  return WMO[code] || { icon: "🌡️", label: "Unknown" };
}

function cToF(c) {
  return (c * 9) / 5 + 32;
}
function fmtTemp(celsius) {
  const v = unit === "C" ? celsius : cToF(celsius);
  return Math.round(v);
}


function timeoutPromise(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("TIMEOUT")), ms);
  });
}

async function fetchJSONOnce(url) {
  let res;
  try {
    res = await Promise.race([fetch(url), timeoutPromise(REQUEST_TIMEOUT_MS)]);
  } catch (err) {
    if (err.message === "TIMEOUT") {
      throw new Error(
        "The request timed out. Please check your internet connection and try again.",
      );
    }
    if (err instanceof TypeError) {
      // fetch() throws a generic TypeError ("Failed to fetch") for network/CORS/DNS issues
      throw new Error(
        'Could not reach the weather service. Check your internet connection, then tap "Try Again". If this keeps happening, the page may need to be served from a local server (e.g. VS Code "Live Server") instead of opened directly as a file.',
      );
    }
    throw err;
  }

  if (!res.ok) {
    let reason = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody && errBody.reason) reason = errBody.reason;
    } catch (_) {
      /* ignore parse errors on error body */
    }
    throw new Error(reason);
  }
  return await res.json();
}

async function fetchJSON(url) {
  try {
    return await fetchJSONOnce(url);
  } catch (firstErr) {
    console.warn("First attempt failed, retrying once:", firstErr.message);
    await new Promise((r) => setTimeout(r, 1200));
    try {
      return await fetchJSONOnce(url);
    } catch (secondErr) {
      console.warn("Retry also failed:", secondErr.message);
      throw secondErr;
    }
  }
}

function showLoading(msg) {
  statusBox.innerHTML = `<div class="spinner"></div><div class="status-msg">${msg}</div>`;
  statusBox.classList.remove("hidden");
  content.classList.add("hidden");
}
function showError(msg) {
  statusBox.innerHTML = `
    <div class="status-icon">⚠️</div>
    <div class="status-msg">${msg}</div>
    <button class="retry-btn" id="retryBtn">Try Again</button>
  `;
  statusBox.classList.remove("hidden");
  content.classList.add("hidden");
  document.getElementById("retryBtn").addEventListener("click", () => {
    if (lastPlace) loadWeatherForPlace(lastPlace);
    else
      loadWeatherForPlace({
        name: "Gurugram",
        country: "India",
        admin1: "Haryana",
        latitude: 28.4595,
        longitude: 77.0266,
      });
  });
}
function showContent() {
  statusBox.classList.add("hidden");
  content.classList.remove("hidden");
}

function updateBackground(isDay, code) {
  const body = document.body;
  if (!isDay) {
    body.style.background =
      "linear-gradient(160deg, #0B1B33 0%, #17284a 45%, #0B1B33 100%)";
  } else if (code >= 61 && code <= 99) {
    body.style.background =
      "linear-gradient(160deg, #33475a 0%, #4a6178 45%, #33475a 100%)";
  } else {
    body.style.background =
      "linear-gradient(160deg, #1B3A5C 0%, #2C5885 45%, #1B3A5C 100%)";
  }
}

async function geocodeCity(name) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=5&language=en&format=json`;
  const data = await fetchJSON(url);
  return data.results || [];
}

async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day",
    hourly: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,uv_index_max",
    timezone: "auto",
    forecast_days: 7,
  });
  return fetchJSON(`${FORECAST_URL}?${params.toString()}`);
}

function renderCurrent(place, data) {
  const cur = data.current;
  const info = wmoInfo(cur.weather_code);

  document.getElementById("placeName").textContent = place.name;
  document.getElementById("placeCountry").textContent = place.admin1
    ? `${place.admin1}, ${place.country}`
    : place.country || "";

  const updatedTime = new Date(cur.time);
  document.getElementById("lastUpdated").textContent =
    `Updated ${updatedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  document.getElementById("mainIcon").textContent = info.icon;
  document.getElementById("mainTemp").innerHTML =
    `${fmtTemp(cur.temperature_2m)}<sup>°${unit}</sup>`;
  document.getElementById("mainDesc").textContent = info.label;
  document.getElementById("feelsLike").textContent =
    `Feels like ${fmtTemp(cur.apparent_temperature)}°`;

  document.getElementById("statHumidity").textContent =
    `${cur.relative_humidity_2m}%`;
  document.getElementById("statWind").textContent =
    `${Math.round(cur.wind_speed_10m)} km/h`;

  const todayUV = data.daily.uv_index_max
    ? Math.round(data.daily.uv_index_max[0])
    : "--";
  document.getElementById("statUV").textContent = todayUV;

  updateBackground(cur.is_day === 1, cur.weather_code);
}

function renderHourly(data) {
  const row = document.getElementById("hourlyRow");
  row.innerHTML = "";

  const nowISO = data.current.time;
  let startIdx = data.hourly.time.findIndex((t) => t === nowISO);
  if (startIdx === -1) startIdx = 0;

  for (
    let i = startIdx;
    i < Math.min(startIdx + 24, data.hourly.time.length);
    i++
  ) {
    const dt = new Date(data.hourly.time[i]);
    const hourLabel =
      dt.getHours() === 0
        ? "12AM"
        : dt.getHours() < 12
          ? dt.getHours() + "AM"
          : dt.getHours() === 12
            ? "12PM"
            : dt.getHours() - 12 + "PM";
    const info = wmoInfo(data.hourly.weather_code[i]);
    const isNow = i === startIdx;

    const card = document.createElement("div");
    card.className = "hour-card" + (isNow ? " now" : "");
    card.innerHTML = `
      <div class="h-time">${isNow ? "Now" : hourLabel}</div>
      <div class="h-icon">${info.icon}</div>
      <div class="h-temp">${fmtTemp(data.hourly.temperature_2m[i])}°</div>
    `;
    row.appendChild(card);
  }
}

function renderDaily(data) {
  const list = document.getElementById("dailyList");
  list.innerHTML = "";

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  data.daily.time.forEach((dateStr, i) => {
    const dt = new Date(dateStr);
    const dayName = i === 0 ? "Today" : days[dt.getDay()];
    const info = wmoInfo(data.daily.weather_code[i]);

    const row = document.createElement("div");
    row.className = "day-row";
    row.innerHTML = `
      <div class="d-name">${dayName}</div>
      <div class="d-icon">${info.icon}</div>
      <div class="d-desc">${info.label}</div>
      <div class="d-range">${fmtTemp(data.daily.temperature_2m_max[i])}° <span class="lo">/ ${fmtTemp(data.daily.temperature_2m_min[i])}°</span></div>
    `;
    list.appendChild(row);
  });
}

function renderAll(place, data) {
  lastData = data;
  lastPlace = place;
  renderCurrent(place, data);
  renderHourly(data);
  renderDaily(data);
  showContent();
}

async function loadWeatherForPlace(place) {
  try {
    showLoading(`Loading weather for ${place.name}…`);
    const data = await fetchForecast(place.latitude, place.longitude);
    renderAll(place, data);
  } catch (err) {
    console.error(err);
    showError(
      err.message || "Something went wrong while loading weather data.",
    );
  }
}

async function handleSearch() {
  const query = cityInput.value.trim();
  if (!query) return;

  suggestBox.style.display = "none";
  showLoading("Searching for city…");

  try {
    const results = await geocodeCity(query);
    if (results.length === 0) {
      showError(
        `No results found for "${query}". Check the spelling and try again.`,
      );
      return;
    }
    await loadWeatherForPlace(results[0]);
  } catch (err) {
    console.error(err);
    showError(err.message || "City search failed.");
  }
}

searchBtn.addEventListener("click", handleSearch);
cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});

let debounceTimer;
cityInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const query = cityInput.value.trim();
  if (query.length < 2) {
    suggestBox.style.display = "none";
    return;
  }
  debounceTimer = setTimeout(async () => {
    try {
      const results = await geocodeCity(query);
      if (results.length === 0) {
        suggestBox.style.display = "none";
        return;
      }
      suggestBox.innerHTML = results
        .map(
          (r) => `
        <div data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${r.name}" data-country="${r.country || ""}" data-admin="${r.admin1 || ""}">
          <div class="s-name">${r.name}</div>
          <div class="s-region">${r.admin1 ? r.admin1 + ", " : ""}${r.country || ""}</div>
        </div>
      `,
        )
        .join("");
      suggestBox.style.display = "block";

      suggestBox.querySelectorAll("div[data-lat]").forEach((div) => {
        div.addEventListener("click", () => {
          const place = {
            name: div.dataset.name,
            country: div.dataset.country,
            admin1: div.dataset.admin,
            latitude: parseFloat(div.dataset.lat),
            longitude: parseFloat(div.dataset.lon),
          };
          cityInput.value = place.name;
          suggestBox.style.display = "none";
          loadWeatherForPlace(place);
        });
      });
    } catch (err) {
      console.error(err);
      // Suggestions failing silently is fine — the main search button still works
      suggestBox.style.display = "none";
    }
  }, 400);
});

// Close suggestions when clicking elsewhere
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-row")) suggestBox.style.display = "none";
});

locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showError("Geolocation is not supported in this browser.");
    return;
  }
  showLoading("Getting your location…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const place = {
        name: "Your Location",
        country: "",
        admin1: "",
        latitude,
        longitude,
      };
      await loadWeatherForPlace(place);
    },
    () =>
      showError(
        "Location access was denied. Please search for a city instead.",
      ),
  );
});

function setUnit(newUnit) {
  if (unit === newUnit) return;
  unit = newUnit;
  unitCBtn.classList.toggle("active", unit === "C");
  unitFBtn.classList.toggle("active", unit === "F");
  if (lastData && lastPlace) renderAll(lastPlace, lastData);
}
unitCBtn.addEventListener("click", () => setUnit("C"));
unitFBtn.addEventListener("click", () => setUnit("F"));

// Default: load Gurugram on first visit
loadWeatherForPlace({
  name: "Gurugram",
  country: "India",
  admin1: "Haryana",
  latitude: 28.4595,
  longitude: 77.0266,
});
