const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

function buildTrafficPayload() {
    const estados = ["VERDE", "AMARILLO", "ROJO"];
    const estadoAleatorio = estados[Math.floor(Math.random() * estados.length)];
    const intensidad = Math.floor(Math.random() * 101);
    const velocidadPromedio = Math.max(8, Math.floor(55 - intensidad * 0.35));

    return {
        timestamp: new Date().toISOString(),
        carros: Math.floor(Math.random() * 220) + 40,
        semaforo: estadoAleatorio,
        velocidadPromedio,
        ocupacionVial: intensidad,
        incidentes: Math.floor(Math.random() * 5),
        zonas: [
            { nombre: "Centro", nivel: Math.floor(Math.random() * 101) },
            { nombre: "Norte", nivel: Math.floor(Math.random() * 101) },
            { nombre: "Sur", nivel: Math.floor(Math.random() * 101) },
            { nombre: "Occidente", nivel: Math.floor(Math.random() * 101) }
        ]
    };
}

app.get('/api/trafico', (req, res) => {
    res.json(buildTrafficPayload());
});

app.get('/trafico', (req, res) => {
    res.json(buildTrafficPayload());
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://127.0.0.1:${PORT}`);
});