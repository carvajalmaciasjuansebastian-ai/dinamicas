const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ================= CONFIGURACIÓN DE ALMACENAMIENTO (RENDER / LOCAL) =================
const uploadsDir = process.env.NODE_ENV === 'production' 
    ? path.join('/data', 'uploads') 
    : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ================= FUNCIONES PARA TELEGRAM =================
async function enviarNotificacionTelegram(mensaje) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: mensaje,
                parse_mode: 'HTML'
            })
        });
    } catch (error) {
        console.error('Error enviando a Telegram:', error);
    }
}

async function enviarFotoTelegram(photoUrl, caption) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                photo: photoUrl,
                caption: caption,
                parse_mode: 'HTML'
            })
        });
    } catch (error) {
        console.error('Error enviando foto a Telegram:', error);
    }
}

// ================= BASE DE DATOS =================
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

function inicializarBaseDeDatos() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS sorteos (
            nombre TEXT PRIMARY KEY,
            fecha TEXT,
            hora TEXT,
            valor REAL,
            p1 REAL,
            p2 REAL,
            p3 REAL,
            flyer TEXT
        )`, () => {
            db.run(`ALTER TABLE sorteos ADD COLUMN flyer TEXT`, () => {});
        });

        db.run(`CREATE TABLE IF NOT EXISTS boletas (
            sorteo TEXT,
            numero TEXT,
            nombre TEXT,
            whatsapp TEXT,
            estado TEXT,
            vendedor TEXT,
            excedente REAL DEFAULT 0,
            PRIMARY KEY (sorteo, numero)
        )`, () => {
            // Migraciones seguras para SQLite
            db.run(`ALTER TABLE boletas ADD COLUMN vendedor TEXT`, () => {});
            db.run(`ALTER TABLE boletas ADD COLUMN excedente REAL DEFAULT 0`, () => {});

            db.get(`SELECT COUNT(*) as count FROM sorteos`, (err, row) => {
                if (row && row.count === 0) {
                    db.run(`INSERT INTO sorteos (nombre, fecha, hora, valor, p1, p2, p3) VALUES ('general', '', '', 15000, 0, 0, 0)`);
                }
            });
        });
    });
}

let ordenSorteosGlobal = [];

// ================= ENDPOINTS =================

app.post('/api/upload-comprobante', upload.single('comprobante'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se ha adjuntado ninguna imagen' });
    
    const filePath = req.file.path;
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    setTimeout(() => {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error al eliminar comprobante:`, err);
        });
    }, 24 * 60 * 60 * 1000);

    res.json({ success: true, url: fileUrl });
});

app.get('/unirse-grupo', (req, res) => {
    const LINK_GRUPO = "https://chat.whatsapp.com/CF7FdHHK7NyHQrtI0AUbIv?s=sh&p=a&mlu=4&ilr=4";
    enviarNotificacionTelegram(`☘️ <b>¡Alguien hizo clic para unirse al Grupo VIP!</b>`).catch(() => {});
    return res.redirect(302, LINK_GRUPO);
});

app.post('/api/orden-sorteos', (req, res) => {
    if (req.body && req.body.orden) {
        ordenSorteosGlobal = req.body.orden;
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Formato inválido' });
    }
});

app.get('/api/orden-sorteos', (req, res) => {
    res.json({ orden: ordenSorteosGlobal });
});

app.post('/api/sorteos/flyer', upload.single('flyer'), (req, res) => {
    const { nombre } = req.body;
    if (!req.file || !nombre) return res.status(400).json({ error: 'Faltan datos' });
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    db.run(`UPDATE sorteos SET flyer = ? WHERE nombre = ?`, [fileUrl, nombre], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, url: fileUrl });
    });
});

app.delete('/api/sorteos/flyer/:nombre', (req, res) => {
    const { nombre } = req.params;
    db.get(`SELECT flyer FROM sorteos WHERE nombre = ?`, [nombre], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'No encontrado' });

        if (row.flyer) {
            const filePath = path.join(uploadsDir, path.basename(row.flyer));
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        db.run(`UPDATE sorteos SET flyer = NULL WHERE nombre = ?`, [nombre], () => {
            res.json({ success: true });
        });
    });
});

