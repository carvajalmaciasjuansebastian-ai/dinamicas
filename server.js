const express = require('express');
const cors = require('cors');
const app = express();

// 1. Permitir peticiones desde tu página web de usuarios
app.use(cors());
app.use(express.json());

// Variables/Base de datos (ejemplo simplificado)
let infoBoletasCargadas = { dia: {}, noche: {} };
let infoConfigSorteos = {
    dia: { fecha: '2026-08-10', hora: '20:00', valor: 15000, p1: 1000000, p2: 100000, p3: 100000 },
    noche: { fecha: '2026-08-10', hora: '22:00', valor: 15000, p1: 1000000, p2: 100000, p3: 100000 }
};

// --- RUTA PÚBLICA PARA USUARIOS ---
// La página web de los clientes llamará a esta ruta
app.get('/api/publico/estado', (req, res) => {
    res.json({
        sorteosDisponibles: Object.keys(infoConfigSorteos),
        configuraciones: infoConfigSorteos,
        boletas: infoBoletasCargadas
    });
});

// --- RUTAS DEL ADMIN (Panel de Administración) ---
app.get('/api/admin/boletas', (req, res) => res.json(infoBoletasCargadas));
app.get('/api/admin/configuraciones', (req, res) => res.json(infoConfigSorteos));

app.post('/api/admin/crear-sorteo', (req, res) => {
    const { sorteo } = req.body;
    if (sorteo) {
        if (!infoBoletasCargadas[sorteo]) infoBoletasCargadas[sorteo] = {};
        if (!infoConfigSorteos[sorteo]) {
            infoConfigSorteos[sorteo] = { fecha: '', hora: '', valor: 15000, p1: 0, p2: 0, p3: 0 };
        }
        return res.json({ ok: true });
    }
    res.status(400).json({ error: 'Nombre inválido' });
});

// Resto de tus rutas (apartar, confirmar-pago, liberar, etc.)
