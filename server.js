const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares obligatorios
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conexión a la base de datos SQLite persistente
const db = new sqlite3.Database('./suerte_real.db', (err) => {
    if (err) {
        console.error('Error al conectar con SQLite:', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite de Suerte Real.');
    }
});

// Inicialización de tablas con soporte para nombre y teléfono
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS boletas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT,
        sorteo TEXT,
        estado TEXT,
        nombre TEXT,
        telefono TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS configuraciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        premio_mayor TEXT,
        premio_invertido TEXT,
        valor_boleta TEXT
    )`);

    db.get("SELECT COUNT(*) as count FROM configuraciones", [], (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO configuraciones (premio_mayor, premio_invertido, valor_boleta) VALUES ('$700', '$100', '$15')`);
        }
    });
});

// ==========================================
// RUTAS PÚBLICAS Y DE CONSULTA
// ==========================================
app.get('/api/vendidos', (req, res) => {
    const sorteo = req.query.sorteo || 'dia';
    db.all("SELECT numero FROM boletas WHERE sorteo = ?", [sorteo], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows.map(r => r.numero));
    });
});

app.get('/api/admin/boletas', (req, res) => {
    const sorteo = req.query.sorteo;
    let query = "SELECT * FROM boletas";
    let params = [];

    if (sorteo) {
        query += " WHERE sorteo = ?";
        params.push(sorteo);
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// ==========================================
// RUTAS ADMINISTRATIVAS
// ==========================================
app.get('/api/admin/configuraciones', (req, res) => {
    db.get("SELECT * FROM configuraciones LIMIT 1", [], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(row || { premio_mayor: "$700", premio_invertido: "$100", valor_boleta: "$15" });
    });
});

app.post('/api/admin/apartar', (req, res) => {
    const { numeros, sorteo, estado, nombre, telefono } = req.body;

    let listaNumeros = numeros;
    if (!listaNumeros && req.body.numero) {
        listaNumeros = [req.body.numero];
    }

    if (!listaNumeros || !Array.isArray(listaNumeros) || !sorteo) {
        return res.status(400).json({ error: "Faltan parámetros requeridos (numeros/sorteo)." });
    }

    const estadoFinal = estado || 'apartado';
    const nombreComprador = nombre || '';
    const telefonoComprador = telefono || '';

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        const stmt = db.prepare(`INSERT OR REPLACE INTO boletas (numero, sorteo, estado, nombre, telefono) VALUES (?, ?, ?, ?, ?)`);

        listaNumeros.forEach(num => {
            const numeroFormateado = num.toString().padStart(2, '0');
            stmt.run(numeroFormateado, sorteo, estadoFinal, nombreComprador, telefonoComprador);
        });

        stmt.finalize((err) => {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
            }
            db.run("COMMIT");
            res.json({ success: true, message: "Número apartado guardado y sincronizado correctamente" });
        });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
