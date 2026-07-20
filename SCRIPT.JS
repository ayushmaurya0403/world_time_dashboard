/* =====================
   GLOBAL STATE
===================== */
let favorites = [];
let dashboardCities = []; // Holds the active cards on the screen
const MAX_FAVORITES = 5;

// Default starter cities so the board isn't completely empty on first load
const defaultCities = [
    { id: "Delhi-IN", city: "Delhi", country: "India", tz: "Asia/Kolkata" },
    { id: "New York-US", city: "New York", country: "United States", tz: "America/New_York" },
    { id: "London-GB", city: "London", country: "United Kingdom", tz: "Europe/London" },
    { id: "Tokyo-JP", city: "Tokyo", country: "Japan", tz: "Asia/Tokyo" }
];

/* =====================
   INITIALIZATION
===================== */
document.addEventListener("DOMContentLoaded", () => {
    // Hide loading screen
    setTimeout(() => {
        document.getElementById("loading-screen").style.opacity = "0";
        setTimeout(() => document.getElementById("loading-screen").style.display = "none", 500);
    }, 1000);

    // Initialize Theme
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.body.setAttribute("data-theme", savedTheme);
    updateThemeButton(savedTheme);

    // Load Data
    loadState();
    
    // Render UI
    renderDashboard();
    updateLocalGreetingAndClock();

    // Timers
    setInterval(updateClocks, 1000);
    setInterval(updateLocalGreetingAndClock, 1000);
    setInterval(updateAnalogClock, 1000);

    // Event Listeners
    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
    document.getElementById("calc-btn").addEventListener("click", calculateTimeDifference);
    setupSearchAPI();
});

/* =====================
   LIVE API SEARCH
===================== */
function setupSearchAPI() {
    const searchBar = document.getElementById("search-bar");
    const searchResults = document.getElementById("search-results");
    let debounceTimer;

    searchBar.addEventListener("input", (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            searchResults.classList.remove("show");
            return;
        }

        // Wait 500ms after user stops typing to hit the API
        debounceTimer = setTimeout(() => fetchCityFromAPI(query), 500);
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.classList.remove("show");
        }
    });
}

