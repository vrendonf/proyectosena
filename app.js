const API_URL = "/api/trafico";
const POLL_INTERVAL_MS = 3000;
const MAX_POINTS = 12;

const vehicleCountEl = document.getElementById("vehicle-count");
const avgSpeedEl = document.getElementById("avg-speed");
const roadOccupancyEl = document.getElementById("road-occupancy");
const trafficLightEl = document.getElementById("traffic-light");
const trafficStatusTextEl = document.getElementById("traffic-status-text");
const signalNoteEl = document.getElementById("signal-note");
const lastUpdateEl = document.getElementById("last-update");
const zoneListEl = document.getElementById("zone-list");
const incidentBodyEl = document.getElementById("incident-body");
const forecastTextEl = document.getElementById("forecast-text");
const chipLevelEl = document.getElementById("chip-level");
const chipProjectionEl = document.getElementById("chip-projection");
const apiDotEl = document.getElementById("api-dot");
const apiTextEl = document.getElementById("api-text");
const sensorHealthEl = document.getElementById("sensor-health");
const scenarioButtons = Array.from(document.querySelectorAll(".action-btn"));
const cityHeatmapEl = document.getElementById("manizales-map");
const alertFeedEl = document.getElementById("alert-feed");

const trafficHistory = [];
const incidentHistory = [];
let currentScenario = "normal";
const metricState = {
    carros: 0,
    velocidadPromedio: 0,
    ocupacionVial: 0,
    sensorHealth: 96
};
let manizalesMap = null;
const zonaMarkers = {};

const ZONAS_GEO = {
    "Centro Historico":  { lat: 5.0689,  lng: -75.5174, radio: 600 },
    "La Enea":           { lat: 5.0920,  lng: -75.5020, radio: 700 },
    "La Sultana":        { lat: 5.0430,  lng: -75.5080, radio: 700 },
    "Chipre":            { lat: 5.0680,  lng: -75.5420, radio: 650 }
};

const chartCanvasEl = document.getElementById("traffic-trend-chart");
const trendChart = window.Chart
    ? new Chart(chartCanvasEl, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                {
                    label: "Vehiculos",
                    data: [],
                    borderColor: "#0f7cff",
                    backgroundColor: "rgba(15, 124, 255, 0.16)",
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: "rgba(24, 49, 89, 0.08)"
                    },
                    ticks: {
                        color: "#586b8f"
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: "rgba(24, 49, 89, 0.08)"
                    },
                    ticks: {
                        color: "#586b8f"
                    }
                }
            }
        }
    })
    : null;

if (!trendChart) {
    chartCanvasEl.insertAdjacentHTML("afterend", "<p style='margin-top:12px;color:#60708f;font-size:0.9rem;'>Grafica no disponible en este navegador/red. El panel sigue operativo.</p>");
    chartCanvasEl.style.display = "none";
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function animateNumber(key, nextValue, renderFn, duration = 550) {
    const startValue = Number(metricState[key] || 0);
    const endValue = Number(nextValue || 0);
    const startTime = performance.now();

    function frame(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = easeOutCubic(progress);
        const value = Math.round(startValue + (endValue - startValue) * eased);
        renderFn(value);

        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            metricState[key] = endValue;
            renderFn(endValue);
        }
    }

    requestAnimationFrame(frame);
}

function intensityToColor(level) {
    if (level >= 80) return "#dd3f52";
    if (level >= 55) return "#ee9b00";
    return "#1ca181";
}

function intensityToLabel(level) {
    if (level >= 80) return "Alta congestión";
    if (level >= 55) return "Congestión moderada";
    return "Flujo normal";
}

function initManizalesMap() {
    if (manizalesMap || !cityHeatmapEl) return;

    manizalesMap = L.map("manizales-map", {
        center: [5.0689, -75.5174],
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: false
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
    }).addTo(manizalesMap);

    Object.entries(ZONAS_GEO).forEach(([nombre, geo]) => {
        const circle = L.circle([geo.lat, geo.lng], {
            radius: geo.radio,
            color: "#1ca181",
            fillColor: "#1ca181",
            fillOpacity: 0.35,
            weight: 2
        }).addTo(manizalesMap);

        circle.bindPopup(`<h4>${nombre}</h4><p>Cargando datos...</p>`);
        zonaMarkers[nombre] = circle;
    });
}

