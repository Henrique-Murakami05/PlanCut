document.addEventListener('DOMContentLoaded', () => {

  // ---------------------------------------------------------------------
  // CADASTRO
  // ---------------------------------------------------------------------
  const formCadastro = document.getElementById('formCadastro');
  if (formCadastro) {
    formCadastro.addEventListener('submit', (e) => {
      e.preventDefault();
      const usuario = document.getElementById('cadastroUsuario').value.trim();
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

      alert('Cadastro realizado com sucesso! Faça login para continuar.');
      window.location.href = 'pages/login.html';
    });
  }

  // ---------------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------------
  const formLogin = document.getElementById('formLogin');
  if (formLogin) {
    formLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      window.location.href = '../pages/main.html';
    });
  }

  // ---------------------------------------------------------------------
  // REDEFINIÇÃO DE SENHA
  // ---------------------------------------------------------------------
  const formRedefinirSenha = document.getElementById('formRedefinirSenha');
  if (formRedefinirSenha) {
    formRedefinirSenha.addEventListener('submit', (e) => {
      e.preventDefault();
      const novaSenha = document.getElementById('novaSenha').value;
      const confirmarNovaSenha = document.getElementById('confirmarNovaSenha').value;

      if (novaSenha !== confirmarNovaSenha) {
        alert('As senhas não coincidem. Verifique e tente novamente.');
        return;
      }

      alert('Senha redefinida com sucesso! Faça login com sua nova senha.');
      window.location.href = '../pages/login.html';
    });
  }

});
