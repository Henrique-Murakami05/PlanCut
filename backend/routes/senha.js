
const express = require('express');
const bcrypt = require('bcrypt');

const db = require('../db');

const router = express.Router();

// 1. VERIFICAR E-MAIL
router.post('/verificar-email', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                mensagem: 'Informe o e-mail.'
            });
        }

        const resultado = await db.query(
            'SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1)',
            [email]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'E-mail não encontrado.'
            });
        }

        return res.json({
            mensagem: 'E-mail encontrado. Você pode redefinir sua senha.',
            email
        });

    } catch (erro) {
        console.error('Erro ao verificar e-mail:', erro.message);

        return res.status(500).json({
            mensagem: 'Não foi possível verificar o e-mail.'
        });
    }
});


// 2. REDEFINIR SENHA
router.post('/redefinir', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const novaSenha = String(req.body.novaSenha || '');

        if (!email || novaSenha.length < 8) {
            return res.status(400).json({
                mensagem: 'A senha deve ter pelo menos 8 caracteres.'
            });
        }

        const usuario = await db.query(
            'SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1)',
            [email]
        );

        if (usuario.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'E-mail não encontrado.'
            });
        }

        const senhaHash = await bcrypt.hash(novaSenha, 10);

        await db.query(
            'UPDATE usuarios SET senha_hash = $1 WHERE id = $2',
            [senhaHash, usuario.rows[0].id]
        );

        return res.json({
            mensagem: 'Senha redefinida com sucesso!'
        });

    } catch (erro) {
        console.error('Erro ao redefinir senha:', erro.message);

        return res.status(500).json({
            mensagem: 'Não foi possível redefinir a senha.'
        });
    }
});

module.exports = router;
