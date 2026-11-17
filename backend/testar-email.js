const enviarEmail = require('./email');

async function testar() {
    try {
        const resultado = await enviarEmail(
            'henrique05cruz@gmail.com',
            'Teste de envio - PlanCut',
            '<h1>Olá!</h1><p>O envio de e-mails do PlanCut está funcionando!</p>'
        );

        console.log('E-mail enviado com sucesso!');
        console.log(resultado);

    } catch (erro) {
        console.error('Erro ao enviar e-mail:', erro);
    }
}

testar();