function updateManizalesMap(data) {
    initManizalesMap();

    data.zonas.forEach((zona) => {
        const marker = zonaMarkers[zona.nombre];
        if (!marker) return;

        const color = intensityToColor(zona.nivel);
        marker.setStyle({ color, fillColor: color, fillOpacity: 0.42 });
        marker.setPopupContent(
            `<h4>${zona.nombre}</h4>
             <p>Congestion: <strong>${zona.nivel}%</strong></p>
             <p>Estado: <strong>${intensityToLabel(zona.nivel)}</strong></p>
             <p>Vehiculos aprox: <strong>${Math.round(data.carros * zona.nivel / 100)}</strong></p>
             <p>Vel. promedio: <strong>${data.velocidadPromedio} km/h</strong></p>`
        );
    });
}

function addCinematicAlert(level, title, description) {
    if (!alertFeedEl) {
        return;
    }

    const card = document.createElement("article");
    card.className = `alert-card level-${level}`;
    card.innerHTML = `<h4>${title}</h4><p>${description}</p>`;

    alertFeedEl.prepend(card);

    while (alertFeedEl.children.length > 6) {
        alertFeedEl.removeChild(alertFeedEl.lastElementChild);
    }
}

function updateAlertFeed(data) {
    const highestZone = data.zonas.reduce((prev, curr) => (curr.nivel > prev.nivel ? curr : prev), data.zonas[0]);

    if (highestZone.nivel >= 80) {
        addCinematicAlert("high", `Congestión crítica en ${highestZone.nombre}`, "Se recomienda desvío preventivo y ajuste semafórico inmediato.");
        return;
    }

    if (highestZone.nivel >= 55 || data.incidentes > 0) {
        addCinematicAlert("mid", `Flujo tenso en ${highestZone.nombre}`, "Activar monitoreo reforzado y coordinación de agentes de movilidad.");
        return;
    }

    addCinematicAlert("low", `Operación estable en ${highestZone.nombre}`, "Demanda controlada. Mantener parámetros actuales del sistema.");
}

function buildFallbackData() {
    const estados = ["VERDE", "AMARILLO", "ROJO"];
    let ocupacion = Math.floor(Math.random() * 101);
    let baseCarros = Math.floor(Math.random() * 220) + 40;
    let incidentes = Math.floor(Math.random() * 5);

    if (currentScenario === "peak") {
        ocupacion = Math.floor(Math.random() * 20) + 75;
        baseCarros = Math.floor(Math.random() * 110) + 180;
    } else if (currentScenario === "rain") {
        ocupacion = Math.floor(Math.random() * 35) + 55;
        incidentes = Math.floor(Math.random() * 4) + 1;
    } else if (currentScenario === "incident") {
        ocupacion = Math.floor(Math.random() * 22) + 78;
        incidentes = Math.floor(Math.random() * 3) + 2;
    }

    return {
        timestamp: new Date().toISOString(),
        carros: baseCarros,
        semaforo: estados[Math.floor(Math.random() * estados.length)],
        velocidadPromedio: Math.max(8, Math.floor(55 - ocupacion * 0.35)),
        ocupacionVial: ocupacion,
        incidentes,
        zonas: [
            { nombre: "Centro Historico", nivel: Math.floor(Math.random() * 101) },
            { nombre: "La Enea",          nivel: Math.floor(Math.random() * 101) },
            { nombre: "La Sultana",       nivel: Math.floor(Math.random() * 101) },
            { nombre: "Chipre",           nivel: Math.floor(Math.random() * 101) }
        ]
    };
}

function formatHour(isoTime) {
    return new Date(isoTime).toLocaleTimeString("es-CO", { hour12: false });
}

function getSignalMetadata(state) {
    const normalized = state.toUpperCase();

    if (normalized === "VERDE") {
        return {
            className: "light-green",
            text: "Flujo habilitado",
            note: "Cruce en operación normal"
        };
    }

    if (normalized === "AMARILLO") {
        return {
            className: "light-yellow",
            text: "Transición preventiva",
            note: "Ajuste de fase semafórica"
        };
    }

    if (normalized === "ROJO") {
        return {
            className: "light-red",
            text: "Alto y control",
            note: "Priorizacion de seguridad vial"
        };
    }

    return {
        className: "light-neutral",
        text: "Estado desconocido",
        note: "Sin diagnostico disponible"
    };
}

