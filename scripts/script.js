document.addEventListener('DOMContentLoaded', async () => {

  // ---------------------------------------------------------------------
  // VERIFICAÇÃO DE AUTENTICAÇÃO
  // ---------------------------------------------------------------------
  const API_BASE = '/api';

  // Verifica se o usuário está autenticado ao abrir a página
  async function verificarAutenticacao() {
    try {
      const resposta = await fetch(`${API_BASE}/auth/me`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!resposta.ok) {
        window.location.replace('login.html');
        return false;
      }

      return true;

    } catch (erro) {
      console.error('Erro ao verificar autenticação:', erro);
      window.location.replace('login.html');
      return false;
    }
  }

  // Verifica a sessão antes de inicializar o restante da página.
  const autenticado = await verificarAutenticacao();

  if (!autenticado) return;

  // ---------------------------------------------------------------------
  // HELPERS DE DATA
  // ---------------------------------------------------------------------
  const pad2 = (n) => String(n).padStart(2, '0');

  // Converte um objeto Date para a chave 'YYYY-MM-DD' usada no objeto appointments
  function dateKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  // Converte uma chave 'YYYY-MM-DD' de volta para um objeto Date (meio-dia local, evita bugs de fuso)
  function keyToDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function startOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function formatLongDate(key) {
    return keyToDate(key).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function formatShortDate(key) {
    return keyToDate(key).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatCurrency(value) {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  }

  function isSameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  const today = new Date();
  const todayKey = dateKey(today);

  // ---------------------------------------------------------------------
  // ESTADO DA APLICAÇÃO (em memória)
  // ---------------------------------------------------------------------
  let userSettings = {
    name: 'Usuário',
    fontScale: 1
};

  let categories = [];

  // appointments é indexado pela data completa ('YYYY-MM-DD'), sem limite de dias,
  // e cada horário pode ter mais de um serviço (services: [...]).
  let appointments = {};

  let clients = [];

  // Gastos do mês (Financeiro) e produtos adquiridos (estoque/reposição)
  let expenses = [];
  let products = [];

  // ---------------------------------------------------------------------
  // API (BANCO DE DADOS)
  // Nada é guardado no navegador: tudo é lido e gravado no servidor.
  // Ajuste a BASE e os caminhos conforme o seu backend. Contrato esperado:
  //   GET    /api/perfil                  PUT    /api/perfil
  //   GET    /api/categorias              POST   /api/categorias         PUT/DELETE /api/categorias/:id
  //   GET    /api/clientes                POST   /api/clientes           PUT/DELETE /api/clientes/:id
  //   GET    /api/agendamentos            POST   /api/agendamentos       PUT/DELETE /api/agendamentos/:id
  //   GET    /api/gastos                  POST   /api/gastos             DELETE     /api/gastos/:id
  //   GET    /api/produtos                POST   /api/produtos           DELETE     /api/produtos/:id
  // Cada item vem com "id". Agendamentos têm "date" ('YYYY-MM-DD') além dos
  // campos time, clientName, clientPhone, services[], status, registeredLate, registeredOn.
  // POST/PUT devolvem o item salvo (com id).
  // ---------------------------------------------------------------------
  


  async function api(method, path, body) {
    const resp = await fetch(API_BASE + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (resp.status === 401) {
      window.location.href = '../pages/login.html';
      throw new Error('Não autenticado');
    }
    if (!resp.ok) {
      let msg = '';
      try { msg = (await resp.json()).mensagem || ''; } catch (e) { /* sem corpo */ }
      throw new Error(msg || `Erro ${resp.status}`);
    }
    if (resp.status === 204) return null;
    try { return await resp.json(); } catch (e) { return null; }
  }

  function showApiError(err) {
    alert(`Não foi possível concluir a operação: ${err.message || 'falha de conexão com o servidor.'}`);
  }

  function groupAppointments(list) {
    const map = {};
    (list || []).forEach(a => {
      const { date, ...rest } = a;
      (map[date] = map[date] || []).push(rest);
    });
    Object.values(map).forEach(l => l.sort((a, b) => a.time.localeCompare(b.time)));
    return map;
  }

  async function loadAppointments() {
    appointments = groupAppointments(await api('GET', '/agendamentos'));
  }

  // Carrega tudo do servidor e redesenha a tela
  async function loadAll() {
    try {
      const [perfil, cats, cls, aps, gs, ps] = await Promise.all([
        api('GET', '/perfil'), api('GET', '/categorias'), api('GET', '/clientes'),
        api('GET', '/agendamentos'), api('GET', '/gastos'), api('GET', '/produtos')
      ]);
      if (perfil) {
        userSettings = {
          name: perfil.name || userSettings.name,
          fontScale: perfil.fontScale ?? userSettings.fontScale
        };
      }
      categories = cats || [];
      clients = cls || [];
      appointments = groupAppointments(aps);
      expenses = gs || [];
      products = ps || [];
    } catch (err) {
      showApiError(err);
    }
    renderUserProfile();
    applyFontScale(userSettings.fontScale);
    renderCategories();
    renderCalendar();
    renderClients();
    renderFinance();
  }

  function savePerfil() {
    return api('PUT', '/perfil', userSettings).catch(showApiError);
  }

  // Mês/ano atualmente exibido no calendário
  let viewDate = new Date(today.getFullYear(), today.getMonth(), 1);

  // ---------------------------------------------------------------------
  // ELEMENTOS
  // ---------------------------------------------------------------------
  const calendarGrid = document.getElementById('calendarGrid');
  const calendarMonthLabel = document.getElementById('calendarMonthLabel');
  const btnPrevMonth = document.getElementById('btnPrevMonth');
  const btnNextMonth = document.getElementById('btnNextMonth');
  const categoryList = document.getElementById('categoryList');
  const pageTitle = document.getElementById('pageTitle');
  const navItems = document.querySelectorAll('.nav-item');

  const deleteModal = document.getElementById('deleteModal');
  const categoriaNomeEl = document.getElementById('categoriaNome');
  const confirmInput = document.getElementById('confirmInput');
  const btnCancelModal = document.getElementById('btnCancelModal');
  const btnConfirmDelete = document.getElementById('btnConfirmDelete');

  const categoryModal = document.getElementById('categoryModal');
  const categoryModalTitle = document.getElementById('categoryModalTitle');
  const formCategoria = document.getElementById('formCategoria');
  const btnNovaCategoria = document.getElementById('btnNovaCategoria');
  const btnCancelCategoria = document.getElementById('btnCancelCategoria');
  const btnExcluirCategoria = document.getElementById('btnExcluirCategoria');
  const catNome = document.getElementById('catNome');
  const catPreco = document.getElementById('catPreco');
  const catIcone = document.getElementById('catIcone');

  let editingCategoryName = null; // nome original da categoria em edição (null = criando nova)

  const dayModal = document.getElementById('dayModal');
  const dayModalDia = document.getElementById('dayModalDia');
  const dayAppointmentsList = document.getElementById('dayAppointmentsList');
  const dayEmpty = document.getElementById('dayEmpty');
  const btnFecharDia = document.getElementById('btnFecharDia');
  const btnAddNesseDia = document.getElementById('btnAddNesseDia');

  const appointmentModal = document.getElementById('appointmentModal');
  const appointmentModalTitle = document.getElementById('appointmentModalTitle');
  const formAppointment = document.getElementById('formAppointment');
  const apData = document.getElementById('apData');
  const apHora = document.getElementById('apHora');

  // Máscara HH:MM: digita só os números e os ":" entram sozinhos
  apHora.addEventListener('input', () => {
    let d = apHora.value.replace(/\D/g, '').slice(0, 4);
    if (d.length === 1 && d > '2') d = '0' + d;                 // "9"  -> "09"
    if (d.length >= 2 && Number(d.slice(0, 2)) > 23) d = '23' + d.slice(2); // limita a hora a 23
    if (d.length === 3 && d[2] > '5') d = d.slice(0, 2) + '0' + d[2];      // "17" + "7" -> "17:07"
    if (d.length === 4 && Number(d.slice(2)) > 59) d = d.slice(0, 2) + '59';   // limita os minutos a 59
    apHora.value = d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d;
  });
  const apClienteNome = document.getElementById('apClienteNome');
  const apClienteTelefone = document.getElementById('apClienteTelefone');
  const apServicoChips = document.getElementById('apServicoChips');
  const apStatus = document.getElementById('apStatus');
  const apRetroativoAviso = document.getElementById('apRetroativoAviso');
  const btnCancelAppointment = document.getElementById('btnCancelAppointment');
  const btnDeleteAppointment = document.getElementById('btnDeleteAppointment');
  const btnNovoHorario = document.getElementById('btnNovoHorario');

  const formCliente = document.getElementById('formCliente');
  const clienteNome = document.getElementById('clienteNome');
  const clienteTelefone = document.getElementById('clienteTelefone');
  const clientList = document.getElementById('clientList');
  const clientEmpty = document.getElementById('clientEmpty');

  const clientEditModal = document.getElementById('clientEditModal');
  const formEditCliente = document.getElementById('formEditCliente');
  const editClienteNome = document.getElementById('editClienteNome');
  const editClienteTelefone = document.getElementById('editClienteTelefone');
  const btnCancelEditCliente = document.getElementById('btnCancelEditCliente');

  const clientDeleteModal = document.getElementById('clientDeleteModal');
  const clientDeleteNomeEl = document.getElementById('clientDeleteNome');
  const btnCancelClientDelete = document.getElementById('btnCancelClientDelete');
  const btnConfirmClientDelete = document.getElementById('btnConfirmClientDelete');

  const clientSuggestions = document.getElementById('clientSuggestions');

  // ---------------------------------------------------------------------
  // ELEMENTOS: PAINEL DE CONFIGURAÇÕES DO USUÁRIO
  // ---------------------------------------------------------------------
  const btnAbrirConfiguracoes = document.getElementById('btnAbrirConfiguracoes');
  const settingsModal = document.getElementById('settingsModal');
  const btnFecharConfiguracoes = document.getElementById('btnFecharConfiguracoes');
  const userDisplayName = document.getElementById('userDisplayName');
  const userAvatar = document.getElementById('userAvatar');
  const settingsAvatarPreview = document.getElementById('settingsAvatarPreview');
  
  const formSettingsNome = document.getElementById('formSettingsNome');
  const settingsNome = document.getElementById('settingsNome');
  const btnFontDiminuir = document.getElementById('btnFontDiminuir');
  const btnFontAumentar = document.getElementById('btnFontAumentar');
  const fontScaleLabel = document.getElementById('fontScaleLabel');
  const settingsReduzirAnimacoes = document.getElementById('settingsReduzirAnimacoes');

  let editingClientIndex = null;
  let deletingClientIndex = null;

  const saldoDiaEl = document.getElementById('saldoDia');
  const saldoSemanaEl = document.getElementById('saldoSemana');
  const saldoMesEl = document.getElementById('saldoMes');
  const saldoAnoEl = document.getElementById('saldoAno');

  const atendimentoFiltroData = document.getElementById('atendimentoFiltroData');
  const atendimentoFiltroMes = document.getElementById('atendimentoFiltroMes');
  const atendimentoFiltroOrdem = document.getElementById('atendimentoFiltroOrdem');
  const btnLimparFiltroAtendimento = document.getElementById('btnLimparFiltroAtendimento');
  const atendimentoFiltroList = document.getElementById('atendimentoFiltroList');
  const atendimentoFiltroEmpty = document.getElementById('atendimentoFiltroEmpty');
  const atendimentoFiltroCount = document.getElementById('atendimentoFiltroCount');
  const atendimentoFiltroTotal = document.getElementById('atendimentoFiltroTotal');

  const resumoReceitaEl = document.getElementById('resumoReceita');
  const resumoDespesasEl = document.getElementById('resumoDespesas');
  const resumoProdutosEl = document.getElementById('resumoProdutos');
  const resumoSaldoEl = document.getElementById('resumoSaldo');
  const resumoSaldoBox = document.querySelector('.finance-summary-saldo');
  const resumoMesTitulo = document.getElementById('resumoMesTitulo');

  const formGasto = document.getElementById('formGasto');
  const gastoDescricao = document.getElementById('gastoDescricao');
  const gastoValor = document.getElementById('gastoValor');
  const gastoData = document.getElementById('gastoData');
  let pickerGastoData = null;
  let pickerProdutoData = null;
  const expenseList = document.getElementById('expenseList');
  const expenseEmpty = document.getElementById('expenseEmpty');
  const expenseTotalEl = document.getElementById('expenseTotal');
  const btnToggleFormGasto = document.getElementById('btnToggleFormGasto');

  const formProduto = document.getElementById('formProduto');
  const produtoNome = document.getElementById('produtoNome');
  const produtoQuantidade = document.getElementById('produtoQuantidade');
  const produtoValor = document.getElementById('produtoValor');
  const produtoData = document.getElementById('produtoData');
  const productList = document.getElementById('productList');
  const productEmpty = document.getElementById('productEmpty');
  const productTotalEl = document.getElementById('productTotal');
  const btnToggleFormProduto = document.getElementById('btnToggleFormProduto');

  let currentDayModal = null;      // chave 'YYYY-MM-DD' do dia atualmente aberto no modal de dia
  let editingAppointmentId = null; // id do horário em edição (null = criando novo)
  let editingAppointmentDay = null;
  let categoriaParaExcluir = '';

  // ---------------------------------------------------------------------
  // PREÇOS / SERVIÇOS
  // ---------------------------------------------------------------------
  function priceOfServices(serviceNames) {
    return (serviceNames || []).reduce((sum, name) => {
      const cat = categories.find(c => c.name === name);
      return sum + (cat ? cat.price : 0);
    }, 0);
  }

  // ---------------------------------------------------------------------
  // RENDER: CALENDÁRIO (mês completo, sem limite de 30 dias)
  // ---------------------------------------------------------------------
  function renderCalendar() {
    calendarGrid.querySelectorAll('.calendar-day').forEach(el => el.remove());

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    calendarMonthLabel.innerText = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay(); // 0 = domingo
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    // Dias cujos horários ainda precisam ser "encaixados" visualmente
    // (só conseguimos medir a altura real depois que a célula estiver no DOM).
    const pendingFits = [];

    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - startOffset + 1;
      let cellDate;
      let inCurrentMonth = true;

      if (dayNumber < 1) {
        cellDate = new Date(year, month - 1, daysInPrevMonth + dayNumber);
        inCurrentMonth = false;
      } else if (dayNumber > daysInMonth) {
        cellDate = new Date(year, month + 1, dayNumber - daysInMonth);
        inCurrentMonth = false;
      } else {
        cellDate = new Date(year, month, dayNumber);
      }

      const key = dateKey(cellDate);

      const dayDiv = document.createElement('div');
      dayDiv.className = 'calendar-day';
      if (!inCurrentMonth) dayDiv.classList.add('other-month');
      if (isSameDate(cellDate, today)) dayDiv.classList.add('today');

      dayDiv.innerHTML = `<span>${cellDate.getDate()}</span>`;
      dayDiv.addEventListener('click', () => openDayModal(key));

      // Os horários aparecem apenas como indicação visual dentro do dia;
      // não são clicáveis individualmente — só o dia inteiro abre a lista de horários.
      const dayEvents = (appointments[key] || []).slice().sort((a, b) => a.time.localeCompare(b.time));

      if (dayEvents.length) {
        const eventsBox = document.createElement('div');
        eventsBox.className = 'calendar-day-events';
        dayDiv.appendChild(eventsBox);

        // Precisamos que o dia já esteja no DOM (com altura real) para medir
        // corretamente quantos horários cabem — por isso isso é feito depois
        // do appendChild no calendarGrid, logo abaixo.
        pendingFits.push({ eventsBox, events: dayEvents });
      }

      calendarGrid.appendChild(dayDiv);
    }

    // Agora que todas as células já estão no DOM (com dimensões reais),
    // encaixamos os horários de cada dia sem nunca "cortar" um item pela metade:
    // em vez de um número fixo de badges, medimos o espaço disponível de cada
    // dia e mostramos o máximo que cabe de forma limpa, resumindo o restante
    // num indicador "+N" sempre visível por inteiro.
    pendingFits.forEach(({ eventsBox, events }) => fitDayEvents(eventsBox, events));
    pendingFits.length = 0;
  }

  // Cria o elemento visual de um horário (chip com hora + serviço no desktop,
  // vira um pontinho colorido no mobile via CSS).
  function createEventBadge(evt) {
    const badge = document.createElement('span');
    badge.className = `badge-event ${evt.status}`;
    badge.title = `${evt.time} - ${evt.services.join(' + ')}`;
    badge.innerHTML = `
      <span class="badge-event-time">${evt.time}</span>
      <span class="badge-event-service">${evt.services.join(' + ')}</span>
    `;
    return badge;
  }

  // Preenche o container de horários de um dia com quantos itens realmente
  // couberem no espaço disponível (medido em pixels reais), e resume o
  // restante num badge "+N mais" que fica sempre inteiro, nunca cortado.
  function fitDayEvents(eventsBox, events) {
    eventsBox.innerHTML = '';
    events.forEach(evt => eventsBox.appendChild(createEventBadge(evt)));

    // Cabe tudo? Ótimo, não precisamos resumir nada.
    if (eventsBox.scrollHeight <= eventsBox.clientHeight + 1) return;

    // Não cabe tudo: reservamos o indicador "+N mais" e vamos removendo
    // horários do fim da lista até o que sobrar + o indicador caberem
    // por inteiro, sem cortes.
    const more = document.createElement('span');
    more.className = 'badge-more';
    eventsBox.appendChild(more);

    const chips = Array.from(eventsBox.querySelectorAll('.badge-event'));
    let hiddenCount = 0;
    while (chips.length - hiddenCount > 0 && eventsBox.scrollHeight > eventsBox.clientHeight + 1) {
      chips[chips.length - 1 - hiddenCount].remove();
      hiddenCount++;
    }

    if (hiddenCount > 0) {
      more.innerText = `+${hiddenCount} mais`;
      eventsBox.classList.add('has-more');
    } else {
      // Segurança: se por algum motivo nada precisou ser escondido, remove o indicador vazio.
      more.remove();
    }
  }

  btnPrevMonth.addEventListener('click', () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    renderCalendar();
  });

  btnNextMonth.addEventListener('click', () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    renderCalendar();
  });

  // ---------------------------------------------------------------------
  // RENDER: CATEGORIAS
  // ---------------------------------------------------------------------
  function renderCategories() {
    categoryList.innerHTML = '';
    categories.forEach(cat => {
      const li = document.createElement('li');
      li.className = 'category-item';
      li.innerHTML = `
        <span>${renderCategoryIcon(cat.icon)}${cat.name}</span>
        <strong>${formatCurrency(cat.price)}</strong>
      `;
      li.addEventListener('click', () => abrirModalEdicaoCategoria(cat.name));
      categoryList.appendChild(li);
    });
  }

  // Monta os "chips" de serviço (checkboxes estilizados) usados no modal de horário.
  // Permite selecionar mais de um serviço (ex: Corte + Barba) no mesmo horário.
  function refreshServiceChips(selectedServices = []) {
    apServicoChips.innerHTML = '';

    if (!categories.length) {
      apServicoChips.innerHTML = '<span class="service-chips-empty">Cadastre uma categoria de serviço primeiro.</span>';
      return;
    }

    categories.forEach(cat => {
      const label = document.createElement('label');
      label.className = 'service-chip';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = cat.name;
      input.checked = selectedServices.includes(cat.name);

      const span = document.createElement('span');
      span.innerHTML = `${renderCategoryIcon(cat.icon)}${cat.name}`;

      label.appendChild(input);
      label.appendChild(span);
      apServicoChips.appendChild(label);
    });
  }

  function getSelectedServices() {
    return Array.from(apServicoChips.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
  }

  // ---------------------------------------------------------------------
  // RENDER: CLIENTES
  // ---------------------------------------------------------------------
  function renderClients() {
    clientList.innerHTML = '';
    clientEmpty.style.display = clients.length ? 'none' : 'block';

    clients.forEach((client, index) => {
      const li = document.createElement('li');
      li.className = 'category-item client-item';
      li.innerHTML = `
        <span class="client-info">
          <strong>👤 ${client.name}</strong>
          <span class="client-phone">📞 ${client.phone}</span>
        </span>
      `;

      const actions = document.createElement('span');
      actions.className = 'client-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-inline-edit';
      editBtn.innerText = '✎';
      editBtn.title = 'Editar cliente';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirModalEdicaoCliente(index);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-inline-remove';
      removeBtn.innerText = '✕';
      removeBtn.title = 'Remover cliente';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirModalExclusaoCliente(index);
      });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);
      li.appendChild(actions);
      clientList.appendChild(li);
    });

  }

  // ---------------------------------------------------------------------
  // MODAL: EDITAR CLIENTE
  // ---------------------------------------------------------------------
  function abrirModalEdicaoCliente(index) {
    const client = clients[index];
    if (!client) return;
    editingClientIndex = index;
    editClienteNome.value = client.name;
    editClienteTelefone.value = client.phone;
    clientEditModal.style.display = 'flex';
    editClienteNome.focus();
  }

  btnCancelEditCliente.addEventListener('click', () => {
    clientEditModal.style.display = 'none';
  });

  formEditCliente.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (editingClientIndex === null) return;

    const nome = editClienteNome.value.trim();
    const telefone = editClienteTelefone.value.trim();
    if (!nome || !telefone) return;

    try {
      const salvo = await api('PUT', `/clientes/${clients[editingClientIndex].id}`, { name: nome, phone: telefone });
      clients[editingClientIndex] = salvo || { ...clients[editingClientIndex], name: nome, phone: telefone };
    } catch (err) { showApiError(err); return; }
    editingClientIndex = null;
    clientEditModal.style.display = 'none';
    renderClients();
  });

  // ---------------------------------------------------------------------
  // MODAL: CONFIRMAR EXCLUSÃO DE CLIENTE
  // ---------------------------------------------------------------------
  function abrirModalExclusaoCliente(index) {
    const client = clients[index];
    if (!client) return;
    deletingClientIndex = index;
    clientDeleteNomeEl.innerText = client.name;
    clientDeleteModal.style.display = 'flex';
  }

  btnCancelClientDelete.addEventListener('click', () => {
    clientDeleteModal.style.display = 'none';
    deletingClientIndex = null;
  });

  btnConfirmClientDelete.addEventListener('click', async () => {
    if (deletingClientIndex === null) return;
    try {
      await api('DELETE', `/clientes/${clients[deletingClientIndex].id}`);
    } catch (err) { showApiError(err); return; }
    clients.splice(deletingClientIndex, 1);
    deletingClientIndex = null;
    clientDeleteModal.style.display = 'none';
    renderClients();
  });

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------------------------------------------------------------------
  // RENDER: FINANCEIRO (saldo diário, semanal, mensal e anual)
  // ---------------------------------------------------------------------
  function computeBalance(startDate, endDate) {
    let total = 0;
    Object.keys(appointments).forEach(key => {
      const d = keyToDate(key);
      if (d < startDate || d > endDate) return;
      appointments[key].forEach(evt => {
        if (evt.status === 'finalizado') {
          total += priceOfServices(evt.services);
        }
      });
    });
    return total;
  }

  function renderFinance() {
    const weekStart = startOfWeek(today);
    const weekEnd = addDays(weekStart, 6);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const yearEnd = new Date(today.getFullYear(), 11, 31);

    saldoDiaEl.innerText = formatCurrency(computeBalance(today, today));
    saldoSemanaEl.innerText = formatCurrency(computeBalance(weekStart, weekEnd));
    saldoMesEl.innerText = formatCurrency(computeBalance(monthStart, monthEnd));
    saldoAnoEl.innerText = formatCurrency(computeBalance(yearStart, yearEnd));

    // Resumo geral do mês: Receita (atendimentos finalizados) - Despesas - Produtos adquiridos
    const receitaMes = computeBalance(monthStart, monthEnd);
    const despesasMes = expenses
      .filter(g => g.date >= dateKey(monthStart) && g.date <= dateKey(monthEnd))
      .reduce((sum, g) => sum + g.value, 0);
    const produtosMes = products
      .filter(p => p.date >= dateKey(monthStart) && p.date <= dateKey(monthEnd))
      .reduce((sum, p) => sum + p.value, 0);
    const saldoMesGeral = receitaMes - despesasMes - produtosMes;

    if (resumoMesTitulo) {
      resumoMesTitulo.innerText = `Resumo de ${today.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
    }
    resumoReceitaEl.innerText = formatCurrency(receitaMes);
    resumoDespesasEl.innerText = formatCurrency(despesasMes);
    resumoProdutosEl.innerText = formatCurrency(produtosMes);
    resumoSaldoEl.innerText = formatCurrency(saldoMesGeral);
    if (resumoSaldoBox) {
      resumoSaldoBox.classList.toggle('is-negative', saldoMesGeral < 0);
    }

    renderExpenses();
    renderProducts();
    renderFinanceAtendimentoSearch();
  }

  // ---------------------------------------------------------------------
  // RENDER: ABA "ATENDIMENTO" (busca por data específica ou por mês)
  // ---------------------------------------------------------------------
  function renderFinanceAtendimentoSearch() {
    if (!atendimentoFiltroList) return;

    const filtroData = atendimentoFiltroData.value; // 'YYYY-MM-DD' ou ''
    const filtroMes = atendimentoFiltroMes.value;   // 'YYYY-MM' ou ''

    atendimentoFiltroList.innerHTML = '';

    if (!filtroData && !filtroMes) {
      atendimentoFiltroEmpty.innerText = 'Selecione uma data ou um mês acima para pesquisar os atendimentos.';
      atendimentoFiltroEmpty.style.display = 'block';
      atendimentoFiltroCount.innerText = '0';
      atendimentoFiltroTotal.innerText = formatCurrency(0);
      return;
    }

    const encontrados = [];
    Object.keys(appointments).forEach(key => {
      const bateData = filtroData ? key === filtroData : key.startsWith(filtroMes);
      if (!bateData) return;
      appointments[key].forEach(evt => encontrados.push({ key, ...evt }));
    });

    // 'desc' = mais recentes primeiro (padrão) | 'asc' = mais antigos primeiro
    const ordemAsc = atendimentoFiltroOrdem && atendimentoFiltroOrdem.value === 'asc';
    encontrados.sort((a, b) => {
      const cmp = `${a.key}${a.time}`.localeCompare(`${b.key}${b.time}`);
      return ordemAsc ? cmp : -cmp;
    });

    atendimentoFiltroEmpty.innerText = 'Nenhum atendimento encontrado para o filtro selecionado.';
    atendimentoFiltroEmpty.style.display = encontrados.length ? 'none' : 'block';

    let total = 0;
    encontrados.forEach(entry => {
      const valor = priceOfServices(entry.services);
      total += valor;
      const li = document.createElement('li');
      li.className = 'category-item';
      li.innerHTML = `
        <span>${formatShortDate(entry.key)} · ${entry.time} · ${entry.clientName || 'Cliente não informado'} · ${entry.services.join(' + ')} <span class="finance-value">${formatCurrency(valor)}</span></span>
        <span class="status-pill status-${entry.status}">${capitalize(entry.status)}</span>
      `;
      atendimentoFiltroList.appendChild(li);
    });

    atendimentoFiltroCount.innerText = String(encontrados.length);
    atendimentoFiltroTotal.innerText = formatCurrency(total);
  }

  // ---------------------------------------------------------------------
  // RENDER: GASTOS DO MÊS
  // ---------------------------------------------------------------------
  function renderExpenses() {
    expenseList.innerHTML = '';
    const ordenados = expenses.slice().sort((a, b) => b.date.localeCompare(a.date));

    expenseEmpty.style.display = ordenados.length ? 'none' : 'block';

    if (expenseTotalEl) {
      const total = ordenados.reduce((sum, g) => sum + g.value, 0);
      expenseTotalEl.innerText = formatCurrency(total);
    }

    ordenados.forEach(gasto => {
      const li = document.createElement('li');
      li.className = 'category-item';
      li.innerHTML = `
        <span class="finance-entry-item">${formatShortDate(gasto.date)} · ${gasto.description}</span>
        <span class="finance-entry-item">
          <strong class="finance-value" style="color: var(--color-danger);">${formatCurrency(gasto.value)}</strong>
          <button type="button" class="finance-entry-remove" data-remove-expense="${gasto.id}" title="Excluir gasto">✕</button>
        </span>
      `;
      expenseList.appendChild(li);
    });
  }

  // ---------------------------------------------------------------------
  // RENDER: PRODUTOS ADQUIRIDOS
  // ---------------------------------------------------------------------
  function renderProducts() {
    productList.innerHTML = '';
    const ordenados = products.slice().sort((a, b) => b.date.localeCompare(a.date));

    productEmpty.style.display = ordenados.length ? 'none' : 'block';

    if (productTotalEl) {
      const total = ordenados.reduce((sum, p) => sum + p.value, 0);
      productTotalEl.innerText = formatCurrency(total);
    }

    ordenados.forEach(produto => {
      const li = document.createElement('li');
      li.className = 'category-item';
      li.innerHTML = `
        <span class="finance-entry-item">${formatShortDate(produto.date)} · ${produto.name} · Qtd: ${produto.quantity}</span>
        <span class="finance-entry-item">
          <strong class="finance-value" style="color: var(--color-danger);">${formatCurrency(produto.value)}</strong>
          <button type="button" class="finance-entry-remove" data-remove-product="${produto.id}" title="Excluir produto">✕</button>
        </span>
      `;
      productList.appendChild(li);
    });
  }

  // ---------------------------------------------------------------------
  // NAVEGAÇÃO ENTRE PÁGINAS
  // ---------------------------------------------------------------------
  const pages = {
    dashboard: document.getElementById('page-dashboard'),
    financeiro: document.getElementById('page-financeiro'),
    atendimento: document.getElementById('page-atendimento'),
    clientes: document.getElementById('page-clientes')
  };

  const pageLabels = {
    dashboard: 'Dashboard · Agenda',
    financeiro: 'Financeiro · Saldo',
    atendimento: 'Atendimento',
    clientes: 'Clientes'
  };

  function goToPage(pageName) {
    Object.keys(pages).forEach(key => {
      pages[key].style.display = key === pageName ? '' : 'none';
    });
    pageTitle.innerText = pageLabels[pageName] || pageName;

    if (pageName === 'clientes') renderClients();
    if (pageName === 'financeiro' || pageName === 'atendimento') renderFinance();
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector('.nav-item.active').classList.remove('active');
      item.classList.add('active');
      const pageName = item.querySelector('a').getAttribute('data-page');
      goToPage(pageName);
    });
  });

  // ---------------------------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
// LOGOUT
// ---------------------------------------------------------------------
document.getElementById('btnLogout').addEventListener('click', async () => {
  const confirmar = confirm('Deseja realmente sair do sistema?');

  if (!confirmar) return;

  try {
    const resposta = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!resposta.ok) {
      throw new Error('Não foi possível encerrar a sessão.');
    }

    // Só redireciona depois que o servidor encerrar a sessão.
    window.location.href = 'login.html';

  } catch (erro) {
    alert('Erro ao sair do sistema. Verifique sua conexão com o servidor e tente novamente.');
    console.error('Erro no logout:', erro);
  }
});

  // ---------------------------------------------------------------------
  // MENU HAMBÚRGUER (celulares até 400px: o menu lateral vira uma gaveta)
  // ---------------------------------------------------------------------
  const btnMenu = document.getElementById('btnMenu');
  const btnFecharMenu = document.getElementById('btnFecharMenu');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const sidebar = document.getElementById('sidebar');
  const menuAberto = () => document.body.classList.contains('menu-open');

  function abrirMenu() {
    document.body.classList.add('menu-open');
    btnMenu.setAttribute('aria-expanded', 'true');
    btnFecharMenu.focus();
  }

  function fecharMenu(devolverFoco) {
    if (!menuAberto()) return;
    document.body.classList.remove('menu-open');
    btnMenu.setAttribute('aria-expanded', 'false');
    if (devolverFoco) btnMenu.focus();
  }

  if (btnMenu && sidebar) {
    btnMenu.addEventListener('click', () => (menuAberto() ? fecharMenu(true) : abrirMenu()));
    btnFecharMenu.addEventListener('click', () => fecharMenu(true));
    drawerBackdrop.addEventListener('click', () => fecharMenu(true));
    // escolher uma página fecha a gaveta
    sidebar.querySelectorAll('.nav-item a').forEach(a => a.addEventListener('click', () => fecharMenu(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fecharMenu(true);
    });
    // se a tela crescer (ex.: girar o celular), a gaveta deixa de existir
    window.matchMedia('(max-width: 400px)').addEventListener('change', () => fecharMenu(false));
  }

  // ---------------------------------------------------------------------
  // MODAL: EXCLUSÃO DE CATEGORIA
  // ---------------------------------------------------------------------
  window.abrirModalExclusao = function (nomeCategoria) {
    categoriaParaExcluir = nomeCategoria;
    categoriaNomeEl.innerText = nomeCategoria;
    confirmInput.value = '';
    deleteModal.style.display = 'flex';
    confirmInput.focus();
  };

  btnCancelModal.addEventListener('click', () => {
    deleteModal.style.display = 'none';
  });

  btnConfirmDelete.addEventListener('click', async () => {
    if (confirmInput.value.trim().toLowerCase() === categoriaParaExcluir.toLowerCase()) {
      const cat = categories.find(c => c.name === categoriaParaExcluir);
      try {
        if (cat) await api('DELETE', `/categorias/${cat.id}`);
      } catch (err) { showApiError(err); return; }
      categories = categories.filter(c => c.name !== categoriaParaExcluir);
      renderCategories();
      deleteModal.style.display = 'none';
    } else {
      alert(`Digite exatamente "${categoriaParaExcluir}" para confirmar a exclusão.`);
    }
  });

  // ---------------------------------------------------------------------
  // MODAL: NOVA CATEGORIA
  // ---------------------------------------------------------------------
  // Os ícones das categorias são emojis digitados pelo usuário.
  function renderCategoryIcon(icon) {
    return `${icon || '•'} `;
  }

  function abrirModalEdicaoCategoria(nomeCategoria) {
    const cat = categories.find(c => c.name === nomeCategoria);
    if (!cat) return;

    editingCategoryName = cat.name;
    categoryModalTitle.innerText = 'Editar categoria';
    catNome.value = cat.name;
    catPreco.value = cat.price;

    catIcone.value = cat.icon || '';

    btnExcluirCategoria.style.display = 'inline-block';
    categoryModal.style.display = 'flex';
    catNome.focus();
  }
  window.abrirModalEdicaoCategoria = abrirModalEdicaoCategoria;

  btnNovaCategoria.addEventListener('click', () => {
    editingCategoryName = null;
    categoryModalTitle.innerText = 'Nova categoria';
    formCategoria.reset();
    btnExcluirCategoria.style.display = 'none';
    categoryModal.style.display = 'flex';
    catNome.focus();
  });

  btnCancelCategoria.addEventListener('click', () => {
    categoryModal.style.display = 'none';
  });

  formCategoria.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = catNome.value.trim();
    const preco = parseFloat(catPreco.value);
    const icone = catIcone.value.trim();

    if (!nome || isNaN(preco) || preco < 0) return;

    const nomeDuplicado = categories.some(c =>
      c.name.toLowerCase() === nome.toLowerCase() &&
      c.name.toLowerCase() !== (editingCategoryName || '').toLowerCase()
    );
    if (nomeDuplicado) {
      alert('Já existe uma categoria com esse nome.');
      return;
    }

    try {
      if (editingCategoryName) {
        const cat = categories.find(c => c.name === editingCategoryName);
        if (cat) {
          const salvo = await api('PUT', `/categorias/${cat.id}`, { name: nome, icon: icone || '⭐', price: preco });
          const nomeAntigo = cat.name;
          Object.assign(cat, salvo || { name: nome, icon: icone || '⭐', price: preco });
          // O servidor atualiza os serviços dos horários já cadastrados; recarrega para refletir
          if (nomeAntigo !== nome) await loadAppointments();
        }
      } else {
        const salva = await api('POST', '/categorias', { name: nome, icon: icone || '⭐', price: preco });
        categories.push(salva || { name: nome, icon: icone || '⭐', price: preco });
      }
    } catch (err) { showApiError(err); return; }

    renderCategories();
    renderCalendar();
    categoryModal.style.display = 'none';
  });

  btnExcluirCategoria.addEventListener('click', () => {
    if (!editingCategoryName) return;
    categoryModal.style.display = 'none';
    abrirModalExclusao(editingCategoryName);
  });

  // ---------------------------------------------------------------------
  // MODAL: HORÁRIOS DO DIA
  // ---------------------------------------------------------------------
  function openDayModal(key) {
    currentDayModal = key;
    dayModalDia.innerText = formatShortDate(key);
    renderDayAppointments(key);
    dayModal.style.display = 'flex';
  }

  function renderDayAppointments(key) {
    dayAppointmentsList.innerHTML = '';
    const list = appointments[key] || [];
    dayEmpty.style.display = list.length ? 'none' : 'block';

    list.forEach(evt => {
      const li = document.createElement('li');
      li.className = `appointment-row status-${evt.status}`;
      li.innerHTML = `
        <span class="appointment-time">${evt.time}</span>
        <span class="appointment-client">
          <strong>${evt.clientName || 'Cliente não informado'}</strong>
          <span class="client-phone">${evt.clientPhone || 'Sem telefone'}</span>
          ${evt.registeredLate ? `<span class="retroactive-tag">Registrado posteriormente (em ${formatShortDate(evt.registeredOn)})</span>` : ''}
        </span>
        <span class="appointment-service">
          <span>${evt.services.join(' + ')}</span>
          <strong>${formatCurrency(priceOfServices(evt.services))}</strong>
        </span>
        <button type="button" class="appointment-chevron" aria-label="Abrir horário">›</button>
      `;
      li.addEventListener('click', () => {
        dayModal.style.display = 'none';
        openAppointmentModal(key, evt.id);
      });
      dayAppointmentsList.appendChild(li);
    });
  }

  btnFecharDia.addEventListener('click', () => {
    dayModal.style.display = 'none';
  });

  btnAddNesseDia.addEventListener('click', () => {
    dayModal.style.display = 'none';
    openAppointmentModal(currentDayModal);
  });

  // ---------------------------------------------------------------------
  // MODAL: NOVO / EDITAR HORÁRIO
  // ---------------------------------------------------------------------
  function openAppointmentModal(key, appointmentId = null) {
    editingAppointmentDay = key;
    editingAppointmentId = appointmentId;

    if (appointmentId) {
      const evt = (appointments[key] || []).find(a => a.id === appointmentId);
      appointmentModalTitle.innerText = 'Editar horário';
      apData.value = key;
      apHora.value = evt.time;
      apClienteNome.value = evt.clientName || '';
      apClienteTelefone.value = evt.clientPhone || '';
      apStatus.value = evt.status;
      refreshServiceChips(evt.services);
      btnDeleteAppointment.style.display = 'inline-block';
    } else {
      appointmentModalTitle.innerText = 'Novo horário';
      formAppointment.reset();
      apData.value = key || todayKey;
      apStatus.value = 'pendente';
      refreshServiceChips([]);
      btnDeleteAppointment.style.display = 'none';
    }

    updateRetroativoAviso();
    appointmentModal.style.display = 'flex';
  }

  function updateRetroativoAviso() {
    if (!apRetroativoAviso) return;
    apRetroativoAviso.style.display = (apData.value && apData.value < todayKey) ? 'block' : 'none';
  }

  apData.addEventListener('change', updateRetroativoAviso);

  // ---------------------------------------------------------------------
  // SUGESTÕES DE CLIENTE (dropdown customizado, estilizado com a paleta do site)
  // ---------------------------------------------------------------------
  let clientSuggestionActiveIndex = -1;

  function fecharClientSuggestions() {
    clientSuggestions.classList.remove('is-open');
    clientSuggestions.innerHTML = '';
    clientSuggestionActiveIndex = -1;
  }

  function selecionarClientSuggestion(client) {
    apClienteNome.value = client.name;
    apClienteTelefone.value = client.phone || '';
    fecharClientSuggestions();
  }

  function renderClientSuggestions(termo) {
    const valor = termo.trim().toLowerCase();
    if (!valor) {
      fecharClientSuggestions();
      return;
    }

    const resultados = clients.filter(c => c.name.toLowerCase().includes(valor));

    if (!resultados.length) {
      fecharClientSuggestions();
      return;
    }

    clientSuggestions.innerHTML = resultados
      .map((c, i) => {
        const idx = c.name.toLowerCase().indexOf(valor);
        const nomeDestacado = idx === -1
          ? c.name
          : `${c.name.slice(0, idx)}<strong>${c.name.slice(idx, idx + valor.length)}</strong>${c.name.slice(idx + valor.length)}`;
        return `<li data-index="${i}"><span>${nomeDestacado}</span>${c.phone ? `<span class="suggestion-phone">${c.phone}</span>` : ''}</li>`;
      })
      .join('');

    clientSuggestions.classList.add('is-open');
    clientSuggestionActiveIndex = -1;

    Array.from(clientSuggestions.children).forEach((li, i) => {
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selecionarClientSuggestion(resultados[i]);
      });
    });

    clientSuggestions.dataset.resultados = JSON.stringify(resultados);
  }

  // Ao digitar, mostra sugestões de clientes já cadastrados e, ao bater
  // exatamente com um nome existente, preenche automaticamente o telefone.
  apClienteNome.addEventListener('input', () => {
    renderClientSuggestions(apClienteNome.value);

    const match = clients.find(c => c.name.toLowerCase() === apClienteNome.value.trim().toLowerCase());
    if (match) {
      apClienteTelefone.value = match.phone;
    }
  });

  apClienteNome.addEventListener('focus', () => {
    if (apClienteNome.value.trim()) renderClientSuggestions(apClienteNome.value);
  });

  apClienteNome.addEventListener('keydown', (e) => {
    const itens = Array.from(clientSuggestions.children);
    if (!itens.length || !clientSuggestions.classList.contains('is-open')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      clientSuggestionActiveIndex = (clientSuggestionActiveIndex + 1) % itens.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      clientSuggestionActiveIndex = (clientSuggestionActiveIndex - 1 + itens.length) % itens.length;
    } else if (e.key === 'Enter') {
      if (clientSuggestionActiveIndex >= 0) {
        e.preventDefault();
        const resultados = JSON.parse(clientSuggestions.dataset.resultados || '[]');
        selecionarClientSuggestion(resultados[clientSuggestionActiveIndex]);
      }
      return;
    } else if (e.key === 'Escape') {
      fecharClientSuggestions();
      return;
    } else {
      return;
    }

    itens.forEach((li, i) => li.classList.toggle('is-active', i === clientSuggestionActiveIndex));
  });

  document.addEventListener('click', (e) => {
    if (e.target !== apClienteNome && !clientSuggestions.contains(e.target)) {
      fecharClientSuggestions();
    }
  });

  btnNovoHorario.addEventListener('click', () => openAppointmentModal(null));

  btnCancelAppointment.addEventListener('click', () => {
    appointmentModal.style.display = 'none';
    fecharClientSuggestions();
  });

  formAppointment.addEventListener('submit', async (e) => {
    e.preventDefault();

    const key = apData.value;
    if (!key) {
      alert('Informe uma data válida.');
      return;
    }

    const services = getSelectedServices();
    if (!services.length) {
      alert('Selecione ao menos um serviço.');
      return;
    }

    // Impede dois agendamentos no mesmo dia e horário (ignora o próprio ao editar)
    const conflito = (appointments[key] || []).find(a =>
      a.time === apHora.value && a.id !== editingAppointmentId
    );
    if (conflito) {
      const quem = conflito.clientName ? ` (${conflito.clientName})` : '';
      alert(`Já existe um agendamento às ${apHora.value} em ${formatShortDate(key)}${quem}. Escolha outro horário.`);
      apHora.focus();
      return;
    }

    const isNew = !editingAppointmentId;
    const existing = editingAppointmentId
      ? (appointments[editingAppointmentDay] || []).find(a => a.id === editingAppointmentId)
      : null;

    const data = {
      time: apHora.value,
      clientName: apClienteNome.value.trim(),
      clientPhone: apClienteTelefone.value.trim(),
      services,
      status: apStatus.value,
      // Marca o horário como "registrado posteriormente" sempre que a data do
      // compromisso for anterior à data atual em que ele está sendo salvo.
      registeredLate: key < todayKey,
      registeredOn: (isNew || !existing || !existing.registeredOn) ? todayKey : existing.registeredOn
    };

    try {
      if (editingAppointmentId) {
        await api('PUT', `/agendamentos/${editingAppointmentId}`, { date: key, ...data });
      } else {
        await api('POST', '/agendamentos', { date: key, ...data });
      }
      await loadAppointments();
    } catch (err) { showApiError(err); return; }

    renderCalendar();
    appointmentModal.style.display = 'none';
  });

  btnDeleteAppointment.addEventListener('click', async () => {
    if (!editingAppointmentId) return;
    if (!confirm('Excluir este horário?')) return;

    try {
      await api('DELETE', `/agendamentos/${editingAppointmentId}`);
      await loadAppointments();
    } catch (err) { showApiError(err); return; }

    renderCalendar();
    appointmentModal.style.display = 'none';
  });

  // ---------------------------------------------------------------------
  // FORM: CLIENTES
  // ---------------------------------------------------------------------
  formCliente.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = clienteNome.value.trim();
    const telefone = clienteTelefone.value.trim();
    if (!nome || !telefone) return;

    try {
      const salvo = await api('POST', '/clientes', { name: nome, phone: telefone });
      clients.push(salvo || { name: nome, phone: telefone });
    } catch (err) { showApiError(err); return; }
    formCliente.reset();
    renderClients();
  });

  // ---------------------------------------------------------------------
  // FORM: GASTOS DO MÊS
  // ---------------------------------------------------------------------
  formGasto.addEventListener('submit', async (e) => {
    e.preventDefault();
    const descricao = gastoDescricao.value.trim();
    const valor = parseFloat(gastoValor.value);
    const data = gastoData.value;
    if (!descricao || isNaN(valor) || valor < 0 || !data) return;

    try {
      const salvo = await api('POST', '/gastos', { description: descricao, value: valor, date: data });
      expenses.push(salvo);
    } catch (err) { showApiError(err); return; }
    formGasto.reset();
    if (pickerGastoData) pickerGastoData.setValue(todayKey, false);
    toggleInlineForm(formGasto, btnToggleFormGasto, false);
    renderFinance();
  });

  expenseList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove-expense]');
    if (!btn) return;
    const id = btn.getAttribute('data-remove-expense');
    try { await api('DELETE', `/gastos/${id}`); } catch (err) { showApiError(err); return; }
    expenses = expenses.filter(g => String(g.id) !== id);
    renderFinance();
  });

  // ---------------------------------------------------------------------
  // FORM: PRODUTOS ADQUIRIDOS
  // ---------------------------------------------------------------------
  formProduto.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = produtoNome.value.trim();
    const quantidade = parseInt(produtoQuantidade.value, 10);
    const valor = parseFloat(produtoValor.value);
    const data = produtoData.value;
    if (!nome || isNaN(quantidade) || quantidade < 1 || isNaN(valor) || valor < 0 || !data) return;

    try {
      const salvo = await api('POST', '/produtos', { name: nome, quantity: quantidade, value: valor, date: data });
      products.push(salvo);
    } catch (err) { showApiError(err); return; }
    formProduto.reset();
    if (pickerProdutoData) pickerProdutoData.setValue(todayKey, false);
    produtoQuantidade.value = 1;
    toggleInlineForm(formProduto, btnToggleFormProduto, false);
    renderFinance();
  });

  productList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove-product]');
    if (!btn) return;
    const id = btn.getAttribute('data-remove-product');
    try { await api('DELETE', `/produtos/${id}`); } catch (err) { showApiError(err); return; }
    products = products.filter(p => String(p.id) !== id);
    renderFinance();
  });

  // ---------------------------------------------------------------------
  // FORMULÁRIOS RECOLHÍVEIS (mostrar/ocultar) DE GASTOS E PRODUTOS
  // ---------------------------------------------------------------------
  function toggleInlineForm(formEl, btnEl, forceState) {
    const shouldOpen = typeof forceState === 'boolean' ? forceState : formEl.hidden;
    formEl.hidden = !shouldOpen;
    if (btnEl) {
      btnEl.classList.toggle('is-open', shouldOpen);
      btnEl.innerText = shouldOpen ? '✕ Cancelar' : btnEl.dataset.labelClosed;
    }
    if (shouldOpen) {
      const firstInput = formEl.querySelector('input');
      if (firstInput) firstInput.focus();
    }
  }

  if (btnToggleFormGasto) {
    btnToggleFormGasto.dataset.labelClosed = btnToggleFormGasto.innerText;
    btnToggleFormGasto.addEventListener('click', () => toggleInlineForm(formGasto, btnToggleFormGasto));
  }

  if (btnToggleFormProduto) {
    btnToggleFormProduto.dataset.labelClosed = btnToggleFormProduto.innerText;
    btnToggleFormProduto.addEventListener('click', () => toggleInlineForm(formProduto, btnToggleFormProduto));
  }

  // ---------------------------------------------------------------------
  // ABAS DA PÁGINA FINANCEIRO (Lançamentos / Atividade de atendimentos)
  // ---------------------------------------------------------------------
  function setupFinanceTabs(tabButtons) {
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => {
          b.classList.toggle('active', b === btn);
          const panel = document.getElementById(b.dataset.target);
          if (panel) panel.hidden = (b !== btn);
        });
      });
    });
  }

  setupFinanceTabs([
    document.getElementById('tabBtnGastos'),
    document.getElementById('tabBtnProdutos')
  ].filter(Boolean));

  // ---------------------------------------------------------------------
  // SELETORES CUSTOMIZADOS DE DATA / MÊS (usados nos filtros da aba "Pesquisar")
  // Guardam o valor num <input type="hidden"> no mesmo formato dos inputs nativos:
  //   modo 'date'  -> 'YYYY-MM-DD'
  //   modo 'month' -> 'YYYY-MM'
  // ---------------------------------------------------------------------
  const PICKER_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const PICKER_MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const PICKER_DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const PICKER_CHEVRON = (dir) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;

  const abertos = new Set(); // garante que só um seletor fique aberto por vez

  // Posiciona o popover dentro da área visível: abre para cima se faltar espaço embaixo,
  // alinha pela direita se passar da tela e, se ainda não couber, rola a página até ele aparecer
  function posicionarPopover(trigger, pop) {
    pop.classList.remove('open-up', 'align-right');

    // a área que rola é o <main>; o espaço útil é o que está visível dentro dele
    const area = (pop.closest('main') || document.documentElement).getBoundingClientRect();
    const limiteTopo = Math.max(area.top, 0);
    const limiteBase = Math.min(area.bottom, window.innerHeight);
    const rect = trigger.getBoundingClientRect();
    const abaixo = limiteBase - rect.bottom;
    const acima = rect.top - limiteTopo;

    if (abaixo < pop.offsetHeight + 16 && acima > abaixo) pop.classList.add('open-up');
    if (pop.getBoundingClientRect().right > window.innerWidth - 8) pop.classList.add('align-right');

    const mostrar = () => pop.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    mostrar();
    // a animação de entrada muda o tamanho do popover: repete o ajuste quando ela termina
    pop.addEventListener('animationend', mostrar, { once: true });
  }

  function createPicker(root, mode, onChange) {
    const hidden = root.querySelector('input[type="hidden"]');
    const trigger = root.querySelector('.picker-trigger');
    const valueEl = root.querySelector('.picker-value');
    const pop = root.querySelector('.picker-popover');
    const placeholder = valueEl.dataset.placeholder;
    let viewYear = 0;
    let viewMonth = 0;

    function parseValue() {
      if (!hidden.value) return null;
      const [y, m, d] = hidden.value.split('-').map(Number);
      return { y, m: m - 1, d: d || 1 };
    }

    function updateDisplay() {
      const v = parseValue();
      valueEl.classList.toggle('is-placeholder', !v);
      if (!v) {
        valueEl.textContent = placeholder;
        return;
      }
      valueEl.textContent = mode === 'date'
        ? `${pad2(v.d)}/${pad2(v.m + 1)}/${v.y}`
        : `${PICKER_MESES[v.m]} de ${v.y}`;
    }

    function render() {
      const hoje = new Date();
      const hojeKey = dateKey(hoje);
      const mesAtualKey = `${hoje.getFullYear()}-${pad2(hoje.getMonth() + 1)}`;
      let corpo = '';
      let titulo = '';
      let rodapeHoje = '';

      if (mode === 'date') {
        titulo = `${PICKER_MESES[viewMonth]} De ${viewYear}`;
        rodapeHoje = 'Hoje';

        const offset = new Date(viewYear, viewMonth, 1).getDay();
        const diasNoMes = new Date(viewYear, viewMonth + 1, 0).getDate();
        const semanas = Math.ceil((offset + diasNoMes) / 7);

        corpo += `<div class="picker-weekdays">${PICKER_DIAS_SEMANA.map(d => `<span>${d}</span>`).join('')}</div>`;
        corpo += '<div class="picker-days">';
        for (let i = 0; i < semanas * 7; i++) {
          const d = new Date(viewYear, viewMonth, 1 - offset + i);
          const key = dateKey(d);
          const cls = ['picker-day'];
          if (d.getMonth() !== viewMonth) cls.push('is-outside');
          if (key === hojeKey) cls.push('is-today');
          if (key === hidden.value) cls.push('is-selected');
          const rotulo = `${d.getDate()} de ${PICKER_MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
          corpo += `<button type="button" class="${cls.join(' ')}" data-value="${key}" aria-label="${rotulo}">${d.getDate()}</button>`;
        }
        corpo += '</div>';
      } else {
        titulo = String(viewYear);
        rodapeHoje = 'Este mês';

        corpo += '<div class="picker-months">';
        PICKER_MESES_CURTOS.forEach((nome, i) => {
          const key = `${viewYear}-${pad2(i + 1)}`;
          const cls = ['picker-month'];
          if (key === mesAtualKey) cls.push('is-today');
          if (key === hidden.value) cls.push('is-selected');
          corpo += `<button type="button" class="${cls.join(' ')}" data-value="${key}" aria-label="${PICKER_MESES[i]} de ${viewYear}">${nome}</button>`;
        });
        corpo += '</div>';
      }

      pop.innerHTML = `
        <div class="picker-head">
          <button type="button" class="picker-nav" data-nav="-1" aria-label="${mode === 'date' ? 'Mês anterior' : 'Ano anterior'}">${PICKER_CHEVRON(-1)}</button>
          <span class="picker-title" aria-live="polite">${titulo}</span>
          <button type="button" class="picker-nav" data-nav="1" aria-label="${mode === 'date' ? 'Próximo mês' : 'Próximo ano'}">${PICKER_CHEVRON(1)}</button>
        </div>
        ${corpo}
        <div class="picker-footer">
          <button type="button" class="picker-action" data-action="clear">Limpar</button>
          <button type="button" class="picker-action" data-action="today">${rodapeHoje}</button>
        </div>
      `;
    }

    function close() {
      pop.hidden = true;
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      abertos.delete(api);
    }

    function open() {
      abertos.forEach(p => p.close());
      const v = parseValue();
      const base = v ? new Date(v.y, v.m, 1) : new Date();
      viewYear = base.getFullYear();
      viewMonth = base.getMonth();
      render();

      pop.hidden = false;
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      abertos.add(api);
      posicionarPopover(trigger, pop);
    }

    function setValue(valor, notificar) {
      hidden.value = valor;
      updateDisplay();
      if (notificar && onChange) onChange(valor);
    }

    function navegar(dir) {
      if (mode === 'date') {
        viewMonth += dir;
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      } else {
        viewYear += dir;
      }
      render();
      // o render recria os botões: devolve o foco para quem usa teclado
      const btn = pop.querySelector(`[data-nav="${dir}"]`);
      if (btn && document.activeElement === document.body) btn.focus();
    }

    trigger.addEventListener('click', () => (pop.hidden ? open() : close()));

    pop.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        navegar(Number(nav.dataset.nav));
        return;
      }

      const escolha = e.target.closest('[data-value]');
      if (escolha) {
        setValue(escolha.dataset.value, true);
        close();
        trigger.focus();
        return;
      }

      const acao = e.target.closest('[data-action]');
      if (!acao) return;

      if (acao.dataset.action === 'clear') {
        setValue('', true);
      } else {
        const hoje = new Date();
        setValue(mode === 'date' ? dateKey(hoje) : `${hoje.getFullYear()}-${pad2(hoje.getMonth() + 1)}`, true);
      }
      close();
      trigger.focus();
    });

    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !pop.hidden) {
        close();
        trigger.focus();
      }
    });

    // Fecha ao clicar fora (pointerdown acontece antes do render, então o alvo ainda está no DOM)
    document.addEventListener('pointerdown', (e) => {
      if (!pop.hidden && !root.contains(e.target)) close();
    });

    const api = { setValue, close };
    updateDisplay();
    return api;
  }

  // Lista suspensa no mesmo visual dos seletores (usada em "Ordenar por horário")
  function createSelect(root, onChange) {
    const hidden = root.querySelector('input[type="hidden"]');
    const trigger = root.querySelector('.picker-trigger');
    const valueEl = root.querySelector('.picker-value');
    const pop = root.querySelector('.picker-popover');
    const opcoes = Array.from(pop.querySelectorAll('.picker-option'));

    function updateDisplay() {
      const atual = opcoes.find(o => o.dataset.value === hidden.value) || opcoes[0];
      valueEl.textContent = atual.textContent.trim();
      opcoes.forEach(o => {
        const ativo = o === atual;
        o.classList.toggle('is-selected', ativo);
        o.setAttribute('aria-selected', String(ativo));
      });
    }

    function close() {
      pop.hidden = true;
      root.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      abertos.delete(api);
    }

    function open() {
      abertos.forEach(p => p.close());
      pop.hidden = false;
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      abertos.add(api);
      posicionarPopover(trigger, pop);
    }

    function setValue(valor, notificar) {
      hidden.value = valor;
      updateDisplay();
      if (notificar && onChange) onChange(valor);
    }

    trigger.addEventListener('click', () => (pop.hidden ? open() : close()));

    pop.addEventListener('click', (e) => {
      const opcao = e.target.closest('.picker-option');
      if (!opcao) return;
      setValue(opcao.dataset.value, true);
      close();
      trigger.focus();
    });

    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !pop.hidden) {
        close();
        trigger.focus();
      }
    });

    document.addEventListener('pointerdown', (e) => {
      if (!pop.hidden && !root.contains(e.target)) close();
    });

    const api = { setValue, close };
    updateDisplay();
    return api;
  }

  // Filtros da página "Atendimento": data específica, mês e ordenação
  const pickerDataEl = document.getElementById('pickerFiltroData');
  const pickerMesEl = document.getElementById('pickerFiltroMes');
  const pickerOrdemEl = document.getElementById('pickerFiltroOrdem');
  let pickerData = null;
  let pickerMes = null;
  let pickerOrdem = null;

  // Estado padrão: data específica = hoje, sem mês, mais recentes primeiro
  function restaurarFiltrosPadrao() {
    if (pickerData) pickerData.setValue(todayKey, false);
    if (pickerMes) pickerMes.setValue('', false);
    if (pickerOrdem) pickerOrdem.setValue('desc', false);
  }

  if (pickerDataEl && pickerMesEl) {
    // Escolher uma data específica ignora (e limpa) o filtro por mês, e vice-versa
    pickerData = createPicker(pickerDataEl, 'date', (valor) => {
      if (valor) pickerMes.setValue('', false);
      renderFinanceAtendimentoSearch();
    });
    pickerMes = createPicker(pickerMesEl, 'month', (valor) => {
      if (valor) pickerData.setValue('', false);
      renderFinanceAtendimentoSearch();
    });
  }

  if (pickerOrdemEl) {
    pickerOrdem = createSelect(pickerOrdemEl, () => renderFinanceAtendimentoSearch());
  }

  // Datas de "Gastos" e "Produtos adquiridos": mesmo seletor de calendário do Atendimento
  // (começam no dia de hoje; o input hidden mantém o mesmo id e o valor AAAA-MM-DD)
  const pickerGastoEl = document.getElementById('pickerGastoData');
  const pickerProdutoEl = document.getElementById('pickerProdutoData');
  if (pickerGastoEl) {
    pickerGastoData = createPicker(pickerGastoEl, 'date');
    pickerGastoData.setValue(todayKey, false);
  }
  if (pickerProdutoEl) {
    pickerProdutoData = createPicker(pickerProdutoEl, 'date');
    pickerProdutoData.setValue(todayKey, false);
  }

  if (btnLimparFiltroAtendimento) {
    // "Limpar filtro" volta ao estado padrão (dia de hoje)
    btnLimparFiltroAtendimento.addEventListener('click', () => {
      restaurarFiltrosPadrao();
      renderFinanceAtendimentoSearch();
    });
  }

  restaurarFiltrosPadrao();
  renderFinanceAtendimentoSearch();

  // ---------------------------------------------------------------------
  // PAINEL DE CONFIGURAÇÕES DO USUÁRIO
  // ---------------------------------------------------------------------
  function getInitials(name) {
    const partes = name.trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  // Atualiza o nome e o avatar com as iniciais do usuário.
  function renderUserProfile() {
    userDisplayName.innerText = userSettings.name;

    const iniciais = getInitials(userSettings.name);

    userAvatar.textContent = iniciais;
    settingsAvatarPreview.textContent = iniciais;
  }

  function applyFontScale(scale) {
    userSettings.fontScale = Math.min(1.3, Math.max(0.85, scale));
    document.documentElement.style.setProperty('--font-scale', userSettings.fontScale);
    fontScaleLabel.innerText = `${Math.round(userSettings.fontScale * 100)}%`;
  }

  function abrirConfiguracoes() {
    settingsNome.value = userSettings.name;
    settingsModal.style.display = 'flex';
  }

  btnAbrirConfiguracoes.addEventListener('click', abrirConfiguracoes);

  btnFecharConfiguracoes.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  formSettingsNome.addEventListener('submit', (e) => {
    e.preventDefault();
    const novoNome = settingsNome.value.trim();
    if (!novoNome) return;
    userSettings.name = novoNome;
    renderUserProfile();
    savePerfil();
  });

  

  btnFontDiminuir.addEventListener('click', () => { applyFontScale(userSettings.fontScale - 0.05); savePerfil(); });
  btnFontAumentar.addEventListener('click', () => { applyFontScale(userSettings.fontScale + 0.05); savePerfil(); });

  settingsReduzirAnimacoes.addEventListener('change', () => {
    document.body.classList.toggle('reduce-motion', settingsReduzirAnimacoes.checked);
  });

  // Inicializa o painel com os valores padrão
  renderUserProfile();
  applyFontScale(userSettings.fontScale);

  // ---------------------------------------------------------------------
  // FECHAR MODAIS CLICANDO NO FUNDO
  // ---------------------------------------------------------------------
  [deleteModal, categoryModal, dayModal, appointmentModal, clientEditModal, clientDeleteModal, settingsModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });

  // ---------------------------------------------------------------------
  // INICIALIZAÇÃO
  // ---------------------------------------------------------------------
  renderCategories();
  renderCalendar();
  loadAll();
});
