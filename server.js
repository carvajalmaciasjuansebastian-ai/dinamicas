const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Telegraf } = require('telegraf'); // Tu bot sigue disponible aquí

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// MIDDLEWARES OBLIGATORIOS
// =========================================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// =========================================================================
// CONFIGURACIÓN DE BASE DE DATOS PERSISTENTE (SQLite3)
// =========================================================================
// Guarda un archivo físico llamado 'suerte_real.db' para que NO se borren los datos al reiniciar en Render
const db = new sqlite3.Database(path.join(__dirname, 'suerte_real.db'), (err) => {
    if (err) console.error("Error al abrir SQLite:", err.message);
    else console.log("🔒 Base de datos SQLite conectada con éxito.");
});

// Inicializar tablas esenciales si no existen
db.serialize(() => {
    // Tablas de Configuraciones de cada Sorteo (Precios, Premios, Cierres)
    db.run(`CREATE TABLE IF NOT EXISTS configuraciones (
        sorteo TEXT PRIMARY KEY,
        fecha TEXT,
        hora TEXT,
        valor REAL,
        p1 REAL,
        p2 REAL,
        p3 REAL
    )`);

    // Tabla de Boletas de Clientes
    db.run(`CREATE TABLE IF NOT EXISTS boletas (
        sorteo TEXT,
        numero TEXT,
        nombre TEXT,
        whatsapp TEXT,
        estado TEXT,
        fechaRegistro TEXT,
        PRIMARY KEY (sorteo, numero)
    )`);

    // Insertar sorteos por defecto iniciales si la tabla está vacía
    db.run(`INSERT OR IGNORE INTO configuraciones VALUES ('dia', '', '', 15000, 1000000, 100000, 100000)`);
    db.run(`INSERT OR IGNORE INTO configuraciones VALUES ('noche', '', '', 15000, 1000000, 100000, 100000)`);
});

// =========================================================================
// 🤖 ESPACIO PARA TU BOT DE TELEGRAM (Telegraf)
// =========================================================================
// Puedes inicializar tu bot aquí abajo usando tu Token. 
// Ejemplo:
// const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'TU_TOKEN_AQUÍ');
// bot.start((ctx) => ctx.reply('¡Bienvenido a Suerte Real!'));
// bot.launch();
// =========================================================================


// =========================================================================
// ENDPOINTS DE LA API (PANEL ADMINISTRATIVO INTERACTIVO)
// =========================================================================

// 1. Obtener todas las boletas estructuradas por sorteo
app.get('/api/admin/boletas', (req, res) => {
    db.all("SELECT * FROM boletas", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const estructurada = {};
        rows.forEach(row => {
            if (!estructurada[row.sorteo]) estructurada[row.sorteo] = {};
            estructurada[row.sorteo][row.numero] = {
                nombre: row.nombre,
                whatsapp: row.whatsapp,
                estado: row.estado,
                fechaRegistro: row.fechaRegistro
            };
        });
        res.json(estructurada);
    });
});

// 2. Obtener los parámetros de configuración de todos los sorteos
app.get('/api/admin/configuraciones', (req, res) => {
    db.all("SELECT * FROM configuraciones", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const estructurada = {};
        rows.forEach(row => {
            estructurada[row.sorteo] = {
                fecha: row.fecha,
                hora: row.hora,
                valor: row.valor,
                p1: row.p1,
                p2: row.p2,
                p3: row.p3
            };
        });
        res.json(estructurada);
    });
});

// 3. Crear dinámicamente un nuevo sorteo autónomo
app.post('/api/admin/crear-sorteo', (req, res) => {
    const { sorteo } = req.body;
    if (!sorteo) return res.status(400).json({ error: "Falta el identificador del sorteo." });

    db.run(`INSERT OR IGNORE INTO configuraciones (sorteo, fecha, hora, valor, p1, p2, p3) VALUES (?, '', '', 15000, 0, 0, 0)`, 
    [sorteo], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ mensaje: `Sorteo '${sorteo}' creado en Base de Datos.` });
    });
});

// 4. Configurar el valor de la boleta y el cierre automático
app.post('/api/admin/configurar-cierre', (req, res) => {
    const { sorteo, fecha, hora, valor } = req.body;
    
    db.run(`UPDATE configuraciones SET fecha = ?, hora = ?, valor = ? WHERE sorteo = ?`,
    [fecha, hora, parseFloat(valor) || 0, sorteo], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ mensaje: "Configuración de tiempos y precios actualizada." });
    });
});

// 5. Configurar el plan de premios
app.post('/api/admin/configurar-premios', (req, res) => {
    const { sorteo, p1, p2, p3 } = req.body;

    db.run(`UPDATE configuraciones SET p1 = ?, p2 = ?, p3 = ? WHERE sorteo = ?`,
    [parseFloat(p1) || 0, parseFloat(p2) || 0, parseFloat(p3) || 0, sorteo], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ mensaje: "Plan de premios persistido en SQLite." });
    });
});

// 6. Apartar un número específico (Estado: apartado)
app.post('/api/admin/apartar', (req, res) => {
    const { sorteo, numero, nombre, whatsapp } = req.body;
    const fecha = new Date().toISOString();

    db.run(`INSERT OR REPLACE INTO boletas (sorteo, numero, nombre, whatsapp, estado, fechaRegistro) VALUES (?, ?, ?, ?, 'apartado', ?)`,
    [sorteo, numero, nombre, whatsapp, fecha], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ mensaje: `Número ${numero} apartado con éxito.` });
    });
});

// 7. Confirmar la compra de un número (Estado: pagado)
app.post('/api/admin/confirmar-pago', (req, res) => {
    const { sorteo, numero } = req.body;

    db.run(`UPDATE boletas SET estado = 'pagado' WHERE sorteo = ? AND numero = ?`,
    [sorteo, numero], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ mensaje: `Pago registrado para el número ${numero}.` });
    });
});

// 8. Liberar un número
app.post('/api/admin/liberar', (req, res) => {
    const { sorteo, numero } = req.body;

    db.delete; db.run(`DELETE FROM boletas WHERE sorteo = ? AND numero = ?`,
    [sorteo, numero], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ mensaje: `Número ${numero} liberado de la base de datos.` });
    });
});

// 9. Healthcheck para Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Fallback universal para index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicializar Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Profesional Multi-Sorteo corriendo en el puerto ${PORT}`);
});
