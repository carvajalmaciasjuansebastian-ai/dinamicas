const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Archivo de persistencia local en el servidor
const DB_FILE = path.join(__dirname, 'database.json');

// Cargar base de datos o inicializar vacía
function cargarDB() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            console.error("Error leyendo la base de datos:", e);
        }
    }
    return {
        boletas: { general: {} },
        configuraciones: {
            general: { fecha: '', hora: '', valor: 15000, p1: 0, p2: 0, p3: 0 }
        }
    };
}

// Guardar base de datos en disco
function guardarDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Endpoints de Administración

// Obtener todas las boletas
app.get('/api/admin/boletas', (req, res) => {
    const db = cargarDB();
    res.json(db.boletas);
});

// Obtener configuraciones
app.get('/api/admin/configuraciones', (req, res) => {
    const db = cargarDB();
    res.json(db.configuraciones);
});

// Guardar o actualizar todo el estado (Sorteos, Boletas y Config)
app.post('/api/admin/sincronizar', (req, res) => {
    const { boletas, configuraciones } = req.body;
    const db = cargarDB();
    
    if (boletas) db.boletas = boletas;
    if (configuraciones) db.configuraciones = configuraciones;
    
    guardarDB(db);
    res.json({ success: true, message: "Datos guardados exitosamente en el servidor." });
});

app.listen(PORT, () => {
    console.log(`Servidor de Suerte Real corriendo en el puerto ${PORT}`);
});
