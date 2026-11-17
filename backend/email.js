require('dotenv').config();

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY
    }
});

async function enviarEmail(destinatario, assunto, mensagem) {
    const resultado = await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: destinatario,
        subject: assunto,
        html: mensagem
    });

    return resultado;
}

module.exports = enviarEmail;