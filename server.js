const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { Telegraf } = require('telegraf');

// ==========================================
// CONFIGURACIÓN POR VARIABLES DE ENTORNO
// ==========================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = parseInt(process.env.ADMIN_TELEGRAM_ID);
const NOTIFICATIONS_CHAT_ID = process.env.NOTIFICATIONS_CHAT_ID; // Aquí irá tu ID: -1005534194581
const PORT = process.env.PORT || 10000;
// ==========================================

const app = express();
app.use(cors());
app.use(express.json());

// Conexión a la Base de Datos
const db = new sqlite3.Database('./rifa.db', (err) => {
    if (err) console.error("Error en DB:", err.message);
    console.log('Base de datos SQLite lista para operar.');
});

// Creación de la tabla si no existe
db.run(`CREATE TABLE IF NOT EXISTS boletas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sorteo TEXT NOT NULL,
    numero TEXT NOT NULL,
    UNIQUE(sorteo, numero)
)`);

const bot = TELEGRAM_BOT_TOKEN ? new Telegraf(TELEGRAM_BOT_TOKEN) : null;

/**
 * Función auxiliar para calcular estadísticas globales 
 * y enviar un reporte consolidado al grupo de Telegram.
 */
function enviarEstadisticas(mensajeInicial) {
    if (!bot || !NOTIFICATIONS_CHAT_ID) return;
    
    db.all("SELECT sorteo, COUNT(*) as total FROM boletas GROUP BY sorteo", [], (err, rows) => {
        if (err) return;
        let totalDia = 0;
        let totalNoche = 0;
        
        rows.forEach(row => {
            if (row.sorteo === 'dia') totalDia = row.total;
            if (row.sorteo === 'noche') totalNoche = row.total;
        });
        
        const totalGlobal = totalDia + totalNoche;
        
        const mensajeCompleto = `${mensajeInicial}\n\n` +
                                `📊 *Estadísticas de Ventas Actuales:*\n` +
                                `☀️ Sorteo Día: *${totalDia}/100* vendidos\n` +
                                `🌙 Sorteo Noche: *${totalNoche}/100* vendidos\n` +
                                `📈 Total General: *${totalGlobal}/200* boletas`;
                                
        bot.telegram.sendMessage(NOTIFICATIONS_CHAT_ID, mensajeCompleto, { parse_mode: 'Markdown' });
    });
}

// 👁️ ENDPOINT: Notificar visitas a la página en tiempo real
app.post('/api/notificar-visita', (req, res) => {
    if (bot && NOTIFICATIONS_CHAT_ID) {
        bot.telegram.sendMessage(NOTIFICATIONS_CHAT_ID, "🌐 *¡Nuevo visitante!* Alguien acaba de entrar a la página web.", { parse_mode: 'Markdown' });
    }
    res.json({ status: 'ok' });
});

// 🎯 ENDPOINT: Notificar cuando eligen números en la barra inferior (Debounce desde el cliente)
app.post('/api/notificar-seleccion', (req, res) => {
    const { numeros, sorteo } = req.body;
    if (bot && NOTIFICATIONS_CHAT_ID && numeros && numeros.length > 0) {
        const sorteoNombre = sorteo === 'dia' ? "☀️ DÍA" : "🌙 NOCHE";
        bot.telegram.sendMessage(
            NOTIFICATIONS_CHAT_ID, 
            `👀 *Interés en Vivo:* Un usuario tiene seleccionados los números [ *${numeros.join(', ')}* ] para el sorteo de la *${sorteoNombre}*.`, 
            { parse_mode: 'Markdown' }
        );
    }
    res.json({ status: 'ok' });
});

// ENDPOINT: Consultar todos los números vendidos
app.get('/api/vendidos', (req, res) => {
    db.all("SELECT sorteo, numero FROM boletas", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const data = { dia: [], noche: [] };
        rows.forEach(row => {
            if (data[row.sorteo]) data[row.sorteo].push(row.numero);
        });
        res.json(data);
    });
});

// ==========================================
// LÓGICA DE COMANDOS DEL BOT (TELEGRAF)
// ==========================================
if (bot) {
    // Middleware de seguridad para el administrador principal
    bot.use((ctx, next) => {
        if (ctx.from && ctx.from.id === ADMIN_TELEGRAM_ID) return next();
        return ctx.reply("❌ No tienes autorización para usar este sistema administrativo.");
    });

    bot.start((ctx) => ctx.reply("🍀 Sistema de Rifas Activo.\n\nComandos públicos del Admin:\n/vender [dia/noche] [numero]\n/liberar [dia/noche] [numero]"));

    // Comando para registrar una venta manual
    bot.command('vender', (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length !== 3) return ctx.reply("⚠️ Formato: /vender [dia/noche] [numero]");

        const sorteo = args[1].toLowerCase();
        let numero = args[2];

        if (sorteo !== 'dia' && sorteo !== 'noche') return ctx.reply("❌ Sorteo incorrecto. Usa 'dia' o 'noche'.");
        if (isNaN(numero) || numero.length > 2) return ctx.reply("❌ Número inválido. Debe ser de dos dígitos.");
        
        numero = numero.padStart(2, '0');

        db.run("INSERT INTO boletas (sorteo, numero) VALUES (?, ?)", [sorteo, numero], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return ctx.reply(`⚠️ El ${numero} ya está vendido en el sorteo de la ${sorteo}.`);
                return ctx.reply("❌ Error al interactuar con la Base de Datos.");
            }
            ctx.reply(`✅ ¡Número ${numero} guardado con éxito! 💸`);
            
            const sorteoNombre = sorteo === 'dia' ? "☀️ DÍA" : "🌙 NOCHE";
            enviarEstadisticas(`💰 *¡Número Vendido!* El administrador registró el número *${numero}* para el sorteo de la *${sorteoNombre}*.`);
        });
    });

    // Comando para liberar un número vendido
    bot.command('liberar', (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length !== 3) return ctx.reply("⚠️ Formato: /liberar [dia/noche] [numero]");

        const sorteo = args[1].toLowerCase();
        const numero = args[2].padStart(2, '0');

        db.run("DELETE FROM boletas WHERE sorteo = ? AND numero = ?", [sorteo, numero], function(err) {
            if (err) return ctx.reply("❌ Error al interactuar con la Base de Datos.");
            if (this.changes === 0) return ctx.reply("⚠️ Ese número no se encuentra marcado como vendido.");
            ctx.reply(`🔄 Número ${numero} liberado correctamente.`);
            
            const sorteoNombre = sorteo === 'dia' ? "☀️ DÍA" : "🌙 NOCHE";
            enviarEstadisticas(`🔄 *Número Liberado:* El número *${numero}* del sorteo de la *${sorteoNombre}* vuelve a estar disponible.`);
        });
    });

    bot.launch().then(() => console.log("Bot de Telegram vinculado con éxito."));
}

// Iniciar el Servidor Web
app.listen(PORT, () => {
    console.log(`Servidor de API escuchando de forma segura en el puerto ${PORT}`);
});
