
const express = require('express');
const router = express.Router();

const db = require('../db');

// Verifica se o usuário está autenticado
function verificarLogin(req, res, next) {
    if (!req.session.usuario) {
        return res.status(401).json({
            mensagem: 'Usuário não autenticado.'
        });
    }

    next();
}

// GET /api/gastos
// Lista os gastos do usuário
router.get('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;

        const resultado = await db.query(
            `SELECT
                id,
                descricao,
                valor,
                TO_CHAR(data, 'YYYY-MM-DD') AS data
             FROM gastos
             WHERE id_usuario = $1
             ORDER BY data DESC, id DESC`,
            [idUsuario]
        );

        const gastos = resultado.rows.map(gasto => ({
            id: gasto.id,
            description: gasto.descricao,
            value: Number(gasto.valor),
            date: gasto.data
        }));

        res.json(gastos);

    } catch (erro) {
        console.error('Erro ao buscar gastos:', erro);

        res.status(500).json({
            mensagem: 'Erro ao buscar os gastos.'
        });
    }
});

// POST /api/gastos
// Cadastra um novo gasto
router.post('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;
        const { description, value, date } = req.body;

        const valor = Number(value);

        if (!description || !description.trim()) {
            return res.status(400).json({
                mensagem: 'Informe a descrição do gasto.'
            });
        }

        if (value === undefined || value === null ||
            value === '' || !Number.isFinite(valor) || valor < 0) {
            return res.status(400).json({
                mensagem: 'Informe um valor válido.'
            });
        }

        if (!date) {
            return res.status(400).json({
                mensagem: 'Informe a data do gasto.'
            });
        }

        const resultado = await db.query(
            `INSERT INTO gastos (descricao, valor, data, id_usuario)
             VALUES ($1, $2, $3, $4)
             RETURNING id, descricao, valor,
                       TO_CHAR(data, 'YYYY-MM-DD') AS data`,
            [description.trim(), valor, date, idUsuario]
        );

        const gasto = resultado.rows[0];

        res.status(201).json({
            id: gasto.id,
            description: gasto.descricao,
            value: Number(gasto.valor),
            date: gasto.data
        });

    } catch (erro) {
        console.error('Erro ao cadastrar gasto:', erro);

        res.status(500).json({
            mensagem: 'Erro ao cadastrar o gasto.'
        });
    }
});

// DELETE /api/gastos/:id
// Exclui um gasto
router.delete('/:id', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                mensagem: 'ID inválido.'
            });
        }

        const resultado = await db.query(
            `DELETE FROM gastos
             WHERE id = $1 AND id_usuario = $2
             RETURNING id`,
            [id, idUsuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Gasto não encontrado.'
            });
        }

        res.status(204).send();

    } catch (erro) {
        console.error('Erro ao excluir gasto:', erro);

        res.status(500).json({
            mensagem: 'Erro ao excluir o gasto.'
        });
    }
});

module.exports = router;
