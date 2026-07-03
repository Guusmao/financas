import { createClient } from '@supabase/supabase-js';

const storageKey = "felip-financas-web-v1";

const config = {
  categories: ["Salário", "Mercado", "Internet", "Moradia", "Educação", "Transporte", "Faculdade", "Seguro", "TIM", "Lazer", "Saúde", "Reserva", "Outros"],
  payments: ["PIX", "Débito", "Crédito", "Dinheiro", "Transferência"],
};

const seed = {
  entries: [
    { date: "2026-07-05", type: "Entrada", category: "Salário", description: "Salário Mensal", payment: "PIX", amount: 3000, paid: true, note: "" },
    { date: "2026-07-06", type: "Saída", category: "Mercado", description: "Assaí", payment: "Débito", amount: 350, paid: true, note: "" },
    { date: "2026-07-07", type: "Saída", category: "Internet", description: "Brisanet", payment: "PIX", amount: 60, paid: true, note: "" },
  ],
  bills: [
    { name: "Internet", category: "Moradia", amount: 60, dueDay: 10, recurrence: "Mensal", active: true },
    { name: "Faculdade", category: "Educação", amount: 356, dueDay: 5, recurrence: "Mensal", active: true },
    { name: "Seguro Carro", category: "Transporte", amount: 174, dueDay: 15, recurrence: "Mensal", active: true },
  ],
  goals: [
    { name: "Reserva de emergência", target: 1000, saved: 0 },
  ],
  reserve: [],
};

// Supabase Client Setup
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isConfigured = supabaseUrl && supabaseAnonKey && supabaseUrl !== "your_supabase_project_url";

let supabase = null;
if (isConfigured) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// App State
let state = {
  entries: [],
  bills: [],
  goals: [],
  reserve: [],
};
let user = null;
let selectedMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(date) {
  if (!date) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultDateForInput() {
  const today = todayIso();
  if (today.startsWith(selectedMonth)) {
    return today;
  }
  return `${selectedMonth}-01`;
}

function fillSelect(select, options) {
  select.innerHTML = options.map((item) => `<option>${item}</option>`).join("");
}

function initForms() {
  document.querySelectorAll('select[name="category"]').forEach((select) => fillSelect(select, config.categories));
  document.querySelectorAll('select[name="payment"]').forEach((select) => fillSelect(select, config.payments));
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    input.value = getDefaultDateForInput();
  });
}

function totals() {
  // Filtra lançamentos do mês selecionado
  const monthlyEntries = state.entries.filter((entry) => entry.paid && entry.date.startsWith(selectedMonth));
  const entradas = monthlyEntries.filter((entry) => entry.type === "Entrada").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const saidas = monthlyEntries.filter((entry) => entry.type === "Saída").reduce((sum, entry) => sum + Number(entry.amount), 0);
  
  // Reserva do mês: lançamentos de Reserva + movimentos de reserva do mês
  const reservaLancamentosMes = monthlyEntries.filter((entry) => entry.type === "Reserva").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const reservaMovimentosMes = state.reserve.filter((item) => item.date.startsWith(selectedMonth)).reduce((sum, item) => sum + (item.type === "Entrada" ? Number(item.amount) : -Number(item.amount)), 0);
  const reservaMes = reservaLancamentosMes + reservaMovimentosMes;
  
  // Reserva acumulada (todos os tempos)
  const allPaidEntries = state.entries.filter((entry) => entry.paid);
  const reservaLancamentosAcumulado = allPaidEntries.filter((entry) => entry.type === "Reserva").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const reservaMovimentosAcumulado = state.reserve.reduce((sum, item) => sum + (item.type === "Entrada" ? Number(item.amount) : -Number(item.amount)), 0);
  const reservaAcumulada = reservaLancamentosAcumulado + reservaMovimentosAcumulado;

  return { 
    entradas, 
    saidas, 
    reserva: reservaAcumulada, // total acumulado na reserva
    reservaMes, // total movimentado na reserva neste mês
    saldo: entradas - saidas - reservaMes 
  };
}