function getZoneColor(level) {
    if (level >= 75) {
        return "#dc3d45";
    }
    if (level >= 45) {
        return "#ee9b00";
    }
    return "#00a88a";
}

function getSeverityBadge(level) {
    if (level >= 75) {
        return { label: "Alta", className: "badge badge-high" };
    }
    if (level >= 45) {
        return { label: "Media", className: "badge badge-mid" };
    }
    return { label: "Baja", className: "badge badge-low" };
}

function buildRecommendation() {
    if (trafficHistory.length < 3) {
        forecastTextEl.textContent = "Reuniendo datos para calcular tendencia operativa confiable.";
        chipLevelEl.textContent = "Nivel: en calibración";
        chipProjectionEl.textContent = "Proyección: insuficiente";
        return;
    }

    const lastValues = trafficHistory.slice(-3).map((item) => item.carros);
    const movingAverage = Math.round(lastValues.reduce((acc, value) => acc + value, 0) / lastValues.length);
    const lastValue = lastValues[lastValues.length - 1];
    const trend = lastValue - lastValues[0];

    let level = "Bajo";
    let projection = "estable";
    let recommendation = "Mantener sincronización actual de semáforos y continuar monitoreo.";

    if (movingAverage >= 180 || trend > 30) {
        level = "Alto";
        projection = "al alza";
        recommendation = "Activar onda verde parcial en corredores troncales y priorizar rutas alternas para reducir saturación.";
    } else if (movingAverage >= 120 || trend > 10) {
        level = "Medio";
        projection = "moderada";
        recommendation = "Ajustar tiempos semafóricos en intersecciones críticas y reforzar mensajes de movilidad ciudadana.";
    }

    forecastTextEl.textContent = `Pronóstico a corto plazo: demanda ${projection} con promedio de ${movingAverage} vehículos. ${recommendation}`;
    chipLevelEl.textContent = `Nivel: ${level}`;
    chipProjectionEl.textContent = `Proyeccion: ${projection}`;
}

function updateZones(zonas) {
    zoneListEl.innerHTML = "";

    zonas.forEach((zona) => {
        const item = document.createElement("div");
        item.className = "zone-item";

        const row = document.createElement("div");
        row.className = "zone-row";
        row.innerHTML = `<strong>${zona.nombre}</strong><span>${zona.nivel}%</span>`;

        const track = document.createElement("div");
        track.className = "zone-track";

        const fill = document.createElement("div");
        fill.className = "zone-fill";
        fill.style.width = `${zona.nivel}%`;
        fill.style.backgroundColor = getZoneColor(zona.nivel);

        track.appendChild(fill);
        item.append(row, track);
        zoneListEl.appendChild(item);
    });
}

function updateIncidents(data) {
    if (data.incidentes <= 0) {
        return;
    }

    const highestZone = data.zonas.reduce((prev, curr) => (curr.nivel > prev.nivel ? curr : prev), data.zonas[0]);
    const severity = getSeverityBadge(highestZone.nivel);

    incidentHistory.unshift({
        time: formatHour(data.timestamp),
        zone: highestZone.nombre,
        severity,
        action: highestZone.nivel >= 75 ? "Desvío y control" : "Monitoreo activo"
    });

    if (incidentHistory.length > 6) {
        incidentHistory.pop();
    }

    incidentBodyEl.innerHTML = incidentHistory
        .map(
            (item) =>
                `<tr>
                    <td>${item.time}</td>
                    <td>${item.zone}</td>
                    <td><span class="${item.severity.className}">${item.severity.label}</span></td>
                    <td>${item.action}</td>
                </tr>`
        )
        .join("");
}

function updateTrendChart(data) {
    const label = formatHour(data.timestamp);

    trafficHistory.push({ label, carros: data.carros });
    if (trafficHistory.length > MAX_POINTS) {
        trafficHistory.shift();
    }

    if (trendChart) {
        trendChart.data.labels = trafficHistory.map((item) => item.label);
        trendChart.data.datasets[0].data = trafficHistory.map((item) => item.carros);
        trendChart.update();
    }
}

