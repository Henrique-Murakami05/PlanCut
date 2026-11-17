
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

// GET /api/produtos
// Lista os produtos adquiridos pelo usuário
router.get('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;

        const resultado = await db.query(
            `SELECT
                id,
                nome,
                quantidade,
                valor,
                TO_CHAR(data, 'YYYY-MM-DD') AS data
             FROM produtos_adquiridos
             WHERE id_usuario = $1
             ORDER BY data DESC, id DESC`,
            [idUsuario]
        );

        const produtos = resultado.rows.map(produto => ({
            id: produto.id,
            name: produto.nome,
            quantity: produto.quantidade,
            value: Number(produto.valor),
            date: produto.data
        }));

        res.json(produtos);

    } catch (erro) {
        console.error('Erro ao buscar produtos:', erro);

        res.status(500).json({
            mensagem: 'Erro ao buscar os produtos.'
        });
    }
});

// POST /api/produtos
// Cadastra um produto adquirido
router.post('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;
        const { name, quantity, value, date } = req.body;

        const quantidade = Number(quantity);
        const valor = Number(value);

        if (!name || !name.trim()) {
            return res.status(400).json({
                mensagem: 'Informe o nome do produto.'
            });
        }

        if (quantity === undefined || quantity === null ||
            quantity === '' || !Number.isInteger(quantidade) ||
            quantidade <= 0) {
            return res.status(400).json({
                mensagem: 'Informe uma quantidade válida.'
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
                mensagem: 'Informe a data da compra.'
            });
        }

        const resultado = await db.query(
            `INSERT INTO produtos_adquiridos
             (nome, quantidade, valor, data, id_usuario)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, nome, quantidade, valor,
                       TO_CHAR(data, 'YYYY-MM-DD') AS data`,
            [name.trim(), quantidade, valor, date, idUsuario]
        );

        const produto = resultado.rows[0];

        res.status(201).json({
            id: produto.id,
            name: produto.nome,
            quantity: produto.quantidade,
            value: Number(produto.valor),
            date: produto.data
        });

    } catch (erro) {
        console.error('Erro ao cadastrar produto:', erro);

        res.status(500).json({
            mensagem: 'Erro ao cadastrar o produto.'
        });
    }
});

// DELETE /api/produtos/:id
// Exclui um produto adquirido
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
            `DELETE FROM produtos_adquiridos
             WHERE id = $1 AND id_usuario = $2
             RETURNING id`,
            [id, idUsuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Produto não encontrado.'
            });
        }

        res.status(204).send();

    } catch (erro) {
        console.error('Erro ao excluir produto:', erro);

        res.status(500).json({
            mensagem: 'Erro ao excluir o produto.'
        });
    }
});

module.exports = router;
