const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inicialización de SQLite
const db = new sqlite3.Database('./suerte_real.db', (err) => {
    if (err) {
        console.error('Error al conectar con SQLite:', err.message);
    } else {
        console.log('Conectado exitosamente a la base de datos SQLite (suerte_real.db)');
    }
});

// Creación de la tabla boletas si no existe
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS boletas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sorteo TEXT NOT NULL,
            numero TEXT NOT NULL,
            nombre_cliente TEXT,
            telefono_cliente TEXT,
            estado TEXT DEFAULT 'apartado',
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sorteo, numero)
        )
    `);
});

// ==========================================
// 1. RUTA PÚBLICA (Para index.html)
// ==========================================
// Consulta solo los números ocupados (apartado o pagado) para el frontend del cliente
app.get('/api/boletas', (req, res) => {
    const { sorteo } = req.query;

    if (!sorteo) {
        return res.status(400).json({ error: 'El parámetro sorteo es requerido.' });
    }

    const sql = `SELECT numero FROM boletas WHERE sorteo = ? AND estado IN ('apartado', 'pagado')`;
    
    db.all(sql, [sorteo], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const vendidos = rows.map(r => r.numero);
        res.json({ vendidos });
    });
});

// ==========================================
// 2. RUTAS ADMINISTRATIVAS (Para panel admin)
// ==========================================

// Obtener todas las boletas registradas para el panel de control
app.get('/api/admin/boletas', (req, res) => {
    const sql = `SELECT * FROM boletas ORDER BY fecha_registro DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ boletas: rows });
    });
});

// Generar / Guardar un nuevo ticket desde el panel del administrador
app.post('/api/admin/boletas', (req, res) => {
    const { sorteo, numero, nombre_cliente, telefono_cliente, estado } = req.body;

    if (!sorteo || !numero) {
        return res.status(400).json({ error: 'Sorteo y Número son requeridos.' });
    }

    const estadoFinal = estado || 'apartado';
    const numFormateado = numero.toString().padStart(2, '0');

    const sql = `
        INSERT INTO boletas (sorteo, numero, nombre_cliente, telefono_cliente, estado)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(sorteo, numero) DO UPDATE SET
            nombre_cliente = excluded.nombre_cliente,
            telefono_cliente = excluded.telefono_cliente,
            estado = excluded.estado,
            fecha_registro = CURRENT_TIMESTAMP
    `;

    db.run(sql, [sorteo, numFormateado, nombre_cliente || '', telefono_cliente || '', estadoFinal], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ 
            success: true, 
            message: 'Ticket registrado correctamente.',
            id: this.lastID 
        });
    });
});

// Eliminar / Liberar un número desde el panel admin
app.delete('/api/admin/boletas', (req, res) => {
    const { sorteo, numero } = req.body;

    if (!sorteo || !numero) {
        return res.status(400).json({ error: 'Sorteo y Número son requeridos.' });
    }

    const numFormateado = numero.toString().padStart(2, '0');
    const sql = `DELETE FROM boletas WHERE sorteo = ? AND numero = ?`;

    db.run(sql, [sorteo, numFormateado], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Boleta liberada correctamente.' });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor Suerte Real ejecutándose en http://localhost:${PORT}`);
});
