
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

// Confere se os serviços existem e pertencem ao usuário
async function buscarServicos(client, idUsuario, services) {
    if (!Array.isArray(services) ||
        !services.every(servico => typeof servico === 'string')) {
        throw new Error('Informe uma lista válida de serviços.');
    }

    const nomes = [...new Set(services)];

    if (nomes.length === 0) {
        return [];
    }

    const resultado = await client.query(
        `SELECT id, nome
         FROM categorias_servico
         WHERE id_usuario = $1 AND nome = ANY($2::text[])`,
        [idUsuario, nomes]
    );

    if (resultado.rows.length !== nomes.length) {
        throw new Error('Um ou mais serviços não foram encontrados.');
    }

    return resultado.rows;
}

// Salva a relação entre o agendamento e seus serviços
async function salvarServicos(client, idAgendamento, servicos) {
    for (const servico of servicos) {
        await client.query(
            `INSERT INTO agendamento_servicos
             (id_agendamento, id_categoria)
             VALUES ($1, $2)`,
            [idAgendamento, servico.id]
        );
    }
}

// GET /api/agendamentos
// Lista os agendamentos do usuário
router.get('/', verificarLogin, async (req, res) => {
    try {
        const idUsuario = req.session.usuario.id;

        const resultado = await db.query(
            `SELECT
                a.id,
                TO_CHAR(a.data, 'YYYY-MM-DD') AS data,
                TO_CHAR(a.horario, 'HH24:MI') AS horario,
                a.nome_cliente,
                a.telefone_cliente,
                a.status,
                a.registrado_atrasado,
                TO_CHAR(a.registrado_em, 'YYYY-MM-DD') AS registrado_em,
                COALESCE(
                    ARRAY_AGG(DISTINCT c.nome)
                    FILTER (WHERE c.id IS NOT NULL),
                    ARRAY[]::text[]
                ) AS servicos
             FROM agendamentos a
             LEFT JOIN agendamento_servicos ags
                ON ags.id_agendamento = a.id
             LEFT JOIN categorias_servico c
                ON c.id = ags.id_categoria
             WHERE a.id_usuario = $1
             GROUP BY a.id
             ORDER BY a.data, a.horario`,
            [idUsuario]
        );

        const agendamentos = resultado.rows.map(agendamento => ({
            id: agendamento.id,
            date: agendamento.data,
            time: agendamento.horario,
            clientName: agendamento.nome_cliente,
            clientPhone: agendamento.telefone_cliente,
            services: agendamento.servicos,
            status: agendamento.status,
            registeredLate: agendamento.registrado_atrasado,
            registeredOn: agendamento.registrado_em
        }));

        res.json(agendamentos);

    } catch (erro) {
        console.error('Erro ao buscar agendamentos:', erro);

        res.status(500).json({
            mensagem: 'Erro ao buscar os agendamentos.'
        });
    }
});

