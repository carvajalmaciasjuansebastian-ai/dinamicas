const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Conexión a la base de datos SQLite persistente (suerte_real.db)
const db = new sqlite3.Database('./suerte_real.db', (err) => {
    if (err) {
        console.error('Error al conectar con la base de datos SQLite:', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite de Suerte Real.');
    }
});

// Inicializar tablas si no existen
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS boletas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT,
        sorteo TEXT,
        estado TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS configuraciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        premio_mayor TEXT,
        premio_invertido TEXT,
        valor_boleta TEXT
    )`);

    // Insertar configuración por defecto si está vacía
    db.get("SELECT COUNT(*) as count FROM configuraciones", [], (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO configuraciones (premio_mayor, premio_invertido, valor_boleta) VALUES ('$700', '$100', '$15')`);
        }
    });
});

// ==========================================
// RUTAS PÚBLICAS (CLIENTE)
// ==========================================

// Obtener números vendidos según el sorteo ('dia' o 'noche')
app.get('/api/vendidos', (req, res) => {
    const sorteo = req.query.sorteo || 'dia';
    db.all("SELECT numero FROM boletas WHERE sorteo = ?", [sorteo], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        // Retorna un array plano con los números vendidos/apartados (ej: ["05", "12"])
        const numerosVendidos = rows.map(r => r.numero);
        res.json(numerosVendidos);
    });
});

// ==========================================
// RUTAS ADMINISTRATIVAS (PANEL ADMIN)
// ==========================================

// 1. Obtener configuraciones generales del sistema
app.get('/api/admin/configuraciones', (req, res) => {
    db.get("SELECT * FROM configuraciones LIMIT 1", [], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(row || { premio_mayor: "$700", premio_invertido: "$100", valor_boleta: "$15" });
    });
});

// 2. Apartar o registrar números desde el panel de administración
app.post('/api/admin/apartar', (req, res) => {
    const { numeros, sorteo, estado } = req.body; 

    if (!numeros || !Array.isArray(numeros) || !sorteo) {
        return res.status(400).json({ error: "Faltan parámetros requeridos o formato de números inválido" });
    }

    const estadoRegistro = estado || 'vendido';

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const stmt = db.prepare(`INSERT OR REPLACE INTO boletas (numero, sorteo, estado) VALUES (?, ?, ?)`);

        numeros.forEach(num => {
            stmt.run(num.toString().padStart(2, '0'), sorteo, estadoRegistro);
        });

        stmt.finalize((err) => {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
            }
            db.run("COMMIT");
            res.json({ success: true, message: "Números apartados/actualizados correctamente en el servidor" });
        });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor de Suerte Real corriendo en el puerto ${PORT}`);
});
