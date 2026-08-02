const express = require('express');
const cors = require('cors');
const app = express();

// Configuración de CORS y Middleware
app.use(cors({
    origin: '*', // O puedes poner la URL específica de tu Netlify si prefieres mayor seguridad
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// --- BASE DE DATOS EN MEMORIA / ESTRUCTURA DE DATOS ---
let infoBoletasCargadas = {
    dia: {},
    noche: {}
};

let infoConfigSorteos = {
    dia: { fecha: '2026-08-10', hora: '20:00', valor: 15000, p1: 1000000, p2: 100000, p3: 100000 },
    noche: { fecha: '2026-08-10', hora: '22:00', valor: 15000, p1: 1000000, p2: 100000, p3: 100000 }
};

// ==========================================
// 1. RUTAS PÚBLICAS (Para la página web de usuarios)
// ==========================================
app.get('/api/publico/estado', (req, res) => {
    res.json({
        sorteosDisponibles: Object.keys(infoConfigSorteos),
        configuraciones: infoConfigSorteos,
        boletas: infoBoletasCargadas
    });
});

// ==========================================
// 2. RUTAS DE ADMINISTRACIÓN (Para el Panel Admin)
// ==========================================
app.get('/api/admin/boletas', (req, res) => {
    res.json(infoBoletasCargadas);
});

app.get('/api/admin/configuraciones', (req, res) => {
    res.json(infoConfigSorteos);
});

// Crear un nuevo sorteo
app.post('/api/admin/crear-sorteo', (req, res) => {
    const { sorteo } = req.body;
    if (!sorteo) return res.status(400).json({ error: 'Nombre de sorteo inválido' });

    const nombreLimpio = sorteo.toLowerCase().replace(/[^a-z0-9]/g, "_");
    
    if (!infoBoletasCargadas[nombreLimpio]) {
        infoBoletasCargadas[nombreLimpio] = {};
    }
    if (!infoConfigSorteos[nombreLimpio]) {
        infoConfigSorteos[nombreLimpio] = { fecha: '', hora: '', valor: 15000, p1: 0, p2: 0, p3: 0 };
    }

    res.json({ ok: true, sorteos: Object.keys(infoConfigSorteos) });
});

// Apartar un número
app.post('/api/admin/apartar', (req, res) => {
    const { sorteo, numero, nombre, whatsapp } = req.body;
    if (!infoBoletasCargadas[sorteo]) infoBoletasCargadas[sorteo] = {};

    infoBoletasCargadas[sorteo][numero] = {
        nombre: nombre,
        whatsapp: whatsapp,
        estado: 'apartado',
        fechaRegistro: new Date().toISOString()
    };

    res.json({ ok: true });
});

// Confirmar pago de un número
app.post('/api/admin/confirmar-pago', (req, res) => {
    const { sorteo, numero } = req.body;
    if (infoBoletasCargadas[sorteo] && infoBoletasCargadas[sorteo][numero]) {
        infoBoletasCargadas[sorteo][numero].estado = 'pagado';
        return res.json({ ok: true });
    }
    res.status(404).json({ error: 'Boleta no encontrada' });
});

// Liberar / Devolver número
app.post('/api/admin/liberar', (req, res) => {
    const { sorteo, numero } = req.body;
    if (infoBoletasCargadas[sorteo] && infoBoletasCargadas[sorteo][numero]) {
        delete infoBoletasCargadas[sorteo][numero];
        return res.json({ ok: true });
    }
    res.status(404).json({ error: 'Boleta no encontrada' });
});

// Configurar fecha, hora y valor de boleta
app.post('/api/admin/configurar-cierre', (req, res) => {
    const { sorteo, fecha, hora, valor } = req.body;
    if (!infoConfigSorteos[sorteo]) {
        infoConfigSorteos[sorteo] = {};
    }
    infoConfigSorteos[sorteo].fecha = fecha;
    infoConfigSorteos[sorteo].hora = hora;
    infoConfigSorteos[sorteo].valor = valor;

    res.json({ ok: true });
});

// Configurar plan de premios
app.post('/api/admin/configurar-premios', (req, res) => {
    const { sorteo, p1, p2, p3 } = req.body;
    if (!infoConfigSorteos[sorteo]) {
        infoConfigSorteos[sorteo] = {};
    }
    infoConfigSorteos[sorteo].p1 = p1;
    infoConfigSorteos[sorteo].p2 = p2;
    infoConfigSorteos[sorteo].p3 = p3;

    res.json({ ok: true });
});

// Ruta de prueba raíz
app.get('/', (req, res) => {
    res.send('API Backend de Suerte Real funcionando correctamente 🚀');
});

// ==========================================
// 3. INICIO DEL SERVIDOR (CRÍTICO PARA RENDER)
// ==========================================
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor Profesional Multi-Sorteo corriendo en el puerto ${PORT}`);
});