function updateUI(data) {
    lastTrafficData = data;
    animateNumber("carros", data.carros, (value) => {
        vehicleCountEl.textContent = value;
    });
    animateNumber("velocidadPromedio", data.velocidadPromedio, (value) => {
        avgSpeedEl.textContent = value;
    });
    animateNumber("ocupacionVial", data.ocupacionVial, (value) => {
        roadOccupancyEl.textContent = value;
    });
    lastUpdateEl.textContent = formatHour(data.timestamp);

    const signal = getSignalMetadata(data.semaforo);
    trafficLightEl.className = `signal-pill ${signal.className}`;
    trafficStatusTextEl.textContent = signal.text;
    signalNoteEl.textContent = signal.note;

    updateTrendChart(data);
    updateZones(data.zonas);
    updateIncidents(data);
    updateManizalesMap(data);
    buildRecommendation();

    const sensorHealth = Math.max(84, Math.min(99, 100 - Math.floor(data.ocupacionVial * 0.16) - data.incidentes));
    animateNumber("sensorHealth", sensorHealth, (value) => {
        sensorHealthEl.textContent = `${value}%`;
    });

    if (Math.random() > 0.68) {
        updateAlertFeed(data);
    }
}

function setApiStatus(isOnline) {
    if (isOnline) {
        apiDotEl.className = "dot dot-online";
        apiTextEl.textContent = "Conectado";
        return;
    }

    apiDotEl.className = "dot dot-offline";
    apiTextEl.textContent = "Modo simulacion";
}

function bindScenarioButtons() {
    scenarioButtons.forEach((button) => {
        button.addEventListener("click", () => {
            currentScenario = button.dataset.scenario || "normal";
            scenarioButtons.forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            updateUI(buildFallbackData());
        });
    });

    const normalButton = scenarioButtons.find((button) => button.dataset.scenario === "normal");
    if (normalButton) {
        normalButton.classList.add("active");
    }
}

async function fetchTrafficData() {
    try {
        const response = await fetch(API_URL, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setApiStatus(true);
        updateUI(data);
    } catch (error) {
        console.error("Fallo al consultar la API, se usa modo simulacion local:", error);
        setApiStatus(false);
        updateUI(buildFallbackData());
    }
}

bindScenarioButtons();
fetchTrafficData();
setInterval(fetchTrafficData, POLL_INTERVAL_MS);
// ── Agente IA de tráfico ──
let lastTrafficData = null;

const ZONA_ALIASES = {
    "Centro Historico": [
        "centro", "historico", "parque caldas", "catedral", "ayacucho",
        "centro historico", "plaza", "mercado"
    ],
    "La Enea": [
        "enea", "aeropuerto", "milan", "milán", "la enea", "norte"
    ],
    "La Sultana": [
        "sultana", "la sultana", "sur", "cable", "fatima", "fátima",
        "palermo", "palogrande"
    ],
    "Chipre": [
        "chipre", "santander", "avenida santander", "av santander",
        "av. santander", "occidente", "mirador", "avenida"
    ]
};

function detectZone(text) {
    const lower = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const [zona, aliases] of Object.entries(ZONA_ALIASES)) {
        for (const alias of aliases) {
            if (lower.includes(alias)) return zona;
        }
    }
    return null;
}

function trafficEmoji(nivel) {
    if (nivel >= 80) return "🔴";
    if (nivel >= 55) return "🟡";
    return "🟢";
}

function nivelClass(nivel) {
    if (nivel >= 80) return "nivel-rojo";
    if (nivel >= 55) return "nivel-amarillo";
    return "nivel-verde";
}

function nivelTexto(nivel) {
    if (nivel >= 80) return "alta congestión";
    if (nivel >= 55) return "congestión moderada";
    return "flujo normal";
}

