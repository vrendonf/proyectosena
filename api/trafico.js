module.exports = (req, res) => {
  const estados = ["VERDE", "AMARILLO", "ROJO"];
  const estadoAleatorio = estados[Math.floor(Math.random() * estados.length)];

  const intensidad = Math.floor(Math.random() * 101);
  const velocidadPromedio = Math.max(8, Math.floor(55 - intensidad * 0.35));

  const datos = {
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

  res.status(200).json(datos);
};