function renderDashboard() {
  const total = totals();
  document.querySelector("#totalEntradas").textContent = money(total.entradas);
  document.querySelector("#totalSaidas").textContent = money(total.saidas);
  document.querySelector("#totalReserva").textContent = money(total.reserva);
  document.querySelector("#saldoAtual").textContent = money(total.saldo);
  document.querySelector("#todayLabel").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  // Contas fixas pagas/pendentes baseadas apenas no mês selecionado
  const monthlyPaidEntries = state.entries.filter((entry) => entry.paid && entry.date.startsWith(selectedMonth));
  const paidCategories = new Set(monthlyPaidEntries.map((entry) => entry.category));
  const paidDescriptions = new Set(monthlyPaidEntries.map((entry) => entry.description));
  
  const bills = state.bills.filter((bill) => bill.active);
  document.querySelector("#contasStatus").textContent = `${bills.length} ativas`;
  document.querySelector("#dashboardContas").innerHTML = bills.map((bill) => {
    const paid = paidCategories.has(bill.name) || paidCategories.has(bill.category) || paidDescriptions.has(bill.name);
    return `<div class="list-row">
      <div><strong>${bill.name}</strong><small>${bill.category} · vence dia ${bill.dueDay}</small></div>
      <div><span class="amount">${money(bill.amount)}</span><span class="status ${paid ? "ok" : "warn"}">${paid ? "Pago" : "Pendente"}</span></div>
    </div>`;
  }).join("") || emptyRow("Nenhuma conta fixa");

  // Gastos do mês selecionado
  const gastos = state.entries.filter((entry) => entry.type === "Saída" && entry.date.startsWith(selectedMonth)).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  document.querySelector("#gastosStatus").textContent = `${gastos.length} recentes`;
  document.querySelector("#dashboardGastos").innerHTML = gastos.map((entry) => `<div class="list-row">
    <div><strong>${entry.description}</strong><small>${dateLabel(entry.date)} · ${entry.category} · ${entry.payment}</small></div>
    <span class="amount">${money(entry.amount)}</span>
  </div>`).join("") || emptyRow("Nenhum gasto lançado");

  document.querySelector("#metasStatus").textContent = `${state.goals.length} metas`;
  document.querySelector("#dashboardMetas").innerHTML = state.goals.map(goalCard).join("") || emptyRow("Nenhuma meta cadastrada");

  document.querySelector("#dashboardReserva").textContent = money(total.reserva);
  const reserveMonth = state.reserve.filter((item) => item.date.startsWith(selectedMonth));
  document.querySelector("#reservaStatus").textContent = `${reserveMonth.length} movimentos`;
  document.querySelector("#dashboardReservaMovimentos").innerHTML = reserveMonth.slice(-4).reverse().map((item) => `<div class="list-row">
    <div><strong>${dateLabel(item.date)}</strong><small>${item.note || item.type}</small></div>
    <span class="amount">${item.type === "Saída" ? "-" : ""}${money(item.amount)}</span>
  </div>`).join("") || emptyRow("Sem movimentos");

  const max = Math.max(total.entradas, total.saidas, total.reservaMes, 1);
  document.querySelector("#barEntradas").style.width = `${(total.entradas / max) * 100}%`;
  document.querySelector("#barSaidas").style.width = `${(total.saidas / max) * 100}%`;
  document.querySelector("#barReserva").style.width = `${(total.reservaMes / max) * 100}%`;
}

function emptyRow(text) {
  return `<div class="list-row"><div><strong>${text}</strong><small></small></div></div>`;
}

function goalCard(goal) {
  const target = Number(goal.target || 0);
  const saved = Number(goal.saved || 0);
  const percent = target ? Math.min((saved / target) * 100, 100) : 0;
  return `<div class="data-card">
    <div>
      <strong>${goal.name}</strong>
      <small>${money(saved)} de ${money(target)} · falta ${money(Math.max(target - saved, 0))}</small>
      <div class="progress"><i style="width:${percent}%"></i></div>
    </div>
    <button class="row-action" data-delete-goal="${goal.id}" type="button">Excluir</button>
  </div>`;
}

