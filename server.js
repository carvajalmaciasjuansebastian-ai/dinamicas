const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de Credenciales de Telegram (Variables de Entorno)
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ================= FUNCIÓN PARA TELEGRAM =================
async function enviarNotificacionTelegram(mensaje) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log("Faltan credenciales de Telegram en variables de entorno");
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: mensaje,
                parse_mode: 'HTML'
            })
        });
        const data = await response.json();
        console.log("Respuesta de Telegram:", data);
    } catch (error) {
        console.error('Error enviando a Telegram:', error);
    }
}

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

// 0. Redirección Limpia para Unirse al Grupo de WhatsApp (Evita caídas de Pauta Meta)
app.get('/unirse-grupo', async (req, res) => {
    const LINK_GRUPO = "https://chat.whatsapp.com/C5PUsCM3IuTFtFKNZaDwUF";
    
    // Notificar a Telegram que alguien presionó el botón de la pauta
    const mensaje = `☘️ <b>¡Alguien hizo clic para unirse al Grupo VIP!</b>\n🔄 Redirigiendo de forma limpia a WhatsApp...`;
    enviarNotificacionTelegram(mensaje).catch(err => console.error(err));

    // Redirección 302 hacia WhatsApp eliminando parámetros basura de Meta
    return res.redirect(302, LINK_GRUPO);
});

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

// 6. Apartar o Confirmar Pago de un número (Upsert + Notificación)
app.post('/api/boletas', (req, res) => {
    const { sorteo, numero, nombre, whatsapp, estado } = req.body;

    db.run(`INSERT INTO boletas (sorteo, numero, nombre, whatsapp, estado) 
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(sorteo, numero) DO UPDATE SET 
            nombre = ?, whatsapp = ?, estado = ?`,
        [sorteo, numero, nombre, whatsapp, estado, nombre, whatsapp, estado],
        async function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // Notificar a Telegram cuando aparten o confirmen
            if (estado === 'apartado' || estado === 'confirmado') {
                const mensaje = `🎯 <b>¡Nuevo movimiento en boletas!</b>\n\n🎲 Sorteo: <b>${sorteo}</b>\n🔢 Número: <b>${numero}</b>\n👤 Cliente: ${nombre}\n📱 WhatsApp: ${whatsapp}\n📌 Estado: <b>${estado.toUpperCase()}</b>`;
                await enviarNotificacionTelegram(mensaje);
            }

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

// 8. Notificar cada vez que alguien entra a la página web (con IP y Ciudad)
app.post('/api/notificar-visita', async (req, res) => {
    const { ip, ciudad, pais } = req.body;
    const mensaje = `👁️ <b>¡Alguien acaba de entrar a la página web!</b>\n📍 Ciudad: ${ciudad || 'Desconocida'}\n🌐 IP: ${ip || 'Desconocida'}`;
    await enviarNotificacionTelegram(mensaje);
    res.json({ success: true, message: "Visita notificada" });
});

// 9. Notificar cuando un aventurero empieza a seleccionar un número (con IP y Ciudad)
app.post('/api/notificar-seleccion', async (req, res) => {
    const { numero, ip, ciudad } = req.body;
    const mensaje = `🍀 <b>¡Un aventurero está seleccionando números!</b>\n🔢 Primer número tocado: ${numero}\n📍 Ciudad: ${ciudad || 'Desconocida'}\n🌐 IP: ${ip || 'Desconocida'}`;
    await enviarNotificacionTelegram(mensaje);
    res.json({ success: true, message: "Selección notificada" });
});

// 10. Notificar cuando un aventurero le da clic en comprar/jugar (con IP y Ciudad)
app.post('/api/notificar-pedido', async (req, res) => {
    const { sorteo, numeros, total, ip, ciudad } = req.body;
    const mensaje = `🛒 <b>¡Intento de compra (Jugar Números)!</b>\n🎟️ Sorteo: ${sorteo}\n🔢 Números: ${numeros}\n📦 Cantidad: ${total}\n📍 Ciudad: ${ciudad || 'Desconocida'}\n🌐 IP: ${ip || 'Desconocida'}`;
    await enviarNotificacionTelegram(mensaje);
    res.json({ success: true, message: "Pedido notificado" });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor de Suerte Real corriendo en el puerto ${PORT}`);
});
