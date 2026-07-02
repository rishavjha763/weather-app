# 🌦️ Weather App

A modern and responsive Weather Application built using **HTML, CSS, and JavaScript** that fetches real-time weather data using the **Open-Meteo APIs**.

---

## 🚀 Features

* 🔍 Search weather by city name
* 🌡️ Real-time temperature updates
* ☁️ Weather condition display
* 📍 Location-based weather data
* 📱 Fully responsive design
* ⚡ Fast API fetching with JavaScript

---

## 🛠️ Technologies Used

* HTML5
* CSS3
* JavaScript (ES6)
* Open-Meteo Geocoding API
* Open-Meteo Forecast API

---

## 🔗 APIs Used

### 1. Geocoding API

Used to convert city names into latitude and longitude coordinates.

```js id="lhc57y"
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
```

### 2. Forecast API

Used to fetch real-time weather data based on coordinates.

```js id="7snzpk"
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
```

---

## ⚙️ How It Works

1. User enters a city name
2. App fetches latitude & longitude using Geocoding API
3. Forecast API returns weather data
4. Weather details are displayed dynamically on the screen

---

## 📂 Project Structure

```bash id="p0g4x0"
weather-app/
│
├── index.html
├── style.css
├── script.js
└── README.md
```

---

## 💡 Concepts Practiced

* API Fetching
* Async JavaScript
* JSON Handling
* DOM Manipulation
* Responsive Web Design

---

## 🔮 Future Improvements

* 7-Day Weather Forecast
* Dark/Light Mode
* Current Location Detection
* Weather Icons & Animations
* Hourly Forecast

---

## 📸 Preview

Add your project screenshot here.

```bash id="4v8q8z"
assets/screenshot.png
```

---

## 👨‍💻 Author

Developed by **Rishav**

---

## ⭐ Support

If you like this project, give it a ⭐ on GitHub!
