
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

// GET /api/perfil
// Busca os dados do perfil do usuário logado
router.get('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;

        const resultado = await db.query(
            `SELECT nome, escala_fonte
             FROM usuarios
             WHERE id = $1`,
            [idUsuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Usuário não encontrado.'
            });
        }

        const usuario = resultado.rows[0];

        res.json({
            name: usuario.nome,
            fontScale: Number(usuario.escala_fonte)
        });

    } catch (erro) {
        console.error('Erro ao buscar perfil:', erro);

        res.status(500).json({
            mensagem: 'Erro ao buscar os dados do perfil.'
        });
    }
});

// PUT /api/perfil
// Atualiza os dados do perfil do usuário logado
router.put('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;

        const { name, fontScale } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                mensagem: 'Informe um nome válido.'
            });
        }

        const escala = Number(fontScale);

        if (!Number.isFinite(escala) || escala < 0.85 || escala > 1.3) {
            return res.status(400).json({
                mensagem: 'Escala de fonte inválida.'
            });
        }

        const resultado = await db.query(
            `UPDATE usuarios
             SET nome = $1, escala_fonte = $2
             WHERE id = $3
             RETURNING nome, escala_fonte`,
            [name.trim(), escala, idUsuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Usuário não encontrado.'
            });
        }

        const usuario = resultado.rows[0];

        res.json({
            name: usuario.nome,
            fontScale: Number(usuario.escala_fonte)
        });

    } catch (erro) {
        console.error('Erro ao atualizar perfil:', erro);

        res.status(500).json({
            mensagem: 'Erro ao atualizar os dados do perfil.'
        });
    }
});

module.exports = router;
