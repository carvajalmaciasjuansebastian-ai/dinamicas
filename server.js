const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de la Base de Datos con Disco Persistente en Render (/data)
const dbPath = process.env.NODE_ENV === 'production' 
    ? path.join('/data', 'suerte_real.db') 
    : './suerte_real.db';

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al abrir la base de datos:', err.message);
    } else {
        console.log(`Conectado a la base de datos SQLite en: ${dbPath}`);
        inicializarBaseDeDatos();
    }
});

// Crear tablas si no existen
function inicializarBaseDeDatos() {
    db.serialize(() => {
        // Tabla de Sorteos y sus configuraciones/premios
        db.run(`CREATE TABLE IF NOT EXISTS sorteos (
            nombre TEXT PRIMARY KEY,
            fecha TEXT,
            hora TEXT,
            valor REAL,
            p1 REAL,
            p2 REAL,
            p3 REAL
        )`);

        // Tabla de Boletas / Compradores
        db.run(`CREATE TABLE IF NOT EXISTS boletas (
            sorteo TEXT,
            numero TEXT,
            nombre TEXT,
            whatsapp TEXT,
            estado TEXT,
            PRIMARY KEY (sorteo, numero)
        )`, () => {
            // Insertar sorteo 'general' por defecto si la tabla está vacía
            db.get(`SELECT COUNT(*) as count FROM sorteos`, (err, row) => {
                if (row && row.count === 0) {
                    db.run(`INSERT INTO sorteos (nombre, fecha, hora, valor, p1, p2, p3) VALUES ('general', '', '', 15000, 0, 0, 0)`);
                }
            });
        });
    });
}

// ================= RUTAS DE LA API =================

// 1. Obtener todas las configuraciones de los sorteos
app.get('/api/config', (req, res) => {
    db.all(`SELECT * FROM sorteos`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const configs = {};
        rows.forEach(row => {
            configs[row.nombre] = {
                fecha: row.fecha,
                hora: row.hora,
                valor: row.valor,
                p1: row.p1,
                p2: row.p2,
                p3: row.p3
            };
        });
        res.json(configs);
    });
});

// 2. Guardar o actualizar configuración / premios de un sorteo
app.post('/api/config', (req, res) => {
    const { nombre, fecha, hora, valor, p1, p2, p3 } = req.body;
    
    db.run(`INSERT INTO sorteos (nombre, fecha, hora, valor, p1, p2, p3) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(nombre) DO UPDATE SET 
            fecha=coalesce(?, fecha), 
            hora=coalesce(?, hora), 
            valor=coalesce(?, valor), 
            p1=coalesce(?, p1), 
            p2=coalesce(?, p2), 
            p3=coalesce(?, p3)`,
        [nombre, fecha, hora, valor, p1, p2, p3, fecha, hora, valor, p1, p2, p3],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Configuración guardada correctamente' });
        }
    );
});

// 3. Crear un nuevo sorteo
app.post('/api/sorteos/crear', (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre de sorteo requerido' });

    db.run(`INSERT OR IGNORE INTO sorteos (nombre, fecha, hora, valor, p1, p2, p3) VALUES (?, '', '', 15000, 0, 0, 0)`, [nombre], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Sorteo creado con éxito' });
    });
});

// 4. Eliminar / Finalizar un sorteo completo y sus boletas
app.delete('/api/sorteos/:nombre', (req, res) => {
    const { nombre } = req.params;
    db.serialize(() => {
        db.run(`DELETE FROM boletas WHERE sorteo = ?`, [nombre]);
        db.run(`DELETE FROM sorteos WHERE nombre = ?`, [nombre], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Sorteo eliminado' });
        });
    });
});

// 5. Obtener todas las boletas de un sorteo específico
app.get('/api/boletas/:sorteo', (req, res) => {
    const { sorteo } = req.params;
    db.all(`SELECT numero, nombre, whatsapp, estado FROM boletas WHERE sorteo = ?`, [sorteo], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const boletasObj = {};
        rows.forEach(row => {
            boletasObj[row.numero] = {
                nombre: row.nombre,
                whatsapp: row.whatsapp,
                estado: row.estado
            };
        });
        res.json(boletasObj);
    });
});

// 6. Apartar o Confirmar Pago de un número (Upsert)
app.post('/api/boletas', (req, res) => {
    const { sorteo, numero, nombre, whatsapp, estado } = req.body;

    db.run(`INSERT INTO boletas (sorteo, numero, nombre, whatsapp, estado) 
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(sorteo, numero) DO UPDATE SET 
            nombre = ?, whatsapp = ?, estado = ?`,
        [sorteo, numero, nombre, whatsapp, estado, nombre, whatsapp, estado],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Boleta actualizada en la base de datos' });
        }
    );
});

// 7. Liberar / Borrar un número específico
app.delete('/api/boletas/:sorteo/:numero', (req, res) => {
    const { sorteo, numero } = req.params;
    db.run(`DELETE FROM boletas WHERE sorteo = ? AND numero = ?`, [sorteo, numero], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Número liberado' });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor de Suerte Real corriendo en el puerto ${PORT}`);
});
