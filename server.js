const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware obligatorios
app.use(cors());
app.use(express.json());

// Servir los archivos estáticos de la interfaz (asegúrate de que tu index.html esté en la misma carpeta o ajusta la ruta)
app.use(express.static(path.join(__dirname)));

// =========================================================================
// ESTRUCTURA DE DATOS EN MEMORIA VOLÁTIL
// Nota: Para producción real, se recomienda conectar MongoDB o PostgreSQL
// =========================================================================

// Base de datos de boletas indexada por sorteo
let baseDatosBoletas = {
    dia: {},
    noche: {}
};

// Base de datos de configuraciones por sorteo
let baseDatosConfiguraciones = {
    dia: { fecha: '', hora: '', valor: 15000, p1: 1000000, p2: 100000, p3: 100000 },
    noche: { fecha: '', hora: '', valor: 15000, p1: 1000000, p2: 100000, p3: 100000 }
};

// =========================================================================
// ENDPOINTS DE LA API (PANEL ADMINISTRATIVO)
// =========================================================================

// 1. Obtener todas las boletas de todos los sorteos
app.get('/api/admin/boletas', (req, res) => {
    res.json(baseDatosBoletas);
});

// 2. Obtener los parámetros de configuración de todos los sorteos
app.get('/api/admin/configuraciones', (req, res) => {
    res.json(baseDatosConfiguraciones);
});

// 3. Crear dinámicamente un nuevo sorteo autónomo
app.post('/api/admin/crear-sorteo', (req, res) => {
    const { sorteo } = req.body;
    if (!sorteo) return res.status(400).json({ error: "Falta el identificador del sorteo." });

    // Si el sorteo no existe en memoria, lo inicializamos de inmediato
    if (!baseDatosBoletas[sorteo]) {
        baseDatosBoletas[sorteo] = {};
        baseDatosConfiguraciones[sorteo] = { 
            fecha: '', 
            hora: '', 
            valor: 15000, 
            p1: 0, 
            p2: 0, 
            p3: 0 
        };
    }
    res.status(200).json({ mensaje: `Sorteo '${sorteo}' dado de alta exitosamente.` });
});

// 4. Configurar el valor de la boleta y el cierre automático
app.post('/api/admin/configurar-cierre', (req, res) => {
    const { sorteo, fecha, hora, valor } = req.body;
    if (!sorteo || !baseDatosConfiguraciones[sorteo]) {
        return res.status(400).json({ error: "Sorteo inexistente o no especificado." });
    }

    baseDatosConfiguraciones[sorteo].fecha = fecha;
    baseDatosConfiguraciones[sorteo].hora = hora;
    baseDatosConfiguraciones[sorteo].valor = parseFloat(valor) || 0;

    res.status(200).json({ mensaje: "Configuración de cierre y valor de boleta actualizados." });
});

// 5. Configurar el plan estructurado de premios
app.post('/api/admin/configurar-premios', (req, res) => {
    const { sorteo, p1, p2, p3 } = req.body;
    if (!sorteo || !baseDatosConfiguraciones[sorteo]) {
        return res.status(400).json({ error: "Sorteo inexistente o no especificado." });
    }

    baseDatosConfiguraciones[sorteo].p1 = parseFloat(p1) || 0;
    baseDatosConfiguraciones[sorteo].p2 = parseFloat(p2) || 0;
    baseDatosConfiguraciones[sorteo].p3 = parseFloat(p3) || 0;

    res.status(200).json({ mensaje: "Plan de premios salvado con éxito." });
});

// 6. Apartar un número específico (Estado: apartado)
app.post('/api/admin/apartar', (req, res) => {
    const { sorteo, numero, nombre, whatsapp } = req.body;
    if (!sorteo || !numero || !nombre || !whatsapp) {
        return res.status(400).json({ error: "Datos insuficientes para procesar el apartado." });
    }

    if (!baseDatosBoletas[sorteo]) baseDatosBoletas[sorteo] = {};

    // Guardar o sobreescribir la boleta
    baseDatosBoletas[sorteo][numero] = {
        nombre,
        whatsapp,
        estado: 'apartado',
        fechaRegistro: new Date().toISOString()
    };

    res.status(200).json({ mensaje: `Número ${numero} reservado.` });
});

// 7. Confirmar la compra de un número (Estado: pagado)
app.post('/api/admin/confirmar-pago', (req, res) => {
    const { sorteo, numero } = req.body;
    if (!sorteo || !numero || !baseDatosBoletas[sorteo] || !baseDatosBoletas[sorteo][numero]) {
        return res.status(404).json({ error: "La boleta no se encuentra registrada o apartada." });
    }

    baseDatosBoletas[sorteo][numero].estado = 'pagado';
    res.status(200).json({ mensaje: `Pago confirmado para el número ${numero}.` });
});

// 8. Liberar un número (Remover el registro para volver a disponible)
app.post('/api/admin/liberar', (req, res) => {
    const { sorteo, numero } = req.body;
    if (!sorteo || !numero || !baseDatosBoletas[sorteo]) {
        return res.status(400).json({ error: "Parámetros inválidos." });
    }

    if (baseDatosBoletas[sorteo][numero]) {
        delete baseDatosBoletas[sorteo][numero];
    }
    res.status(200).json({ mensaje: `Número ${numero} liberado correctamente.` });
});

// 9. Healthcheck para el contenedor de Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Enrutar cualquier otra petición al index.html (Single Page App Fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicializar Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Administrativo Multi-Sorteo corriendo en el puerto ${PORT}`);
});
