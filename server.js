const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicialización de la base de datos SQLite
const db = new sqlite3.Database('./suerte_real.db', (err) => {
    if (err) {
        console.error('Error al conectar con SQLite:', err.message);
    } else {
        console.log('Conectado a la base de datos suerte_real.db');
    }
});

// Crear tabla de números vendidos si no existe
db.run(`
    CREATE TABLE IF NOT EXISTS vendidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT NOT NULL,
        sorteo TEXT NOT NULL,
        UNIQUE(numero, sorteo)
    )
`);

// ==========================================
// RUTAS PARA EL CLIENTE (INDEX.HTML)
// ==========================================

// Endpoint para consultar números vendidos (Sin Caché)
app.get('/api/vendidos', (req, res) => {
    // Encabezados para evitar que el cliente o navegador guarde datos viejos
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { sorteo } = req.query;

    if (!sorteo) {
        return res.status(400).json({ error: 'Debes especificar el sorteo (dia/noche)' });
    }

    db.all('SELECT numero FROM vendidos WHERE sorteo = ?', [sorteo], (err, rows) => {
        if (err) {
            console.error('Error al obtener vendidos:', err.message);
            return res.status(500).json([]);
        }
        const numeros = rows.map(r => r.numero);
        res.json(numeros);
    });
});

// ==========================================
// RUTAS PARA EL ADMIN (PANEL DE CONTROL)
// ==========================================

// Marcar un número como vendido
app.post('/api/admin/vender', (req, res) => {
    const { numero, sorteo } = req.body;

    if (!numero || !sorteo) {
        return res.status(400).json({ error: 'Faltan parámetros (numero, sorteo)' });
    }

    db.run('INSERT OR IGNORE INTO vendidos (numero, sorteo) VALUES (?, ?)', [numero, sorteo], function(err) {
        if (err) {
            console.error('Error al vender número:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: `Número ${numero} marcado como vendido en sorteo ${sorteo}` });
    });
});

// Liberar/Desmarcar un número
app.post('/api/admin/liberar', (req, res) => {
    const { numero, sorteo } = req.body;

    if (!numero || !sorteo) {
        return res.status(400).json({ error: 'Faltan parámetros (numero, sorteo)' });
    }

    db.run('DELETE FROM vendidos WHERE numero = ? AND sorteo = ?', [numero, sorteo], function(err) {
        if (err) {
            console.error('Error al liberar número:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: `Número ${numero} liberado en sorteo ${sorteo}` });
    });
});

// Reiniciar sorteo (Liberar todos los números de 'dia' o 'noche')
app.post('/api/admin/reiniciar', (req, res) => {
    const { sorteo } = req.body;

    if (!sorteo) {
        return res.status(400).json({ error: 'Debes indicar el sorteo a reiniciar' });
    }

    db.run('DELETE FROM vendidos WHERE sorteo = ?', [sorteo], function(err) {
        if (err) {
            console.error('Error al reiniciar sorteo:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: `Sorteo ${sorteo} limpiado por completo.` });
    });
});

// Servir la aplicación principal
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor de Suerte Real corriendo en el puerto ${PORT}`);
});