function renderEntries() {
  // Filtra lançamentos exibidos na tabela de lançamentos por mês ativo
  const rows = state.entries.filter((entry) => entry.date.startsWith(selectedMonth)).slice().sort((a, b) => b.date.localeCompare(a.date)).map((entry) => `<tr>
    <td>${dateLabel(entry.date)}</td>
    <td>${entry.type}</td>
    <td>${entry.category}</td>
    <td>${entry.description}</td>
    <td>${entry.payment}</td>
    <td>${money(entry.amount)}</td>
    <td>${entry.paid ? "☑" : "☐"}</td>
    <td><button class="row-action" data-delete-entry="${entry.id}" type="button">Excluir</button></td>
  </tr>`);
  document.querySelector("#lancamentosTable").innerHTML = rows.join("");
}

function renderBills() {
  document.querySelector("#contasList").innerHTML = state.bills.map((bill) => `<div class="data-card">
    <div><strong>${bill.name}</strong><small>${bill.category} · ${money(bill.amount)} · dia ${bill.dueDay} · ${bill.recurrence} · ${bill.active ? "Ativa" : "Inativa"}</small></div>
    <button class="row-action" data-delete-bill="${bill.id}" type="button">Excluir</button>
  </div>`).join("");
}

// Goals and Reserve logic
function renderGoals() {
  document.querySelector("#metasList").innerHTML = state.goals.map(goalCard).join("");
}

function renderReserve() {
  // Filtra movimentações de reserva por mês ativo
  document.querySelector("#reservaTable").innerHTML = state.reserve.filter((item) => item.date.startsWith(selectedMonth)).slice().sort((a, b) => b.date.localeCompare(a.date)).map((item) => `<tr>
    <td>${dateLabel(item.date)}</td>
    <td>${money(item.amount)}</td>
    <td>${item.type}</td>
    <td>${item.note || ""}</td>
    <td><button class="row-action" data-delete-reserve="${item.id}" type="button">Excluir</button></td>
  </tr>`).join("");
}

function render() {
  renderDashboard();
  renderEntries();
  renderBills();
  renderGoals();
  renderReserve();
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// Database Loading
async function loadData() {
  if (!user || !supabase) return;
  try {
    const [entriesRes, billsRes, goalsRes, reserveRes] = await Promise.all([
      supabase.from('entries').select('*').order('date', { ascending: false }),
      supabase.from('bills').select('*').order('due_day', { ascending: true }),
      supabase.from('goals').select('*').order('name', { ascending: true }),
      supabase.from('reserve').select('*').order('date', { ascending: false })
    ]);

    if (entriesRes.error) throw entriesRes.error;
    if (billsRes.error) throw billsRes.error;
    if (goalsRes.error) throw goalsRes.error;
    if (reserveRes.error) throw reserveRes.error;

    state.entries = (entriesRes.data || []).map(e => ({ ...e, amount: Number(e.amount) }));
    state.bills = (billsRes.data || []).map(b => ({
      id: b.id,
      name: b.name,
      category: b.category,
      amount: Number(b.amount),
      dueDay: b.due_day,
      recurrence: b.recurrence,
      active: b.active
    }));
    state.goals = (goalsRes.data || []).map(g => ({ ...g, target: Number(g.target), saved: Number(g.saved) }));
    state.reserve = (reserveRes.data || []).map(r => ({ ...r, amount: Number(r.amount) }));

    render();
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
    alert("Erro ao carregar dados do Supabase. Verifique o console.");
  }
}

// Month Selector Initialization
function initMonthSelector() {
  const selector = document.querySelector("#monthSelector");
  if (!selector) return;

  const options = [];
  const currentDate = new Date();
  
  // Gera opções de 12 meses atrás a 12 meses no futuro
  for (let i = -12; i <= 12; i++) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
    
    // Evita timezone shifts gerando a string localmente
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const value = `${year}-${month}`;
    
    const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
    
    options.push({ value, label: capitalizedLabel });
  }

  selector.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join("");
  selector.value = selectedMonth;

  selector.addEventListener("change", (e) => {
    selectedMonth = e.target.value;
    updateMonthLabels();
    initForms(); // Atualiza data padrão dos formulários
    render();
  });
}

