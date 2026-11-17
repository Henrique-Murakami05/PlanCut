
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

// GET /api/categorias
// Lista os serviços do usuário
router.get('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;

        const resultado = await db.query(
            `SELECT id, nome, preco, icone
             FROM categorias_servico
             WHERE id_usuario = $1
             ORDER BY id`,
            [idUsuario]
        );

        const categorias = resultado.rows.map(categoria => ({
            id: categoria.id,
            name: categoria.nome,
            price: Number(categoria.preco),
            icon: categoria.icone
        }));

        res.json(categorias);

    } catch (erro) {
        console.error('Erro ao buscar categorias:', erro);

        res.status(500).json({
            mensagem: 'Erro ao buscar os serviços.'
        });
    }
});

// POST /api/categorias
// Cadastra um novo serviço
router.post('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;
        const { name, price, icon } = req.body;

        const preco = Number(price);

        if (!name || !name.trim()) {
            return res.status(400).json({
                mensagem: 'Informe o nome do serviço.'
            });
        }

        if (price === undefined || price === null ||
            price === '' || !Number.isFinite(preco) || preco < 0) {
            return res.status(400).json({
                mensagem: 'Informe um preço válido.'
            });
        }

        const resultado = await db.query(
            `INSERT INTO categorias_servico
             (nome, preco, icone, id_usuario)
             VALUES ($1, $2, $3, $4)
             RETURNING id, nome, preco, icone`,
            [
                name.trim(),
                preco,
                icon || '✂',
                idUsuario
            ]
        );

        const categoria = resultado.rows[0];

        res.status(201).json({
            id: categoria.id,
            name: categoria.nome,
            price: Number(categoria.preco),
            icon: categoria.icone
        });

    } catch (erro) {
        console.error('Erro ao cadastrar categoria:', erro);

        res.status(500).json({
            mensagem: 'Erro ao cadastrar o serviço.'
        });
    }
});

// PUT /api/categorias/:id
// Atualiza um serviço
router.put('/:id', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;
        const id = Number(req.params.id);
        const { name, price, icon } = req.body;

        const preco = Number(price);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                mensagem: 'ID inválido.'
            });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({
                mensagem: 'Informe o nome do serviço.'
            });
        }

        if (price === undefined || price === null ||
            price === '' || !Number.isFinite(preco) || preco < 0) {
            return res.status(400).json({
                mensagem: 'Informe um preço válido.'
            });
        }

        const resultado = await db.query(
            `UPDATE categorias_servico
             SET nome = $1, preco = $2, icone = $3
             WHERE id = $4 AND id_usuario = $5
             RETURNING id, nome, preco, icone`,
            [
                name.trim(),
                preco,
                icon || '✂',
                id,
                idUsuario
            ]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Serviço não encontrado.'
            });
        }

        const categoria = resultado.rows[0];

        res.json({
            id: categoria.id,
            name: categoria.nome,
            price: Number(categoria.preco),
            icon: categoria.icone
        });

    } catch (erro) {
        console.error('Erro ao atualizar categoria:', erro);

        res.status(500).json({
            mensagem: 'Erro ao atualizar o serviço.'
        });
    }
});

// DELETE /api/categorias/:id
// Exclui um serviço
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
            `DELETE FROM categorias_servico
             WHERE id = $1 AND id_usuario = $2
             RETURNING id`,
            [id, idUsuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Serviço não encontrado.'
            });
        }

        res.status(204).send();

    } catch (erro) {
        // Serviço vinculado a um agendamento
        if (erro.code === '23503') {
            return res.status(409).json({
                mensagem: 'Não é possível excluir este serviço, pois ele está vinculado a um agendamento.'
            });
        }

        console.error('Erro ao excluir categoria:', erro);

        res.status(500).json({
            mensagem: 'Erro ao excluir o serviço.'
        });
    }
});

module.exports = router;