async function fetchCityFromAPI(query) {
    const resultsContainer = document.getElementById("search-results");
    resultsContainer.innerHTML = `<div class="search-item">Searching globally for "${query}"...</div>`;
    resultsContainer.classList.add("show");

    try {
        // Free Open-Meteo Geocoding API (No key required)
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=5`);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            resultsContainer.innerHTML = `<div class="search-item">No cities found.</div>`;
            return;
        }

        resultsContainer.innerHTML = "";
        data.results.forEach(city => {
            // Ignore results that don't have a specific timezone
            if (!city.timezone) return; 

            const item = document.createElement("div");
            item.className = "search-item";
            item.innerHTML = `
                <div class="search-item-info">
                    <strong>${city.name}</strong>
                    <span>${city.country || city.admin1 || "Global"} • ${city.timezone}</span>
                </div>
                <button class="search-item-add">+ Add</button>
            `;

            item.addEventListener("click", () => {
                addCityToDashboard({
                    id: `${city.name}-${city.country_code || 'X'}`,
                    city: city.name,
                    country: city.country || "Global",
                    tz: city.timezone
                });
                resultsContainer.classList.remove("show");
                document.getElementById("search-bar").value = ""; // Clear search
            });

            resultsContainer.appendChild(item);
        });
    } catch (error) {
        resultsContainer.innerHTML = `<div class="search-item" style="color: red;">Error fetching data.</div>`;
    }
}

/* =====================
   DASHBOARD MANAGEMENT
===================== */
function addCityToDashboard(cityObj) {
    // Check if it already exists to prevent duplicates
    if (!dashboardCities.find(c => c.id === cityObj.id)) {
        dashboardCities.unshift(cityObj); // Add to beginning
        saveState();
        renderDashboard();
    }
}

function renderDashboard() {
    const worldGrid = document.getElementById("world-grid");
    worldGrid.innerHTML = "";

    // 1. Render all saved cities
    dashboardCities.forEach(city => {
        const isFav = favorites.some(f => f.id === city.id);
        worldGrid.innerHTML += buildCardHTML(city, isFav);
    });

    // 2. NEW: Append the "+ Add New City" card at the end
    worldGrid.innerHTML += `
        <div class="glass time-card add-card" onclick="focusSearch()">
            <div class="add-icon">+</div>
            <p>Add New City</p>
        </div>
    `;

    renderFavoritesGrid();
    populateCalculatorDropdowns();
    updateClocks(); // Immediately update times for new cards
}
function focusSearch() {
    const searchBar = document.getElementById("search-bar");
    
    // Smoothly scroll to the very top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Focus the input so the user can start typing immediately
    searchBar.focus();
    
    // Add a temporary glow effect so they know where to look
    searchBar.style.transition = "box-shadow 0.3s ease";
    searchBar.style.boxShadow = "0 0 15px var(--accent-1)";
    
    // Remove the glow after 1.5 seconds
    setTimeout(() => {
        searchBar.style.boxShadow = "none";
    }, 1500);
}

function buildCardHTML(data, isFav) {
    const favIcon = isFav ? "★" : "☆";
    const gmtOffset = getDynamicGMTOffset(data.tz);
    
    return `
        <div class="glass time-card" data-tz="${data.tz}">
            <div class="card-header">
                <div class="location-info">
                    <h3>${data.country}</h3>
                    <p>${data.city}</p>
                </div>
                <div>
                    <span class="day-night-icon">☀️</span>
                    <button class="fav-btn" onclick="toggleFavorite('${data.id}')">${favIcon}</button>
                </div>
            </div>
            <div class="live-time">--:--:--</div>
            <div class="date-info">--</div>
            <div class="gmt-info">${gmtOffset}</div>
        </div>
    `;
}

// Dynamically extracts GMT offset from timezone string
function getDynamicGMTOffset(tz) {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
        const parts = formatter.formatToParts(new Date());
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        return tzPart ? tzPart.value : "GMT";
    } catch (e) {
        return "GMT";
    }
}

/* =====================
   LIVE CLOCK UPDATES
===================== */
function updateClocks() {
    const cards = document.querySelectorAll(".time-card");
    const now = new Date();

    cards.forEach(card => {
        const tz = card.getAttribute("data-tz");
        if (!tz) return;

        try {
            const timeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            }).format(now);

            const dateStr = new Intl.DateTimeFormat('en-US', {
                timeZone: tz, weekday: 'short', month: 'short', day: 'numeric'
            }).format(now);

            const hour24 = parseInt(new Intl.DateTimeFormat('en-US', {
                timeZone: tz, hour: 'numeric', hour12: false
            }).format(now));

            card.querySelector(".live-time").innerText = timeStr;
            card.querySelector(".date-info").innerText = dateStr;
            card.querySelector(".day-night-icon").innerText = (hour24 >= 6 && hour24 < 18) ? "☀️" : "🌙";
        } catch (e) {
            // Silently handle invalid timezones
        }
    });
}

/* =====================
   FAVORITES & LOCAL STORAGE
===================== */
function loadState() {
    const savedFavs = localStorage.getItem("favorites");
    const savedCities = localStorage.getItem("dashboardCities");

    if (savedFavs) favorites = JSON.parse(savedFavs);
    
    if (savedCities) {
        dashboardCities = JSON.parse(savedCities);
    } else {
        dashboardCities = [...defaultCities];
    }
}

function saveState() {
    localStorage.setItem("favorites", JSON.stringify(favorites));
    localStorage.setItem("dashboardCities", JSON.stringify(dashboardCities));
}

function toggleFavorite(id) {
    const existsIndex = favorites.findIndex(f => f.id === id);
    
    if (existsIndex !== -1) {
        favorites.splice(existsIndex, 1);
    } else {
        if (favorites.length >= MAX_FAVORITES) {
            alert("You can only add up to 5 favorite countries.");
            return;
        }
        // Find full object from dashboard to push to favs
        const cityObj = dashboardCities.find(c => c.id === id);
        if (cityObj) favorites.push(cityObj);
    }
    
    saveState();
    renderDashboard();
}

function renderFavoritesGrid() {
    const favGrid = document.getElementById("favorites-grid");
    const noFavMsg = document.getElementById("no-favorites-msg");
    
    favGrid.innerHTML = "";
    
    if (favorites.length === 0) {
        favGrid.appendChild(noFavMsg);
        noFavMsg.style.display = "block";
        return;
    }
    
    noFavMsg.style.display = "none";
    favorites.forEach(cityObj => {
        favGrid.innerHTML += buildCardHTML(cityObj, true);
    });
}

/* =====================
   CALCULATOR
===================== */
function populateCalculatorDropdowns() {
    const sel1 = document.getElementById("calc-country-1");
    const sel2 = document.getElementById("calc-country-2");
    
    sel1.innerHTML = "";
    sel2.innerHTML = "";
    
    dashboardCities.forEach(item => {
        const option = `<option value="${item.tz}">${item.country} (${item.city})</option>`;
        sel1.innerHTML += option;
        sel2.innerHTML += option;
    });
}

function calculateTimeDifference() {
    const sel1 = document.getElementById("calc-country-1");
    const sel2 = document.getElementById("calc-country-2");
    
    if (!sel1.value || !sel2.value) return;

    const tz1 = sel1.value;
    const tz2 = sel2.value;
    
    const name1 = sel1.options[sel1.selectedIndex].text.split(' ')[0];
    const name2 = sel2.options[sel2.selectedIndex].text.split(' ')[0];

    const now = new Date();
    const d1 = new Date(now.toLocaleString("en-US", { timeZone: tz1 }));
    const d2 = new Date(now.toLocaleString("en-US", { timeZone: tz2 }));
    
    const diffMin = (d1 - d2) / (1000 * 60);
    const resEl = document.getElementById("calc-result");
    
    if (diffMin === 0) {
        resEl.innerText = `${name1} and ${name2} have the exact same time.`;
        return;
    }

    const hours = Math.floor(Math.abs(diffMin) / 60);
    const mins = Math.abs(diffMin) % 60;
    
    let timeStr = "";
    if (hours > 0) timeStr += `${hours} hour${hours > 1 ? 's' : ''} `;
    if (mins > 0) timeStr += `${mins} minute${mins > 1 ? 's' : ''}`;

    if (diffMin > 0) {
        resEl.innerText = `${name1} is ${timeStr} ahead of ${name2}.`;
    } else {
        resEl.innerText = `${name1} is ${timeStr} behind ${name2}.`;
    }
}

/* =====================
   LOCAL CLOCKS & THEME
===================== */
function updateLocalGreetingAndClock() {
    const now = new Date();
    document.getElementById("digital-clock").innerText = now.toLocaleTimeString();
    document.getElementById("local-date").innerText = now.toLocaleDateString(undefined, { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });

    const hour = now.getHours();
    let greeting = "Good Evening";
    if (hour >= 5 && hour < 12) greeting = "Good Morning";
    else if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
    document.getElementById("greeting-message").innerText = greeting;
}

function updateAnalogClock() {
    const now = new Date();
    const sec = now.getSeconds();
    const min = now.getMinutes();
    const hour = now.getHours();

    const secDeg = ((sec / 60) * 360);
    const minDeg = ((min / 60) * 360) + ((sec / 60) * 6);
    const hourDeg = ((hour / 12) * 360) + ((min / 60) * 30);

    document.getElementById("second-hand").style.transform = `translateX(-50%) rotate(${secDeg}deg)`;
    document.getElementById("minute-hand").style.transform = `translateX(-50%) rotate(${minDeg}deg)`;
    document.getElementById("hour-hand").style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
}

function toggleTheme() {
    const body = document.body;
    let currentTheme = body.getAttribute("data-theme");
    let newTheme = currentTheme === "dark" ? "light" : "dark";
    
    body.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeButton(newTheme);
}

function updateThemeButton(theme) {
    document.getElementById("theme-toggle").innerText = theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode";
}