function buildAgentResponse(query) {
    if (!lastTrafficData) {
        return "Aún estoy cargando los datos del sistema. Intenta en unos segundos.";
    }

    const lower = query.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

    if (lower.includes("resumen") || lower.includes("todo") || lower.includes("general") || lower.includes("ciudad")) {
        const lineas = lastTrafficData.zonas.map(z => {
            const e = trafficEmoji(z.nivel);
            return `${e} <strong>${z.nombre}</strong>: <span class="${nivelClass(z.nivel)}">${z.nivel}% — ${nivelTexto(z.nivel)}</span>`;
        });
        return `Estado general de Manizales en este momento:<br><br>${lineas.join("<br>")}
        <br><br>Vehículos totales detectados: <strong>${lastTrafficData.carros}</strong> | Velocidad promedio: <strong>${lastTrafficData.velocidadPromedio} km/h</strong>`;
    }

    const zona = detectZone(query);
    if (!zona) {
        return `No identifiqué una zona específica en tu pregunta. Puedes preguntar por:<br>
        <strong>Centro Histórico, La Enea, La Sultana</strong> o <strong>Chipre / Av. Santander</strong>.<br>
        O usa los botones de acceso rápido.`;
    }

    const datos = lastTrafficData.zonas.find(z => z.nombre === zona);
    if (!datos) {
        return `No tengo datos disponibles para ${zona} en este momento.`;
    }

    const e = trafficEmoji(datos.nivel);
    const veh = Math.round(lastTrafficData.carros * datos.nivel / 100);

    const recomendaciones = {
        "Centro Historico": {
            rojo: "Se recomienda evitar la carrera 23 y usar rutas alternas por la avenida Cervantes.",
            amarillo: "Precaución en el Parque Caldas y alrededores del mercado.",
            verde: "Circulación fluida. Buen momento para transitar por el centro."
        },
        "La Enea": {
            rojo: "Congestión alta en la vía al aeropuerto. Considere salir con tiempo adicional.",
            amarillo: "Tráfico moderado hacia La Enea. Vigilar la rotonda de acceso.",
            verde: "Vía despejada hacia el aeropuerto y sector de La Enea."
        },
        "La Sultana": {
            rojo: "Alta demanda en La Sultana. Se sugiere usar la vía alterna de Palogrande.",
            amarillo: "Flujo tenso en el sector. Atención en los cruces principales.",
            verde: "Sin novedad en La Sultana. Tráfico en condiciones normales."
        },
        "Chipre": {
            rojo: "Av. Santander congestionada. Evitar la zona de Chipre en este momento.",
            amarillo: "Tráfico moderado en Av. Santander. Respetar los tiempos semafóricos.",
            verde: "Av. Santander y Chipre con tráfico fluido. Condiciones óptimas."
        }
    };

    const nivel = datos.nivel >= 80 ? "rojo" : datos.nivel >= 55 ? "amarillo" : "verde";
    const rec = recomendaciones[zona][nivel];

    return `${e} <strong>${zona}</strong><br><br>
Congestión actual: <span class="${nivelClass(datos.nivel)}"><strong>${datos.nivel}% — ${nivelTexto(datos.nivel)}</strong></span><br>
Vehículos estimados: <strong>${veh}</strong><br>
Velocidad promedio: <strong>${lastTrafficData.velocidadPromedio} km/h</strong><br><br>
💡 ${rec}`;
}

function appendAgentMessage(html, role) {
    const messagesEl = document.getElementById("agent-messages");
    if (!messagesEl) return;
    const msg = document.createElement("div");
    msg.className = `agent-msg ${role}`;
    const avatar = role === "bot" ? "🤖" : "👤";
    msg.innerHTML = `<span class="agent-avatar">${avatar}</span><div class="agent-bubble">${html}</div>`;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function handleAgentQuery(query) {
    if (!query.trim()) return;
    appendAgentMessage(query, "user");
    setTimeout(() => {
        appendAgentMessage(buildAgentResponse(query), "bot");
    }, 380);
}

function initAgent() {
    const inputEl = document.getElementById("agent-input");
    const sendBtn = document.getElementById("agent-send");
    const quickBtns = document.querySelectorAll(".quick-btn");

    if (!inputEl || !sendBtn) return;

    sendBtn.addEventListener("click", () => {
        handleAgentQuery(inputEl.value);
        inputEl.value = "";
    });

    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            handleAgentQuery(inputEl.value);
            inputEl.value = "";
        }
    });

    quickBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            handleAgentQuery(btn.dataset.query);
        });
    });
}

initAgent();
