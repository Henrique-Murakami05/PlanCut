
document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------------
  // CONFIGURAÇÃO DO BACKEND
  // ---------------------------------------------------------------------
  const API_CADASTRO = '/api/auth/cadastro';
  const API_LOGIN = '/api/auth/login';

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

    const API_VERIFICAR_EMAIL = '/api/senha/verificar-email';
    const API_REDEFINIR_SENHA = '/api/senha/redefinir';

    const etapaEmail = document.getElementById('etapaEmail');
    const etapaSenha = document.getElementById('etapaSenha');

    const formSenha = document.getElementById('formRedefinirSenha');

    let emailAtual = '';

    // Alterna entre as duas etapas.
    function mostrarEtapa(nome) {
      etapaEmail.hidden = nome !== 'email';
      etapaSenha.hidden = nome !== 'senha';
    }

    // ETAPA 1: VERIFICAR E-MAIL
    formEmailReset.addEventListener('submit', async (e) => {
      e.preventDefault();

      emailAtual = document.getElementById('resetEmail').value.trim().toLowerCase();

      if (!emailAtual) {
        alert('Informe seu e-mail.');
        return;
      }

      try {
        const r = await postJson(API_VERIFICAR_EMAIL, {
          email: emailAtual
        });

        if (!r.ok) {
          alert((r.corpo && r.corpo.mensagem) || 'E-mail não encontrado.');
          return;
        }

        mostrarEtapa('senha');
        document.getElementById('novaSenha').focus();

      } catch (err) {
        alert('Não foi possível conectar ao servidor. Tente novamente.');
      }
    });

    // ETAPA 2: REDEFINIR SENHA
    formSenha.addEventListener('submit', async (e) => {
      e.preventDefault();

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
          novaSenha
        });

        if (!r.ok) {
          alert((r.corpo && r.corpo.mensagem) || 'Não foi possível redefinir a senha.');
          return;
        }

        alert('Senha redefinida com sucesso! Faça login com sua nova senha.');

        window.location.href = '../pages/login.html';

      } catch (err) {
        alert('Não foi possível conectar ao servidor. Tente novamente.');
      }
    });

  }


});
