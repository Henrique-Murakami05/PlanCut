
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

// GET /api/clientes
// Lista os clientes do usuário
router.get('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;

        const resultado = await db.query(
            `SELECT id, nome, telefone
             FROM clientes
             WHERE id_usuario = $1
             ORDER BY id`,
            [idUsuario]
        );

        const clientes = resultado.rows.map(cliente => ({
            id: cliente.id,
            name: cliente.nome,
            phone: cliente.telefone
        }));

        res.json(clientes);

    } catch (erro) {
        console.error('Erro ao buscar clientes:', erro);

        res.status(500).json({
            mensagem: 'Erro ao buscar os clientes.'
        });
    }
});

// POST /api/clientes
// Cadastra um novo cliente
router.post('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;
        const { name, phone } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                mensagem: 'Informe o nome do cliente.'
            });
        }

        if (!phone || !String(phone).trim()) {
            return res.status(400).json({
                mensagem: 'Informe o telefone do cliente.'
            });
        }

        const resultado = await db.query(
            `INSERT INTO clientes (nome, telefone, id_usuario)
             VALUES ($1, $2, $3)
             RETURNING id, nome, telefone`,
            [name.trim(), String(phone).trim(), idUsuario]
        );

        const cliente = resultado.rows[0];

        res.status(201).json({
            id: cliente.id,
            name: cliente.nome,
            phone: cliente.telefone
        });

    } catch (erro) {
        console.error('Erro ao cadastrar cliente:', erro);

        res.status(500).json({
            mensagem: 'Erro ao cadastrar o cliente.'
        });
    }
});

// PUT /api/clientes/:id
// Atualiza os dados de um cliente
router.put('/:id', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;
        const id = Number(req.params.id);
        const { name, phone } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                mensagem: 'ID inválido.'
            });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({
                mensagem: 'Informe o nome do cliente.'
            });
        }

        if (!phone || !String(phone).trim()) {
            return res.status(400).json({
                mensagem: 'Informe o telefone do cliente.'
            });
        }

        const resultado = await db.query(
            `UPDATE clientes
             SET nome = $1, telefone = $2
             WHERE id = $3 AND id_usuario = $4
             RETURNING id, nome, telefone`,
            [name.trim(), String(phone).trim(), id, idUsuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Cliente não encontrado.'
            });
        }

        const cliente = resultado.rows[0];

        res.json({
            id: cliente.id,
            name: cliente.nome,
            phone: cliente.telefone
        });

    } catch (erro) {
        console.error('Erro ao atualizar cliente:', erro);

        res.status(500).json({
            mensagem: 'Erro ao atualizar o cliente.'
        });
    }
});

// DELETE /api/clientes/:id
// Exclui um cliente
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
            `DELETE FROM clientes
             WHERE id = $1 AND id_usuario = $2
             RETURNING id`,
            [id, idUsuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Cliente não encontrado.'
            });
        }

        res.status(204).send();

    } catch (erro) {
        console.error('Erro ao excluir cliente:', erro);

        res.status(500).json({
            mensagem: 'Erro ao excluir o cliente.'
        });
    }
});

module.exports = router;