function updateMonthLabels() {
  const sidebarMonth = document.querySelector("#sidebarMonth");
  const historyMonthLabel = document.querySelector("#historyMonthLabel");
  
  // Cria data segura localmente
  const [y, m] = selectedMonth.split("-").map(Number);
  const date = new Date(y, m - 1, 2);
  
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
  
  if (sidebarMonth) sidebarMonth.textContent = capitalizedLabel;
  if (historyMonthLabel) historyMonthLabel.textContent = capitalizedLabel.split(" de ")[0];
}

// Auth Management
async function checkAuth() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  const authScreen = document.querySelector("#auth-screen");
  const appShell = document.querySelector(".app-shell");
  const authError = document.querySelector("#auth-error");

  if (session) {
    user = session.user;
    authScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
    authError.classList.add("hidden");
    
    // Inicializar o seletor de meses uma única vez
    if (!document.querySelector("#monthSelector").children.length) {
      initMonthSelector();
      updateMonthLabels();
    }

    await loadData();
  } else {
    user = null;
    authScreen.classList.remove("hidden");
    appShell.classList.add("hidden");
  }
}

// Navigation Tabs
document.querySelectorAll(".nav-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab, .view").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}`).classList.add("active");
  });
});

// Authentication Setup
let isSignUpMode = false;
const authForm = document.querySelector("#auth-form");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const authSubmitBtn = document.querySelector("#auth-submit-btn");
const authToggleBtn = document.querySelector("#auth-toggle-btn");
const authSwitchText = document.querySelector("#auth-switch-text");
const authSubtitle = document.querySelector("#auth-subtitle");
const authError = document.querySelector("#auth-error");
const logoutBtn = document.querySelector("#logoutBtn");

if (!isConfigured) {
  authError.innerHTML = `<strong>Configuração necessária!</strong><br>Por favor, crie o arquivo <code>.env</code> com as chaves <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>. Veja <code>.env.example</code>.`;
  authError.classList.remove("hidden");
  authSubmitBtn.disabled = true;
}

authToggleBtn.addEventListener("click", () => {
  isSignUpMode = !isSignUpMode;
  authError.classList.add("hidden");
  authForm.reset();
  if (isSignUpMode) {
    authSubtitle.textContent = "Crie uma conta para gerenciar suas finanças";
    authSubmitBtn.textContent = "Criar conta";
    authSwitchText.textContent = "Já tem uma conta?";
    authToggleBtn.textContent = "Entrar";
  } else {
    authSubtitle.textContent = "Entre na sua conta para sincronizar seus dados";
    authSubmitBtn.textContent = "Entrar";
    authSwitchText.textContent = "Ainda não tem conta?";
    authToggleBtn.textContent = "Criar conta";
  }
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return;
  authError.classList.add("hidden");
  authSubmitBtn.disabled = true;
  
  const email = authEmail.value.trim();
  const password = authPassword.value;
  
  let result;
  if (isSignUpMode) {
    result = await supabase.auth.signUp({ email, password });
  } else {
    result = await supabase.auth.signInWithPassword({ email, password });
  }
  
  authSubmitBtn.disabled = false;
  
  if (result.error) {
    authError.textContent = result.error.message;
    authError.classList.remove("hidden");
  } else {
    if (isSignUpMode) {
      alert("Conta criada! Verifique seu e-mail para confirmação se necessário.");
      isSignUpMode = false;
      authSubtitle.textContent = "Entre na sua conta para sincronizar seus dados";
      authSubmitBtn.textContent = "Entrar";
      authSwitchText.textContent = "Ainda não tem conta?";
      authToggleBtn.textContent = "Criar conta";
      authForm.reset();
    } else {
      await checkAuth();
    }
  }
});

logoutBtn.addEventListener("click", async () => {
  if (supabase && confirm("Tem certeza que deseja sair?")) {
    await supabase.auth.signOut();
    await checkAuth();
  }
});

// Form Submissions
document.querySelector("#lancamentoForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;
  
  const data = formData(event.currentTarget);
  const entry = {
    user_id: user.id,
    date: data.date,
    type: data.type,
    category: data.category,
    description: data.description,
    payment: data.payment,
    amount: Number(data.amount),
    paid: event.currentTarget.paid.checked,
    note: data.note,
  };
  
  const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  
  const { data: inserted, error } = await supabase.from('entries').insert(entry).select();
  submitBtn.disabled = false;

  if (error) {
    alert("Erro ao salvar lançamento: " + error.message);
    return;
  }

  if (inserted && inserted.length > 0) {
    state.entries.push({ ...inserted[0], amount: Number(inserted[0].amount) });
    event.currentTarget.reset();
    initForms();
    render();
  }
});

document.querySelector("#contaForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;

  const data = formData(event.currentTarget);
  const bill = {
    user_id: user.id,
    name: data.name,
    category: data.category,
    amount: Number(data.amount),
    due_day: Number(data.dueDay),
    recurrence: data.recurrence,
    active: event.currentTarget.active.checked,
  };
  
  const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const { data: inserted, error } = await supabase.from('bills').insert(bill).select();
  submitBtn.disabled = false;

  if (error) {
    alert("Erro ao salvar conta: " + error.message);
    return;
  }

  if (inserted && inserted.length > 0) {
    const newBill = inserted[0];
    state.bills.push({
      id: newBill.id,
      name: newBill.name,
      category: newBill.category,
      amount: Number(newBill.amount),
      dueDay: newBill.due_day,
      recurrence: newBill.recurrence,
      active: newBill.active
    });
    event.currentTarget.reset();
    initForms();
    render();
  }
});

document.querySelector("#metaForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;

  const data = formData(event.currentTarget);
  const goal = {
    user_id: user.id,
    name: data.name,
    target: Number(data.target),
    saved: Number(data.saved)
  };

  const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const { data: inserted, error } = await supabase.from('goals').insert(goal).select();
  submitBtn.disabled = false;

  if (error) {
    alert("Erro ao salvar meta: " + error.message);
    return;
  }

  if (inserted && inserted.length > 0) {
    state.goals.push({ ...inserted[0], target: Number(inserted[0].target), saved: Number(inserted[0].saved) });
    event.currentTarget.reset();
    render();
  }
});

document.querySelector("#reservaForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;

  const data = formData(event.currentTarget);
  const reserve = {
    user_id: user.id,
    date: data.date,
    amount: Number(data.amount),
    type: data.type,
    note: data.note
  };

  const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const { data: inserted, error } = await supabase.from('reserve').insert(reserve).select();
  submitBtn.disabled = false;

  if (error) {
    alert("Erro ao salvar reserva: " + error.message);
    return;
  }

  if (inserted && inserted.length > 0) {
    state.reserve.push({ ...inserted[0], amount: Number(inserted[0].amount) });
    event.currentTarget.reset();
    initForms();
    render();
  }
});

// Delete Actions
document.body.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || !supabase || !user) return;
  
  const maps = [
    { key: "deleteEntry", table: "entries", stateKey: "entries" },
    { key: "deleteBill", table: "bills", stateKey: "bills" },
    { key: "deleteGoal", table: "goals", stateKey: "goals" },
    { key: "deleteReserve", table: "reserve", stateKey: "reserve" },
  ];
  
  for (const map of maps) {
    const id = button.dataset[map.key];
    if (id) {
      if (!confirm("Tem certeza que deseja excluir este item?")) return;
      button.disabled = true;
      const { error } = await supabase.from(map.table).delete().eq('id', id);
      if (!error) {
        state[map.stateKey] = state[map.stateKey].filter((item) => item.id !== id);
        render();
      } else {
        alert("Erro ao excluir: " + error.message);
        button.disabled = false;
      }
    }
  }
});

// Data Export / Import / Reset
document.querySelector("#exportData").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "financas-dados.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#importData").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file || !supabase || !user) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!confirm("A importação substituirá todos os seus dados atuais no banco. Deseja continuar?")) return;

    // Clear existing
    await Promise.all([
      supabase.from('entries').delete().eq('user_id', user.id),
      supabase.from('bills').delete().eq('user_id', user.id),
      supabase.from('goals').delete().eq('user_id', user.id),
      supabase.from('reserve').delete().eq('user_id', user.id)
    ]);

    // Map and insert
    const entries = (imported.entries || []).map(e => ({
      user_id: user.id,
      date: e.date,
      type: e.type,
      category: e.category,
      description: e.description,
      payment: e.payment,
      amount: Number(e.amount),
      paid: e.paid,
      note: e.note
    }));

    const bills = (imported.bills || []).map(b => ({
      user_id: user.id,
      name: b.name,
      category: b.category,
      amount: Number(b.amount),
      due_day: Number(b.dueDay || b.due_day),
      recurrence: b.recurrence,
      active: b.active
    }));

    const goals = (imported.goals || []).map(g => ({
      user_id: user.id,
      name: g.name,
      target: Number(g.target),
      saved: Number(g.saved)
    }));

    const reserve = (imported.reserve || []).map(r => ({
      user_id: user.id,
      date: r.date,
      amount: Number(r.amount),
      type: r.type,
      note: r.note
    }));

    await Promise.all([
      entries.length > 0 ? supabase.from('entries').insert(entries) : Promise.resolve(),
      bills.length > 0 ? supabase.from('bills').insert(bills) : Promise.resolve(),
      goals.length > 0 ? supabase.from('goals').insert(goals) : Promise.resolve(),
      reserve.length > 0 ? supabase.from('reserve').insert(reserve) : Promise.resolve()
    ]);

    await loadData();
    event.target.value = "";
  } catch (err) {
    console.error(err);
    alert("Erro ao importar dados. Verifique o console.");
  }
});

document.querySelector("#resetData").addEventListener("click", async () => {
  if (!supabase || !user) return;
  if (!confirm("Tem certeza que deseja apagar todos os dados e restaurar o exemplo?")) return;
  try {
    // Delete all entries for current user in Supabase
    await Promise.all([
      supabase.from('entries').delete().eq('user_id', user.id),
      supabase.from('bills').delete().eq('user_id', user.id),
      supabase.from('goals').delete().eq('user_id', user.id),
      supabase.from('reserve').delete().eq('user_id', user.id)
    ]);

    // Insert seed data
    const entries = seed.entries.map(e => ({
      user_id: user.id,
      date: e.date,
      type: e.type,
      category: e.category,
      description: e.description,
      payment: e.payment,
      amount: e.amount,
      paid: e.paid,
      note: e.note
    }));

    const bills = seed.bills.map(b => ({
      user_id: user.id,
      name: b.name,
      category: b.category,
      amount: b.amount,
      due_day: b.dueDay,
      recurrence: b.recurrence,
      active: b.active
    }));

    const goals = seed.goals.map(g => ({
      user_id: user.id,
      name: g.name,
      target: g.target,
      saved: g.saved
    }));

    await Promise.all([
      entries.length > 0 ? supabase.from('entries').insert(entries) : Promise.resolve(),
      bills.length > 0 ? supabase.from('bills').insert(bills) : Promise.resolve(),
      goals.length > 0 ? supabase.from('goals').insert(goals) : Promise.resolve()
    ]);

    await loadData();
  } catch (err) {
    console.error(err);
    alert("Erro ao restaurar exemplo.");
  }
});

// App Initialization
if (isConfigured) {
  supabase.auth.onAuthStateChange((event, session) => {
    checkAuth();
  });
  
  // Executar checkAuth na inicialização
  checkAuth();
}

initForms();
render();
