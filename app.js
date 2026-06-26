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

const trafficHistory = [];
const incidentHistory = [];

const trendChart = new Chart(document.getElementById("traffic-trend-chart"), {
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
});

function buildFallbackData() {
    const estados = ["VERDE", "AMARILLO", "ROJO"];
    const ocupacion = Math.floor(Math.random() * 101);
    return {
        timestamp: new Date().toISOString(),
        carros: Math.floor(Math.random() * 220) + 40,
        semaforo: estados[Math.floor(Math.random() * estados.length)],
        velocidadPromedio: Math.max(8, Math.floor(55 - ocupacion * 0.35)),
        ocupacionVial: ocupacion,
        incidentes: Math.floor(Math.random() * 5),
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

    trendChart.data.labels = trafficHistory.map((item) => item.label);
    trendChart.data.datasets[0].data = trafficHistory.map((item) => item.carros);
    trendChart.update();
}

function updateUI(data) {
    vehicleCountEl.textContent = data.carros;
    avgSpeedEl.textContent = data.velocidadPromedio;
    roadOccupancyEl.textContent = data.ocupacionVial;
    lastUpdateEl.textContent = formatHour(data.timestamp);

    const signal = getSignalMetadata(data.semaforo);
    trafficLightEl.className = `signal-pill ${signal.className}`;
    trafficStatusTextEl.textContent = signal.text;
    signalNoteEl.textContent = signal.note;

    updateTrendChart(data);
    updateZones(data.zonas);
    updateIncidents(data);
    buildRecommendation();
}

async function fetchTrafficData() {
    try {
        const response = await fetch(API_URL, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        updateUI(data);
    } catch (error) {
        console.error("Fallo al consultar la API, se usa modo simulacion local:", error);
        updateUI(buildFallbackData());
    }
}

fetchTrafficData();
setInterval(fetchTrafficData, POLL_INTERVAL_MS);