
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();

// =========================================
// CADASTRO
// =========================================

router.post('/cadastro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;

        if (!nome || !email || !senha) {
            return res.status(400).json({
                mensagem: 'Preencha todos os campos.'
            });
        }

        if (senha.length < 8) {
            return res.status(400).json({
                mensagem: 'A senha deve ter pelo menos 8 caracteres.'
            });
        }

        const emailFormatado = email.trim().toLowerCase();

        const senhaHash = await bcrypt.hash(senha, 10);

        const resultado = await db.query(
            `INSERT INTO usuarios (nome, email, senha_hash)
             VALUES ($1, $2, $3)
             RETURNING id, nome, email`,
            [nome.trim(), emailFormatado, senhaHash]
        );

        res.status(201).json({
            mensagem: 'Usuário cadastrado com sucesso!',
            usuario: resultado.rows[0]
        });

    } catch (erro) {
        if (erro.code === '23505') {
            return res.status(409).json({
                mensagem: 'Este e-mail já está cadastrado.'
            });
        }

        console.error('Erro no cadastro:', erro);

        res.status(500).json({
            mensagem: 'Erro ao cadastrar usuário.'
        });
    }
});


// =========================================
// LOGIN
// =========================================

router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({
                mensagem: 'Informe o e-mail e a senha.'
            });
        }

        const resultado = await db.query(
            `SELECT id, nome, email, senha_hash
             FROM usuarios
             WHERE email = $1`,
            [email.trim().toLowerCase()]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                mensagem: 'E-mail ou senha incorretos.'
            });
        }

        const usuario = resultado.rows[0];

        const senhaCorreta = await bcrypt.compare(
            senha,
            usuario.senha_hash
        );

        if (!senhaCorreta) {
            return res.status(401).json({
                mensagem: 'E-mail ou senha incorretos.'
            });
        }

        // Renovar a sessão após o login
        req.session.regenerate((erro) => {
            if (erro) {
                console.error('Erro na sessão:', erro);

                return res.status(500).json({
                    mensagem: 'Erro ao iniciar sessão.'
                });
            }

            req.session.usuario = {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email
            };

            req.session.save((erro) => {
                if (erro) {
                    console.error('Erro ao salvar sessão:', erro);

                    return res.status(500).json({
                        mensagem: 'Erro ao salvar sessão.'
                    });
                }

                res.json({
                    mensagem: 'Login realizado com sucesso!',
                    usuario: req.session.usuario
                });
            });
        });

    } catch (erro) {
        console.error('Erro no login:', erro);

        res.status(500).json({
            mensagem: 'Erro ao realizar login.'
        });
    }
});


// =========================================
// VERIFICAR USUÁRIO LOGADO
// =========================================

router.get('/me', (req, res) => {
    if (!req.session.usuario) {
        return res.status(401).json({
            mensagem: 'Usuário não autenticado.'
        });
    }

    res.json({
        usuario: req.session.usuario
    });
});


// =========================================
// LOGOUT
// =========================================

router.post('/logout', (req, res) => {
    req.session.destroy((erro) => {
        if (erro) {
            return res.status(500).json({
                mensagem: 'Erro ao encerrar sessão.'
            });
        }

        res.clearCookie('connect.sid');

        res.json({
            mensagem: 'Logout realizado com sucesso!'
        });
    });
});

module.exports = router;
