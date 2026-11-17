
require('dotenv').config();

const { Pool } = require('pg');

const db = process.env.POSTGRES_URL
    ? new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: {
            rejectUnauthorized: false
        }
    })
    : new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

db.on('error', (erro) => {
    console.error('Erro inesperado no PostgreSQL:', erro);
});

module.exports = db;