// POST /api/agendamentos
// Cadastra um novo agendamento
router.post('/', verificarLogin, async (req, res) => {
    const client = await db.connect();

    try {
        const idUsuario = req.session.usuario.id;

        const {
            date,
            time,
            clientName,
            clientPhone,
            services,
            status,
            registeredLate,
            registeredOn
        } = req.body;

        if (!date || !time || !clientName ||
            !clientPhone || !Array.isArray(services)) {
            return res.status(400).json({
                mensagem: 'Preencha os dados do agendamento corretamente.'
            });
        }

        const statusFinal = status || 'pendente';

        if (!['pendente', 'finalizado', 'falta'].includes(statusFinal)) {
            return res.status(400).json({
                mensagem: 'Status do agendamento inválido.'
            });
        }

        await client.query('BEGIN');

        const servicosEncontrados = await buscarServicos(
            client, idUsuario, services
        );

        const resultado = await client.query(
            `INSERT INTO agendamentos
             (data, horario, nome_cliente, telefone_cliente,
              status, registrado_atrasado, registrado_em, id_usuario)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
                date,
                time,
                clientName.trim(),
                String(clientPhone).trim(),
                statusFinal,
                registeredLate === true,
                registeredOn || null,
                idUsuario
            ]
        );

        const idAgendamento = resultado.rows[0].id;

        await salvarServicos(
            client, idAgendamento, servicosEncontrados
        );

        await client.query('COMMIT');

        res.status(201).json({
            id: idAgendamento,
            date,
            time,
            clientName: clientName.trim(),
            clientPhone: String(clientPhone).trim(),
            services: servicosEncontrados.map(s => s.nome),
            status: statusFinal,
            registeredLate: registeredLate === true,
            registeredOn: registeredOn || null
        });

    } catch (erro) {
        await client.query('ROLLBACK');

        if (erro.code === '23505') {
            return res.status(409).json({
                mensagem: 'Já existe um agendamento nesse horário.'
            });
        }

        if (erro.message.includes('serviços')) {
            return res.status(400).json({
                mensagem: erro.message
            });
        }

        console.error('Erro ao cadastrar agendamento:', erro);

        res.status(500).json({
            mensagem: 'Erro ao cadastrar o agendamento.'
        });

    } finally {
        client.release();
    }
});

// PUT /api/agendamentos/:id
// Atualiza um agendamento
router.put('/:id', verificarLogin, async (req, res) => {
    const client = await db.connect();

    try {
        const idUsuario = req.session.usuario.id;
        const id = Number(req.params.id);

        const {
            date,
            time,
            clientName,
            clientPhone,
            services,
            status,
            registeredLate,
            registeredOn
        } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                mensagem: 'ID inválido.'
            });
        }

        if (!date || !time || !clientName ||
            !clientPhone || !Array.isArray(services)) {
            return res.status(400).json({
                mensagem: 'Preencha os dados do agendamento corretamente.'
            });
        }

        const statusFinal = status || 'pendente';

        if (!['pendente', 'finalizado', 'falta'].includes(statusFinal)) {
            return res.status(400).json({
                mensagem: 'Status do agendamento inválido.'
            });
        }

        await client.query('BEGIN');

        const servicosEncontrados = await buscarServicos(
            client, idUsuario, services
        );

        const resultado = await client.query(
            `UPDATE agendamentos
             SET data = $1,
                 horario = $2,
                 nome_cliente = $3,
                 telefone_cliente = $4,
                 status = $5,
                 registrado_atrasado = $6,
                 registrado_em = $7
             WHERE id = $8 AND id_usuario = $9
             RETURNING id`,
            [
                date,
                time,
                clientName.trim(),
                String(clientPhone).trim(),
                statusFinal,
                registeredLate === true,
                registeredOn || null,
                id,
                idUsuario
            ]
        );

        if (resultado.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                mensagem: 'Agendamento não encontrado.'
            });
        }

        // Remove os serviços antigos
        await client.query(
            `DELETE FROM agendamento_servicos
             WHERE id_agendamento = $1`,
            [id]
        );

        // Registra os serviços atualizados
        await salvarServicos(
            client, id, servicosEncontrados
        );

        await client.query('COMMIT');

        res.json({
            id,
            date,
            time,
            clientName: clientName.trim(),
            clientPhone: String(clientPhone).trim(),
            services: servicosEncontrados.map(s => s.nome),
            status: statusFinal,
            registeredLate: registeredLate === true,
            registeredOn: registeredOn || null
        });

    } catch (erro) {
        await client.query('ROLLBACK');

        if (erro.code === '23505') {
            return res.status(409).json({
                mensagem: 'Já existe um agendamento nesse horário.'
            });
        }

        if (erro.message.includes('serviços')) {
            return res.status(400).json({
                mensagem: erro.message
            });
        }

        console.error('Erro ao atualizar agendamento:', erro);

        res.status(500).json({
            mensagem: 'Erro ao atualizar o agendamento.'
        });

    } finally {
        client.release();
    }
});

// DELETE /api/agendamentos/:id
// Exclui um agendamento
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
            `DELETE FROM agendamentos
             WHERE id = $1 AND id_usuario = $2
             RETURNING id`,
            [id, idUsuario]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: 'Agendamento não encontrado.'
            });
        }

        res.status(204).send();

    } catch (erro) {
        console.error('Erro ao excluir agendamento:', erro);

        res.status(500).json({
            mensagem: 'Erro ao excluir o agendamento.'
        });
    }
});

module.exports = router;
