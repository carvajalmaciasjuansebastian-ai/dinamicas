const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { Telegraf } = require('telegraf');

// ==========================================
// CONFIGURACIÓN POR VARIABLES DE ENTORNO
// ==========================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = parseInt(process.env.ADMIN_TELEGRAM_ID);
const PORT = process.env.PORT || 3000;
// ==========================================

const app = express();

// CORs habilitado para que tu página de Netlify pueda consultar al backend sin bloqueos de seguridad
app.use(cors());
app.use(express.json());

// Inicializar Base de Datos SQLite
const db = new sqlite3.Database('./rifa.db', (err) => {
    if (err) console.error("Error en DB:", err.message);
    console.log('Base de datos SQLite lista para operar.');
});

db.run(`CREATE TABLE IF NOT EXISTS boletas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sorteo TEXT NOT NULL,
    numero TEXT NOT NULL,
    UNIQUE(sorteo, numero)
)`);

// ENDPOINT API: Tu HTML en Netlify leerá los números desde aquí
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

// Lógica del Bot de Telegram (Se mantiene intacta)
if (TELEGRAM_BOT_TOKEN) {
    const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

    bot.use((ctx, next) => {
        if (ctx.from && ctx.from.id === ADMIN_TELEGRAM_ID) return next();
        return ctx.reply("❌ No tienes autorización para usar este sistema.");
    });

    bot.start((ctx) => ctx.reply("🍀 Sistema de Rifas Activo.\n\nComandos:\n/vender [dia/noche] [numero]\n/liberar [dia/noche] [numero]"));

    bot.command('vender', (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length !== 3) return ctx.reply("⚠️ Formato: /vender [dia/noche] [numero]");

        const sorteo = args[1].toLowerCase();
        let numero = args[2];

        if (sorteo !== 'dia' && sorteo !== 'noche') return ctx.reply("❌ Sorteo incorrecto.");
        if (isNaN(numero) || numero.length > 2) return ctx.reply("❌ Número inválido.");
        
        numero = numero.padStart(2, '0');

        db.run("INSERT INTO boletas (sorteo, numero) VALUES (?, ?)", [sorteo, numero], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return ctx.reply(`⚠️ El ${numero} ya está vendido en el sorteo de la ${sorteo}.`);
                return ctx.reply("❌ Error DB");
            }
            ctx.reply(`✅ ¡Número ${numero} guardado para el sorteo de la ${sorteo}! 💸`);
        });
    });

    bot.command('liberar', (ctx) => {
        const args = ctx.message.text.split(' ');
        if (args.length !== 3) return ctx.reply("⚠️ Formato: /liberar [dia/noche] [numero]");

        const sorteo = args[1].toLowerCase();
        const numero = args[2].padStart(2, '0');

        db.run("DELETE FROM boletas WHERE sorteo = ? AND numero = ?", [sorteo, numero], function(err) {
            if (err) return ctx.reply("❌ Error DB");
            if (this.changes === 0) return ctx.reply("⚠️ Ese número no estaba vendido.");
            ctx.reply(`🔄 Número ${numero} del sorteo ${sorteo} ha sido LIBERADO.`);
        });
    });

    bot.launch().then(() => console.log("Bot de Telegram vinculado con éxito."));
}

app.listen(PORT, () => {
    console.log(`Servidor de API escuchando en puerto ${PORT}`);
});