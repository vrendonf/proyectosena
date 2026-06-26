from flask import Flask, jsonify
from flask_cors import CORS
import random

app = Flask(__name__)
# Habilitar CORS es fundamental para que tu frontend (HTML/JS) pueda hablar con este backend
CORS(app)

@app.route('/trafico', methods=['GET'])
def trafico():
    # Simulamos datos en tiempo real
    estados = ["VERDE", "AMARILLO", "ROJO"]
    
    datos = {
        "carros": random.randint(0, 50),
        "semaforo": random.choice(estados)
    }
    return jsonify(datos)

if __name__ == '__main__':
    # El servidor correrá en http://127.0.0.1:5000/
    app.run(debug=True, port=5000)