app.get('/api/config', (req, res) => {
    db.all(`SELECT * FROM sorteos`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const configs = {};
        rows.forEach(row => {
            configs[row.nombre] = {
                fecha: row.fecha, hora: row.hora, valor: row.valor,
                p1: row.p1, p2: row.p2, p3: row.p3, flyer: row.flyer
            };
        });
        res.json(configs);
    });
});

app.post('/api/config', (req, res) => {
    const { nombre, fecha, hora, valor, p1, p2, p3 } = req.body;
    db.run(`INSERT INTO sorteos (nombre, fecha, hora, valor, p1, p2, p3) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(nombre) DO UPDATE SET 
            fecha=coalesce(?, fecha), hora=coalesce(?, hora), valor=coalesce(?, valor), 
            p1=coalesce(?, p1), p2=coalesce(?, p2), p3=coalesce(?, p3)`,
        [nombre, fecha, hora, valor, p1, p2, p3, fecha, hora, valor, p1, p2, p3],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.post('/api/sorteos/crear', (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Requerido' });
    db.run(`INSERT OR IGNORE INTO sorteos (nombre, fecha, hora, valor, p1, p2, p3) VALUES (?, '', '', 15000, 0, 0, 0)`, [nombre], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/sorteos/:nombre', (req, res) => {
    const { nombre } = req.params;
    db.serialize(() => {
        db.run(`DELETE FROM boletas WHERE sorteo = ?`, [nombre]);
        db.run(`DELETE FROM sorteos WHERE nombre = ?`, [nombre], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.get('/api/boletas/:sorteo', (req, res) => {
    const { sorteo } = req.params;
    db.all(`SELECT numero, nombre, whatsapp, estado, vendedor, excedente FROM boletas WHERE sorteo = ?`, [sorteo], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const boletasObj = {};
        rows.forEach(row => {
            boletasObj[row.numero] = {
                nombre: row.nombre,
                whatsapp: row.whatsapp,
                estado: row.estado,
                vendedor: row.vendedor || 'La Casa / Web Directo',
                excedente: row.excedente || 0
            };
        });
        res.json(boletasObj);
    });
});

app.post('/api/boletas', (req, res) => {
    const { sorteo, numero, nombre, whatsapp, estado, vendedor, excedente } = req.body;
    const v = vendedor || 'La Casa / Web Directo';
    const e = parseFloat(excedente) || 0;

    db.run(`INSERT INTO boletas (sorteo, numero, nombre, whatsapp, estado, vendedor, excedente) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(sorteo, numero) DO UPDATE SET 
            nombre = ?, whatsapp = ?, estado = ?, vendedor = ?, excedente = ?`,
        [sorteo, numero, nombre, whatsapp, estado, v, e, nombre, whatsapp, estado, v, e],
        async (err) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (estado === 'apartado' || estado === 'confirmado' || estado === 'pagado') {
                const mensaje = `🎯 <b>¡Nuevo movimiento!</b>\n🎲 Sorteo: <b>${sorteo}</b>\n🔢 Número: <b>${numero}</b>\n👤 Cliente: ${nombre}\n🏷️ Vendedor: <b>${v}</b>\n📱 WhatsApp: ${whatsapp}\n📌 Estado: <b>${estado.toUpperCase()}</b>`;
                await enviarNotificacionTelegram(mensaje);
            }
            res.json({ success: true });
        }
    );
});

app.delete('/api/boletas/:sorteo/:numero', (req, res) => {
    const { sorteo, numero } = req.params;
    db.run(`DELETE FROM boletas WHERE sorteo = ? AND numero = ?`, [sorteo, numero], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/notificar-visita', async (req, res) => {
    await enviarNotificacionTelegram(`👁️ <b>¡Visita a la web!</b>`);
    res.json({ success: true });
});

app.post('/api/notificar-seleccion', async (req, res) => {
    res.json({ success: true });
});

app.post('/api/notificar-pedido', async (req, res) => {
    const { sorteo, numeros, total, urlComprobante } = req.body;
    let mensaje = `🛒 <b>¡Intento de compra!</b>\n🎟️ Sorteo: ${sorteo}\n🔢 Números: ${numeros}\n📦 Total: ${total}`;
    if (urlComprobante) {
        await enviarFotoTelegram(urlComprobante, mensaje);
    } else {
        await enviarNotificacionTelegram(mensaje);
    }
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
