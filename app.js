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
const cityHeatmapEl = document.getElementById("city-heatmap");
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
const heatCells = [];

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

function ensureHeatmapGrid() {
    if (!cityHeatmapEl || heatCells.length > 0) {
        return;
    }

    const totalCells = 70;
    for (let i = 0; i < totalCells; i += 1) {
        const cell = document.createElement("div");
        cell.className = "heat-cell";
        cityHeatmapEl.appendChild(cell);
        heatCells.push(cell);
    }
}

function intensityToColor(level) {
    if (level >= 80) {
        return "#dd3f52";
    }
    if (level >= 55) {
        return "#ee9b00";
    }
    return "#1ca181";
}

function updateHeatmap(data) {
    ensureHeatmapGrid();

    const zoneAverage = Math.round(data.zonas.reduce((acc, z) => acc + z.nivel, 0) / data.zonas.length);
    const base = Math.round((zoneAverage + data.ocupacionVial) / 2);

    heatCells.forEach((cell, idx) => {
        const wave = Math.sin((Date.now() / 450 + idx) * 0.35) * 8;
        const jitter = Math.floor(Math.random() * 18) - 9;
        const intensity = Math.max(8, Math.min(100, base + wave + jitter));

        cell.style.backgroundColor = intensityToColor(intensity);
        if (intensity > 65) {
            cell.classList.add("active");
        } else {
            cell.classList.remove("active");
        }
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
        addCinematicAlert("high", `Congestion critica en ${highestZone.nombre}`, "Se recomienda desvio preventivo y ajuste semaforico inmediato.");
        return;
    }

    if (highestZone.nivel >= 55 || data.incidentes > 0) {
        addCinematicAlert("mid", `Flujo tenso en ${highestZone.nombre}`, "Activar monitoreo reforzado y coordinacion de agentes de movilidad.");
        return;
    }

    addCinematicAlert("low", `Operacion estable en ${highestZone.nombre}`, "Demanda controlada. Mantener parametros actuales del sistema.");
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
            { nombre: "Centro", nivel: Math.floor(Math.random() * 101) },
            { nombre: "Norte", nivel: Math.floor(Math.random() * 101) },
            { nombre: "Sur", nivel: Math.floor(Math.random() * 101) },
            { nombre: "Occidente", nivel: Math.floor(Math.random() * 101) }
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
            note: "Cruce en operacion normal"
        };
    }

    if (normalized === "AMARILLO") {
        return {
            className: "light-yellow",
            text: "Transicion preventiva",
            note: "Ajuste de fase semaforica"
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
        chipLevelEl.textContent = "Nivel: en calibracion";
        chipProjectionEl.textContent = "Proyeccion: insuficiente";
        return;
    }

    const lastValues = trafficHistory.slice(-3).map((item) => item.carros);
    const movingAverage = Math.round(lastValues.reduce((acc, value) => acc + value, 0) / lastValues.length);
    const lastValue = lastValues[lastValues.length - 1];
    const trend = lastValue - lastValues[0];

    let level = "Bajo";
    let projection = "estable";
    let recommendation = "Mantener sincronizacion actual de semaforos y continuar monitoreo.";

    if (movingAverage >= 180 || trend > 30) {
        level = "Alto";
        projection = "al alza";
        recommendation = "Activar onda verde parcial en corredores troncales y priorizar rutas alternas para reducir saturacion.";
    } else if (movingAverage >= 120 || trend > 10) {
        level = "Medio";
        projection = "moderada";
        recommendation = "Ajustar tiempos semaforicos en intersecciones criticas y reforzar mensajes de movilidad ciudadana.";
    }

    forecastTextEl.textContent = `Pronostico a corto plazo: demanda ${projection} con promedio de ${movingAverage} vehiculos. ${recommendation}`;
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
        action: highestZone.nivel >= 75 ? "Desvio y control" : "Monitoreo activo"
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
    updateHeatmap(data);
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