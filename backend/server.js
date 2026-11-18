
const path = require('path');

require('dotenv').config({
    path: path.join(__dirname, '.env')
});

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const cors = require('cors');

const db = require('./db');

const authRoutes = require('./routes/auth');
const perfilRoutes = require('./routes/perfil');
const categoriasRoutes = require('./routes/categorias');
const clientesRoutes = require('./routes/clientes');
const agendamentosRoutes = require('./routes/agendamentos');
const gastosRoutes = require('./routes/gastos');
const produtosRoutes = require('./routes/produtos');
const senhaRoutes = require('./routes/senha');

const app = express();

const producao = process.env.NODE_ENV === 'production';

// =========================================
// CONFIGURAÇÕES GERAIS
// =========================================

if (producao) {
    app.set('trust proxy', 1);
}

const origensPermitidas = [
    'http://localhost:5500',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : null
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || origensPermitidas.includes(origin) || (origin && origin.endsWith('.vercel.app'))) {
            return callback(null, true);
        }

        return callback(new Error('Origem não permitida pelo CORS.'));
    },
    credentials: true
}));

app.use(express.json());
app.use((req, res, next) => {
    console.log('REQUISIÇÃO RECEBIDA:', req.method, req.originalUrl);
    next();
});

// =========================================
// CONFIGURAÇÃO DAS SESSÕES
// =========================================

app.use(session({
    store: new PgSession({
        pool: db,
        tableName: 'sessoes',
        createTableIfMissing: true
    }),

    secret: process.env.SESSION_SECRET,

    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        secure: producao,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// =========================================
// ROTAS
// =========================================

app.use('/api/auth', authRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/agendamentos', agendamentosRoutes);
app.use('/api/gastos', gastosRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/senha', senhaRoutes);

// =========================================
// TESTAR CONEXÃO COM POSTGRESQL
// =========================================

app.get('/api/teste-db', async (req, res) => {
    try {
        const resultado = await db.query('SELECT NOW()');

        res.json({
            mensagem: 'Conexão com PostgreSQL realizada com sucesso!',
            horario: resultado.rows[0].now
        });

    } catch (erro) {
        console.error('Erro ao conectar:', erro.message);

        res.status(500).json({
            mensagem: 'Não foi possível conectar ao banco de dados.'
        });
    }
});

// =========================================
// INICIAR SERVIDOR LOCALMENTE
// =========================================

if (require.main === module) {
    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
        console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
}

// =========================================
// EXPORTAR A APLICAÇÃO
// =========================================

module.exports = app;
