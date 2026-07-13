const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // Módulo nativo para persistencia real en Render sin perder datos
const { Telegraf } = require('telegraf'); 

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// MIDDLEWARES OBLIGATORIOS
// =========================================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// =========================================================================
// SISTEMA DE ARCHIVOS ANTIBORRADO (PERSISTENCIA COMPATIBLE CON RENDER)
// =========================================================================
const DATA_FILE = path.join(__dirname, 'suerte_real_data.json');

// Estructura inicial por si el archivo no existe
let localDB = {
    configuraciones: {
        dia: { fecha: '', hora: '', valor: 15000, p1: 1000000, p2: 100000, p3: 100000 },
        noche: { fecha: '', hora: '', valor: 15000, p1: 1000000, p2: 100000, p3: 100000 }
    },
    boletas: {}
};

// Cargar datos al iniciar el servidor
if (fs.existsSync(DATA_FILE)) {
    try {
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        localDB = JSON.parse(rawData);
        console.log("🔒 Datos cargados y protegidos con éxito.");
    } catch (e) {
        console.error("Error leyendo base de datos, usando plantilla limpia.");
    }
} else {
    fs.writeFileSync(DATA_FILE, JSON.stringify(localDB, null, 2));
}

// Función auxiliar para guardar cambios inmediatamente en el disco duro
function guardarCambios() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(localDB, null, 2));
}

// =========================================================================
// 🤖 ESPACIO PARA TU BOT DE TELEGRAM (Telegraf)
// =========================================================================
// const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || 'TU_TOKEN_AQUÍ');
// bot.start((ctx) => ctx.reply('¡Bienvenido a Suerte Real!'));
// bot.launch();
// =========================================================================

// =========================================================================
// ENDPOINTS DE LA API (CONECTADOS AL SISTEMA ANTIBORRADO)
// =========================================================================

// 1. Obtener todas las boletas estructuradas por sorteo
app.get('/api/admin/boletas', (req, res) => {
    res.json(localDB.boletas || {});
});

// 2. Obtener los parámetros de configuración de todos los sorteos
app.get('/api/admin/configuraciones', (req, res) => {
    res.json(localDB.configuraciones || {});
});

// 3. Crear dinámicamente un nuevo sorteo autónomo
app.post('/api/admin/crear-sorteo', (req, res) => {
    const { sorteo } = req.body;
    if (!sorteo) return res.status(400).json({ error: "Falta el identificador del sorteo." });

    if (!localDB.configuraciones[sorteo]) {
        localDB.configuraciones[sorteo] = { fecha: '', hora: '', valor: 15000, p1: 0, p2: 0, p3: 0 };
    }
    if (!localDB.boletas[sorteo]) {
        localDB.boletas[sorteo] = {};
    }
    guardarCambios();
    res.status(200).json({ mensaje: `Sorteo '${sorteo}' creado en Base de Datos.` });
});

// 4. Configurar el valor de la boleta y el cierre automático
app.post('/api/admin/configurar-cierre', (req, res) => {
    const { sorteo, fecha, hora, valor } = req.body;
    
    if (!localDB.configuraciones[sorteo]) localDB.configuraciones[sorteo] = {};
    
    localDB.configuraciones[sorteo].fecha = fecha;
    localDB.configuraciones[sorteo].hora = hora;
    localDB.configuraciones[sorteo].valor = parseFloat(valor) || 0;
    
    guardarCambios();
    res.status(200).json({ mensaje: "Configuración de tiempos y precios actualizada." });
});

// 5. Configurar el plan de premios
app.post('/api/admin/configurar-premios', (req, res) => {
    const { sorteo, p1, p2, p3 } = req.body;

    if (!localDB.configuraciones[sorteo]) localDB.configuraciones[sorteo] = {};

    localDB.configuraciones[sorteo].p1 = parseFloat(p1) || 0;
    localDB.configuraciones[sorteo].p2 = parseFloat(p2) || 0;
    localDB.configuraciones[sorteo].p3 = parseFloat(p3) || 0;

    guardarCambios();
    res.status(200).json({ mensaje: "Plan de premios persistido." });
});

// 6. Apartar un número específico (Estado: apartado)
app.post('/api/admin/apartar', (req, res) => {
    const { sorteo, numero, nombre, whatsapp } = req.body;
    const fecha = new Date().toISOString();

    if (!localDB.boletas[sorteo]) localDB.boletas[sorteo] = {};

    localDB.boletas[sorteo][numero] = {
        nombre: nombre,
        whatsapp: whatsapp,
        estado: 'apartado',
        fechaRegistro: fecha
    };

    guardarCambios();
    res.status(200).json({ mensaje: `Número ${numero} apartado con éxito.` });
});

// 7. Confirmar la compra de un número (Estado: pagado)
app.post('/api/admin/confirmar-pago', (req, res) => {
    const { sorteo, numero } = req.body;

    if (localDB.boletas[sorteo] && localDB.boletas[sorteo][numero]) {
        localDB.boletas[sorteo][numero].estado = 'pagado';
        guardarCambios();
        res.status(200).json({ mensaje: `Pago registrado para el número ${numero}.` });
    } else {
        res.status(404).json({ error: "Número o sorteo no encontrado." });
    }
});

// 8. Liberar un número
app.post('/api/admin/liberar', (req, res) => {
    const { sorteo, numero } = req.body;

    if (localDB.boletas[sorteo] && localDB.boletas[sorteo][numero]) {
        delete localDB.boletas[sorteo][numero];
        guardarCambios();
        res.status(200).json({ mensaje: `Número ${numero} liberado de la base de datos.` });
    } else {
        res.status(404).json({ error: "Número no encontrado." });
    }
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
