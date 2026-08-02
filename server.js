const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Inicialización de Base de Datos SQLite
const dbPath = path.resolve(__dirname, 'suerte_real.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al conectar con SQLite:', err.message);
    } else {
        console.log('Conectado exitosamente a la base de datos SQLite (suerte_real.db)');
    }
});

// Creación de Tablas
db.serialize(() => {
    // Tabla de Boletas
    db.run(`
        CREATE TABLE IF NOT EXISTS boletas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sorteo TEXT NOT NULL,
            numero TEXT NOT NULL,
            nombre TEXT NOT NULL,
            whatsapp TEXT NOT NULL,
            estado TEXT NOT NULL,
            UNIQUE(sorteo, numero)
        )
    `);

    // Tabla de Configuraciones por Sorteo
    db.run(`
        CREATE TABLE IF NOT EXISTS configuraciones (
            sorteo TEXT PRIMARY KEY,
            fecha TEXT,
            hora TEXT,
            valor INTEGER,
            p1 INTEGER,
            p2 INTEGER,
            p3 INTEGER
        )
    `);
});

// ==========================================
// RUTAS DE LA API (/api/admin)
// ==========================================

// 1. Obtener todas las boletas agrupadas por sorteo
app.get('/api/admin/boletas', (req, res) => {
    const sql = `SELECT * FROM boletas`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Estructurar respuesta en objeto por sorteo y número
        const resultado = {};
        rows.forEach(row => {
            if (!resultado[row.sorteo]) {
                resultado[row.sorteo] = {};
            }
            resultado[row.sorteo][row.numero] = {
                nombre: row.nombre,
                whatsapp: row.whatsapp,
                estado: row.estado
            };
        });

        res.json(resultado);
    });
});

// 2. Obtener la configuración de los sorteos
app.get('/api/admin/configuraciones', (req, res) => {
    const sql = `SELECT * FROM configuraciones`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const resultado = {};
        rows.forEach(row => {
            resultado[row.sorteo] = {
                fecha: row.fecha,
                hora: row.hora,
                valor: row.valor,
                p1: row.p1,
                p2: row.p2,
                p3: row.p3
            };
        });

        res.json(resultado);
    });
});

// 3. Apartar un número
app.post('/api/admin/apartar', (req, res) => {
    const { sorteo, numero, nombre, whatsapp } = req.body;

    if (!sorteo || !numero || !nombre || !whatsapp) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }

    const sql = `
        INSERT INTO boletas (sorteo, numero, nombre, whatsapp, estado)
        VALUES (?, ?, ?, ?, 'apartado')
        ON CONFLICT(sorteo, numero) DO UPDATE SET
            nombre = excluded.nombre,
            whatsapp = excluded.whatsapp,
            estado = 'apartado'
    `;

    db.run(sql, [sorteo, numero, nombre, whatsapp], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Número apartado correctamente.' });
    });
});

// 4. Confirmar pago de un número
app.post('/api/admin/confirmar-pago', (req, res) => {
    const { sorteo, numero } = req.body;

    if (!sorteo || !numero) {
        return res.status(400).json({ message: 'Sorteo y número son requeridos.' });
    }

    const sql = `UPDATE boletas SET estado = 'pagado' WHERE sorteo = ? AND numero = ?`;

    db.run(sql, [sorteo, numero], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Pago confirmado correctamente.' });
    });
});

// 5. Liberar / Devolver un número
app.post('/api/admin/liberar', (req, res) => {
    const { sorteo, numero } = req.body;

    if (!sorteo || !numero) {
        return res.status(400).json({ message: 'Sorteo y número son requeridos.' });
    }

    const sql = `DELETE FROM boletas WHERE sorteo = ? AND numero = ?`;

    db.run(sql, [sorteo, numero], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Número liberado correctamente.' });
    });
});

// 6. Guardar o actualizar configuración de un sorteo
app.post('/api/admin/guardar-configuracion', (req, res) => {
    const { sorteo, configuracion } = req.body;
    const { fecha, hora, valor, p1, p2, p3 } = configuracion || {};

    if (!sorteo) {
        return res.status(400).json({ message: 'Nombre de sorteo requerido.' });
    }

    const sql = `
        INSERT INTO configuraciones (sorteo, fecha, hora, valor, p1, p2, p3)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sorteo) DO UPDATE SET
            fecha = excluded.fecha,
            hora = excluded.hora,
            valor = excluded.valor,
            p1 = excluded.p1,
            p2 = excluded.p2,
            p3 = excluded.p3
    `;

    db.run(sql, [sorteo, fecha, hora, valor, p1, p2, p3], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Configuración guardada correctamente.' });
    });
});

// 7. Crear un nuevo sorteo
app.post('/api/admin/crear-sorteo', (req, res) => {
    const { sorteo } = req.body;

    if (!sorteo) {
        return res.status(400).json({ message: 'Nombre de sorteo requerido.' });
    }

    const sql = `
        INSERT OR IGNORE INTO configuraciones (sorteo, fecha, hora, valor, p1, p2, p3)
        VALUES (?, '', '', 15000, 0, 0, 0)
    `;

    db.run(sql, [sorteo], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Sorteo creado exitosamente.' });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor activo corriendo en el puerto ${PORT}`);
});
