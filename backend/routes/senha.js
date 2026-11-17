
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const db = require('../db');
const enviarEmail = require('../email');

const router = express.Router();

const TEMPO_CODIGO = 10 * 60 * 1000; // 10 minutos
const TEMPO_TOKEN = 10 * 60 * 1000; // 10 minutos
const TEMPO_REENVIO = 30 * 1000; // 30 segundos
const MAX_TENTATIVAS = 5;

// Gera um hash protegido usando um segredo do backend.
function gerarHash(valor) {
    return crypto
        .createHmac('sha256', process.env.SESSION_SECRET)
        .update(valor)
        .digest('hex');
}

// Compara hashes de maneira segura.
function compararHashes(hash1, hash2) {
    const a = Buffer.from(hash1, 'hex');
    const b = Buffer.from(hash2, 'hex');

    return a.length === b.length &&
        crypto.timingSafeEqual(a, b);
}

// 1. ENVIAR CÓDIGO
router.post('/enviar-codigo', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                mensagem: 'Informe o e-mail.'
            });
        }

        const usuario = await db.query(
            'SELECT id FROM usuarios WHERE email = $1',
            [email]
        );

        // Não revela se o e-mail está cadastrado.
        if (usuario.rows.length === 0) {
            return res.json({
                mensagem: 'Se o e-mail estiver cadastrado, você receberá um código.'
            });
        }

        const idUsuario = usuario.rows[0].id;

        const recuperacao = await db.query(
            `SELECT criado_em
             FROM recuperacao_senha
             WHERE id_usuario = $1`,
            [idUsuario]
        );

        // Impede reenvios em intervalos menores que 30 segundos.
        if (recuperacao.rows.length > 0) {
            const ultimoEnvio = new Date(recuperacao.rows[0].criado_em).getTime();
            const tempoDecorrido = Date.now() - ultimoEnvio;

            if (tempoDecorrido < TEMPO_REENVIO) {
                return res.status(429).json({
                    mensagem: 'Aguarde 30 segundos antes de solicitar outro código.'
                });
            }
        }

        const codigo = crypto.randomInt(100000, 1000000).toString();
        const codigoHash = gerarHash(codigo);

        // Envia o e-mail.
        await enviarEmail(
            email,
            'Código de recuperação de senha - PlanCut',
            `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Recuperação de senha</h2>
                    <p>Você solicitou a redefinição da sua senha no PlanCut.</p>
                    <p>Seu código de verificação é:</p>
                    <h1 style="letter-spacing: 8px;">${codigo}</h1>
                    <p>Esse código expira em 10 minutos.</p>
                    <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
                </div>
            `
        );

        // Salva o código protegido no banco.
        await db.query(
            `INSERT INTO recuperacao_senha
                (id_usuario, codigo_hash, expira_em, tentativas,
                 criado_em, token_redefinicao_hash, token_expira_em)
             VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 0,
                     NOW(), NULL, NULL)
             ON CONFLICT (id_usuario)
             DO UPDATE SET
                codigo_hash = EXCLUDED.codigo_hash,
                expira_em = EXCLUDED.expira_em,
                tentativas = 0,
                criado_em = NOW(),
                token_redefinicao_hash = NULL,
                token_expira_em = NULL`,
            [idUsuario, codigoHash]
        );

        return res.json({
            mensagem: 'Se o e-mail estiver cadastrado, você receberá um código.'
        });

    } catch (erro) {
        console.error('Erro ao enviar código:', erro.message);

        return res.status(500).json({
            mensagem: 'Não foi possível enviar o código. Tente novamente.'
        });
    }
});


// 2. VERIFICAR CÓDIGO
router.post('/verificar-codigo', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const codigo = String(req.body.codigo || '').trim();

        if (!email || !/^\d{6}$/.test(codigo)) {
            return res.status(400).json({
                mensagem: 'Código inválido.'
            });
        }

        const resultado = await db.query(
            `SELECT r.*, u.id
             FROM recuperacao_senha r
             JOIN usuarios u ON u.id = r.id_usuario
             WHERE u.email = $1`,
            [email]
        );

        if (resultado.rows.length === 0) {
            return res.status(400).json({
                mensagem: 'Código inválido ou expirado.'
            });
        }

        const recuperacao = resultado.rows[0];

        if (new Date(recuperacao.expira_em) <= new Date()) {
            return res.status(410).json({
                mensagem: 'O código expirou. Solicite outro.'
            });
        }

        if (recuperacao.tentativas >= MAX_TENTATIVAS) {
            return res.status(429).json({
                mensagem: 'Limite de tentativas atingido. Solicite outro código.'
            });
        }

        const codigoHash = gerarHash(codigo);

        if (!compararHashes(codigoHash, recuperacao.codigo_hash)) {
            await db.query(
                `UPDATE recuperacao_senha
                 SET tentativas = tentativas + 1
                 WHERE id_usuario = $1`,
                [recuperacao.id_usuario]
            );

            return res.status(400).json({
                mensagem: 'Código incorreto.'
            });
        }

        // Gera um token aleatório para autorizar a troca da senha.
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = gerarHash(token);

        await db.query(
            `UPDATE recuperacao_senha
             SET token_redefinicao_hash = $1,
                 token_expira_em = NOW() + INTERVAL '10 minutes',
                 expira_em = NOW()
             WHERE id_usuario = $2`,
            [tokenHash, recuperacao.id_usuario]
        );

        return res.json({
            mensagem: 'Código verificado com sucesso.',
            token
        });

    } catch (erro) {
        console.error('Erro ao verificar código:', erro.message);

        return res.status(500).json({
            mensagem: 'Não foi possível verificar o código.'
        });
    }
});


// 3. REDEFINIR SENHA
router.post('/redefinir', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const token = String(req.body.token || '').trim();
        const novaSenha = String(req.body.novaSenha || '');

        if (!email || !token || novaSenha.length < 8) {
            return res.status(400).json({
                mensagem: 'Dados inválidos. A senha deve ter pelo menos 8 caracteres.'
            });
        }

        const resultado = await db.query(
            `SELECT r.id_usuario, r.token_redefinicao_hash,
                    r.token_expira_em
             FROM recuperacao_senha r
             JOIN usuarios u ON u.id = r.id_usuario
             WHERE u.email = $1`,
            [email]
        );

        if (resultado.rows.length === 0) {
            return res.status(400).json({
                mensagem: 'Solicitação inválida ou expirada.'
            });
        }

        const recuperacao = resultado.rows[0];

        if (
            !recuperacao.token_redefinicao_hash ||
            !recuperacao.token_expira_em ||
            new Date(recuperacao.token_expira_em) <= new Date()
        ) {
            return res.status(400).json({
                mensagem: 'Solicitação inválida ou expirada.'
            });
        }

        const tokenHash = gerarHash(token);

        if (!compararHashes(tokenHash, recuperacao.token_redefinicao_hash)) {
            return res.status(400).json({
                mensagem: 'Solicitação inválida ou expirada.'
            });
        }

        const senhaHash = await bcrypt.hash(novaSenha, 10);

        await db.query(
            'UPDATE usuarios SET senha_hash = $1 WHERE id = $2',
            [senhaHash, recuperacao.id_usuario]
        );

        // O token é de uso único.
        await db.query(
            'DELETE FROM recuperacao_senha WHERE id_usuario = $1',
            [recuperacao.id_usuario]
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
