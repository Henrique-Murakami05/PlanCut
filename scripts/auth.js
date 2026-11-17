
document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------------
  // CONFIGURAÇÃO DO BACKEND
  // ---------------------------------------------------------------------
  const API_CADASTRO = 'http://localhost:3000/api/auth/cadastro';
  const API_LOGIN = 'http://localhost:3000/api/auth/login';

  async function postJson(url, dados) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(dados)
    });

    let corpo = null;
    try {
      corpo = await resp.json();
    } catch (e) {}

    return { ok: resp.ok, status: resp.status, corpo };
  }

  // ---------------------------------------------------------------------
  // CADASTRO
  // ---------------------------------------------------------------------
  const formCadastro = document.getElementById('formCadastro');

  if (formCadastro) {
    formCadastro.addEventListener('submit', async (e) => {
      e.preventDefault();

      const usuario = document.getElementById('cadastroUsuario').value.trim();
      const email = document.getElementById('cadastroEmail').value.trim().toLowerCase();
      const senha = document.getElementById('cadastroSenha').value;
      const confirmarSenha = document.getElementById('cadastroConfirmarSenha').value;

      if (!usuario) {
        alert('Informe um nome de usuário.');
        return;
      }

      if (senha !== confirmarSenha) {
        alert('As senhas não coincidem. Verifique e tente novamente.');
        return;
      }

      try {
        const r = await postJson(API_CADASTRO, {
          nome: usuario,
          email,
          senha
        });

        if (!r.ok) {
          alert((r.corpo && r.corpo.mensagem) || 'Não foi possível concluir o cadastro.');
          return;
        }
      } catch (err) {
        alert('Não foi possível conectar ao servidor. Tente novamente em instantes.');
        return;
      }

      alert('Cadastro realizado com sucesso! Faça login para continuar.');
      window.location.href = 'pages/login.html';
    });
  }

  // ---------------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------------
  const formLogin = document.getElementById('formLogin');

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('loginEmail').value.trim().toLowerCase();
      const senha = document.getElementById('loginSenha').value;

      try {
        const r = await postJson(API_LOGIN, { email, senha });

        if (!r.ok) {
          alert((r.corpo && r.corpo.mensagem) || 'E-mail ou senha incorretos.');
          return;
        }
      } catch (err) {
        alert('Não foi possível conectar ao servidor. Tente novamente em instantes.');
        return;
      }

      window.location.href = '../pages/main.html';
    });
  }

  // ---------------------------------------------------------------------
  // REDEFINIÇÃO DE SENHA
  // ---------------------------------------------------------------------
  const formEmailReset = document.getElementById('formEmailReset');

  if (formEmailReset) {

    const API_ENVIAR_CODIGO = 'http://localhost:3000/api/senha/enviar-codigo';
    const API_VERIFICAR_CODIGO = 'http://localhost:3000/api/senha/verificar-codigo';
    const API_REDEFINIR_SENHA = 'http://localhost:3000/api/senha/redefinir';

    const REENVIO_ESPERA_S = 30;
    const MAX_TENTATIVAS = 5;

    const etapas = {
      email: document.getElementById('etapaEmail'),
      codigo: document.getElementById('etapaCodigo'),
      senha: document.getElementById('etapaSenha')
    };

    const formCodigo = document.getElementById('formCodigoReset');
    const formSenha = document.getElementById('formRedefinirSenha');
    const digitos = Array.from(document.querySelectorAll('#codigoInputs input'));
    const erroCodigo = document.getElementById('codigoErro');
    const btnReenviar = document.getElementById('btnReenviar');
    const btnTrocarEmail = document.getElementById('btnTrocarEmail');

    let emailAtual = '';
    let tentativas = 0;
    let tokenRedefinicao = null;
    let timerReenvio = null;

    function mostrarEtapa(nome) {
      Object.entries(etapas).forEach(([chave, el]) => {
        if (el) el.hidden = chave !== nome;
      });
    }

    function mostrarErroCodigo(msg) {
      erroCodigo.textContent = msg;
      erroCodigo.hidden = !msg;
    }

    // ---------------------------------------------------------------
    // ENVIAR CÓDIGO
    // ---------------------------------------------------------------
    async function enviarCodigoPorEmail(email) {
      const resp = await fetch(API_ENVIAR_CODIGO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      let corpo = {};
      try {
        corpo = await resp.json();
      } catch (e) {}

      if (!resp.ok) {
        throw new Error(corpo.mensagem || 'Não foi possível enviar o código.');
      }

      tentativas = 0;
      tokenRedefinicao = null;
    }

    // ---------------------------------------------------------------
    // VERIFICAR CÓDIGO
    // ---------------------------------------------------------------
    async function verificarCodigo(codigo) {
      const resp = await fetch(API_VERIFICAR_CODIGO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailAtual,
          codigo
        })
      });

      let corpo = {};
      try {
        corpo = await resp.json();
      } catch (e) {}

      if (resp.status === 410) {
        return { status: 'expirado' };
      }

      if (resp.status === 429) {
        return {
          status: 'limite',
          mensagem: corpo.mensagem
        };
      }

      if (!resp.ok) {
        return {
          status: 'invalido',
          mensagem: corpo.mensagem
        };
      }

      return {
        status: 'ok',
        token: corpo.token
      };
    }

    // ---------------------------------------------------------------
    // CONTADOR PARA REENVIAR CÓDIGO
    // ---------------------------------------------------------------
    function iniciarEsperaReenvio() {
      let restante = REENVIO_ESPERA_S;

      btnReenviar.disabled = true;
      btnReenviar.textContent = 'Reenviar código (' + restante + 's)';

      clearInterval(timerReenvio);

      timerReenvio = setInterval(() => {
        restante--;

        if (restante <= 0) {
          clearInterval(timerReenvio);
          btnReenviar.disabled = false;
          btnReenviar.textContent = 'Reenviar código';
        } else {
          btnReenviar.textContent = 'Reenviar código (' + restante + 's)';
        }
      }, 1000);
    }

    function limparCodigo() {
      digitos.forEach((d) => {
        d.value = '';
      });

      mostrarErroCodigo('');

      if (digitos[0]) digitos[0].focus();
    }

    // ---------------------------------------------------------------
    // ETAPA 1 -> 2: SOLICITAR CÓDIGO
    // ---------------------------------------------------------------
    formEmailReset.addEventListener('submit', async (e) => {
      e.preventDefault();

      emailAtual = document.getElementById('resetEmail').value.trim().toLowerCase();

      if (!emailAtual) return;

      try {
        await enviarCodigoPorEmail(emailAtual);
      } catch (err) {
        alert(err.message || 'Não foi possível enviar o código. Tente novamente.');
        return;
      }

      document.getElementById('emailEnviado').textContent = emailAtual;

      mostrarEtapa('codigo');
      limparCodigo();
      iniciarEsperaReenvio();
    });

    // ---------------------------------------------------------------
    // CAIXINHAS DO CÓDIGO
    // ---------------------------------------------------------------
    digitos.forEach((input, i) => {

      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 1);

        mostrarErroCodigo('');

        if (input.value && i < digitos.length - 1) {
          digitos[i + 1].focus();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && i > 0) {
          digitos[i - 1].focus();
        } else if (e.key === 'ArrowLeft' && i > 0) {
          digitos[i - 1].focus();
        } else if (e.key === 'ArrowRight' && i < digitos.length - 1) {
          digitos[i + 1].focus();
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();

        const colado = (e.clipboardData.getData('text') || '')
          .replace(/\D/g, '')
          .slice(0, digitos.length);

        colado.split('').forEach((c, k) => {
          digitos[k].value = c;
        });

        digitos[Math.min(colado.length, digitos.length - 1)].focus();
      });
    });

    // ---------------------------------------------------------------
    // ETAPA 2 -> 3: VALIDAR CÓDIGO
    // ---------------------------------------------------------------
    formCodigo.addEventListener('submit', async (e) => {
      e.preventDefault();

      const codigo = digitos.map((d) => d.value).join('');

      if (codigo.length < digitos.length) {
        mostrarErroCodigo('Digite os 6 dígitos do código.');
        return;
      }

      if (tentativas >= MAX_TENTATIVAS) {
        mostrarErroCodigo('Muitas tentativas. Solicite um novo código.');
        return;
      }

      let resultado;

      try {
        resultado = await verificarCodigo(codigo);
      } catch (err) {
        mostrarErroCodigo('Não foi possível verificar o código. Tente novamente.');
        return;
      }

      if (resultado.status === 'ok' && resultado.token) {

        // Guarda o token temporário retornado pelo backend.
        tokenRedefinicao = resultado.token;

        mostrarErroCodigo('');
        mostrarEtapa('senha');

        document.getElementById('novaSenha').focus();

      } else if (resultado.status === 'expirado') {

        mostrarErroCodigo('Código expirado. Solicite um novo código.');

      } else if (resultado.status === 'limite') {

        tentativas = MAX_TENTATIVAS;
        mostrarErroCodigo(resultado.mensagem || 'Limite de tentativas atingido. Solicite outro código.');

      } else {

        tentativas++;

        mostrarErroCodigo(
          resultado.mensagem ||
          'Código incorreto. Tentativas restantes: ' +
          (MAX_TENTATIVAS - tentativas) + '.'
        );

        digitos.forEach((d) => {
          d.value = '';
        });

        digitos[0].focus();
      }
    });

    // ---------------------------------------------------------------
    // REENVIAR CÓDIGO
    // ---------------------------------------------------------------
    btnReenviar.addEventListener('click', async () => {

      try {
        await enviarCodigoPorEmail(emailAtual);
      } catch (err) {
        alert(err.message || 'Não foi possível reenviar o código.');
        return;
      }

      limparCodigo();
      iniciarEsperaReenvio();
    });

    // ---------------------------------------------------------------
    // TROCAR E-MAIL
    // ---------------------------------------------------------------
    btnTrocarEmail.addEventListener('click', () => {
      clearInterval(timerReenvio);

      tokenRedefinicao = null;
      tentativas = 0;

      mostrarEtapa('email');

      document.getElementById('resetEmail').focus();
    });

    // ---------------------------------------------------------------
    // ETAPA 3: REDEFINIR SENHA
    // ---------------------------------------------------------------
    formSenha.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!tokenRedefinicao) {
        mostrarEtapa('email');
        alert('Sua verificação expirou. Solicite um novo código.');
        return;
      }

      const novaSenha = document.getElementById('novaSenha').value;
      const confirmarNovaSenha = document.getElementById('confirmarNovaSenha').value;

      if (novaSenha.length < 8) {
        alert('A senha deve ter pelo menos 8 caracteres.');
        return;
      }

      if (novaSenha !== confirmarNovaSenha) {
        alert('As senhas não coincidem. Verifique e tente novamente.');
        return;
      }

      try {
        const r = await postJson(API_REDEFINIR_SENHA, {
          email: emailAtual,
          token: tokenRedefinicao,
          novaSenha
        });

        if (!r.ok) {
          alert(
            (r.corpo && r.corpo.mensagem) ||
            'Não foi possível redefinir a senha. Tente novamente.'
          );
          return;
        }

        tokenRedefinicao = null;

        alert('Senha redefinida com sucesso! Faça login com sua nova senha.');

        window.location.href = '../pages/login.html';

      } catch (err) {
        alert('Não foi possível conectar ao servidor. Tente novamente em instantes.');
      }
    });

  }

});
