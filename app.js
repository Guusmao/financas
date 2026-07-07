import {
  renderMotorista
} from "./motorista.js";

import { createClient } from '@supabase/supabase-js';

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
const viteEnv = import.meta.env || {};
const runtimeConfig = window.__APP_CONFIG__ || {};

const supabaseUrl = viteEnv.VITE_SUPABASE_URL || runtimeConfig.SUPABASE_URL || "";
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY || runtimeConfig.SUPABASE_ANON_KEY || "";
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
  motorista: [],
};

let user = null;
let selectedMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
let showOnlyUnpaidBills = false;
let editingBillId = null;

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTextInput(value, maxLength = 120) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function normalizeAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function encodeInstallmentRecurrence(totalInstallments, startMonth) {
  const total = Math.max(2, Math.min(Number(totalInstallments) || 2, 120));
  return `Parcelado|${total}|${startMonth}`;
}

function parseInstallmentRecurrence(recurrence) {
  if (!String(recurrence || "").startsWith("Parcelado|")) return null;
  const [, totalRaw, startMonthRaw] = String(recurrence).split("|");
  const total = Number(totalRaw);
  const startMonth = String(startMonthRaw || "").slice(0, 7);
  if (!Number.isFinite(total) || total < 2 || !/^\d{4}-\d{2}$/.test(startMonth)) return null;
  return { totalInstallments: Math.floor(total), startMonth };
}

function monthDiff(startMonth, targetMonth) {
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ty, tm] = targetMonth.split("-").map(Number);
  return (ty - sy) * 12 + (tm - sm);
}

function installmentProgressForMonth(recurrence, month) {
  const installment = parseInstallmentRecurrence(recurrence);
  if (!installment) return null;

  const diff = monthDiff(installment.startMonth, month);
  const currentInstallment = diff + 1;
  if (currentInstallment < 1 || currentInstallment > installment.totalInstallments) {
    return {
      ...installment,
      currentInstallment,
      inRange: false,
      finished: currentInstallment > installment.totalInstallments,
    };
  }

  return {
    ...installment,
    currentInstallment,
    inRange: true,
    finished: false,
  };
}

function recurrenceLabel(recurrence, month) {
  const progress = installmentProgressForMonth(recurrence, month);
  if (!progress) return recurrence;
  if (progress.finished) return `Parcelado · concluída (${progress.totalInstallments}/${progress.totalInstallments})`;
  if (!progress.inRange) return `Parcelado · fora do período`;
  return `Parcelado · ${progress.currentInstallment}/${progress.totalInstallments}`;
}

function buildDueDateForMonth(month, dueDay) {
  const [year, monthNumber] = month.split("-").map(Number);
  const maxDay = new Date(year, monthNumber, 0).getDate();
  const day = Math.min(Math.max(Number(dueDay) || 1, 1), maxDay);
  return `${month}-${String(day).padStart(2, "0")}`;
}

function billDescriptionForMonth(bill, month) {
  const progress = installmentProgressForMonth(bill.recurrence, month);
  if (progress && progress.inRange) {
    return `${bill.name} (${progress.currentInstallment}/${progress.totalInstallments})`;
  }
  return bill.name;
}

function billEntryForMonth(bill, month) {
  const description = billDescriptionForMonth(bill, month);
  return state.entries.find((entry) => (
    entry.type === "Saída"
    && entry.date.startsWith(month)
    && entry.description === description
  )) || null;
}

let isSyncingInstallments = false;

async function ensureInstallmentsForMonth() {
  if (!supabase || !user || isSyncingInstallments) return;

  const pendingEntries = [];
  for (const bill of state.bills) {
    if (!bill.active) continue;
    const progress = installmentProgressForMonth(bill.recurrence, selectedMonth);
    if (!progress || !progress.inRange) continue;

    const description = `${bill.name} (${progress.currentInstallment}/${progress.totalInstallments})`;
    const exists = state.entries.some((entry) => (
      entry.type === "Saída"
      && entry.date.startsWith(selectedMonth)
      && entry.description === description
    ));
    if (exists) continue;

    pendingEntries.push({
      user_id: user.id,
      date: buildDueDateForMonth(selectedMonth, bill.dueDay),
      type: "Saída",
      category: bill.category,
      description,
      payment: "PIX",
      amount: Number(bill.amount),
      paid: false,
      note: "Parcela automática de conta fixa",
    });
  }

  if (!pendingEntries.length) return;

  isSyncingInstallments = true;
  const { data, error } = await supabase.from("entries").insert(pendingEntries).select();
  isSyncingInstallments = false;
  if (error) {
    console.error("Erro ao gerar parcelas automáticas:", error);
    return;
  }

  if (Array.isArray(data)) {
    state.entries.push(...data.map((entry) => ({ ...entry, amount: Number(entry.amount) })));
  }
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

  const contaForm = document.querySelector("#contaForm");
  if (contaForm && !contaForm.dataset.installmentsBound) {
    const recurrenceSelect = contaForm.querySelector('select[name="recurrence"]');
    const installmentsInput = contaForm.querySelector('input[name="installments"]');

    const toggleInstallments = () => {
      const isInstallment = recurrenceSelect.value === "Parcelado";
      installmentsInput.hidden = !isInstallment;
      installmentsInput.required = isInstallment;
    };

    recurrenceSelect.addEventListener("change", toggleInstallments);
    toggleInstallments();
    contaForm.dataset.installmentsBound = "1";
  }
}

function setBillFormMode(isEditing) {
  const submitBtn = document.querySelector("#contaForm button[type=\"submit\"]");
  if (submitBtn) {
    submitBtn.textContent = isEditing ? "Salvar edição" : "Adicionar";
  }
}

function resetBillForm() {
  editingBillId = null;
  const contaForm = document.querySelector("#contaForm");
  if (contaForm) {
    contaForm.reset();
  }
  setBillFormMode(false);
  initForms();
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
  const toggleBtn = document.querySelector("#toggleUnpaidBills");
  if (toggleBtn) {
    toggleBtn.textContent = `Somente não pagas: ${showOnlyUnpaidBills ? "On" : "Off"}`;
    toggleBtn.classList.toggle("active", showOnlyUnpaidBills);
  }

  const billsWithStatus = bills.map((bill) => {
    const monthEntry = billEntryForMonth(bill, selectedMonth);
    const paid = monthEntry ? !!monthEntry.paid : (paidCategories.has(bill.name) || paidCategories.has(bill.category) || paidDescriptions.has(bill.name));
    return { bill, paid };
  });

  const visibleBills = showOnlyUnpaidBills ? billsWithStatus.filter((item) => !item.paid) : billsWithStatus;
  document.querySelector("#contasStatus").textContent = `${visibleBills.length}/${bills.length}`;
  document.querySelector("#dashboardContas").innerHTML = visibleBills.map(({ bill, paid }) => {
    const recurrenceText = recurrenceLabel(bill.recurrence, selectedMonth);
    return `<div class="list-row">
      <div><strong>${escapeHtml(bill.name)}</strong><small>${escapeHtml(bill.category)} · vence dia ${bill.dueDay} · ${escapeHtml(recurrenceText)}</small></div>
      <div><span class="amount">${money(bill.amount)}</span><span class="status ${paid ? "ok" : "unpaid"}">${paid ? "Pago" : "Não pago"}</span></div>
    </div>`;
  }).join("") || emptyRow(showOnlyUnpaidBills ? "Nenhuma conta não paga" : "Nenhuma conta fixa");

  // Gastos do mês selecionado
  const gastos = state.entries.filter((entry) => entry.type === "Saída" && entry.date.startsWith(selectedMonth)).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  document.querySelector("#gastosStatus").textContent = `${gastos.length} recentes`;
  document.querySelector("#dashboardGastos").innerHTML = gastos.map((entry) => `<div class="list-row">
    <div><strong>${escapeHtml(entry.description)}</strong><small>${dateLabel(entry.date)} · ${escapeHtml(entry.category)} · ${escapeHtml(entry.payment)}</small></div>
    <span class="amount">${money(entry.amount)}</span>
  </div>`).join("") || emptyRow("Nenhum gasto lançado");

  document.querySelector("#metasStatus").textContent = `${state.goals.length} metas`;
  document.querySelector("#dashboardMetas").innerHTML = state.goals.map(goalCard).join("") || emptyRow("Nenhuma meta cadastrada");

  document.querySelector("#dashboardReserva").textContent = money(total.reserva);
  const reserveMonth = state.reserve.filter((item) => item.date.startsWith(selectedMonth));
  document.querySelector("#reservaStatus").textContent = `${reserveMonth.length} movimentos`;
  document.querySelector("#dashboardReservaMovimentos").innerHTML = reserveMonth.slice(-4).reverse().map((item) => `<div class="list-row">
    <div><strong>${dateLabel(item.date)}</strong><small>${escapeHtml(item.note || item.type)}</small></div>
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
      <strong>${escapeHtml(goal.name)}</strong>
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
    <td>${escapeHtml(entry.type)}</td>
    <td>${escapeHtml(entry.category)}</td>
    <td>${escapeHtml(entry.description)}</td>
    <td>${escapeHtml(entry.payment)}</td>
    <td>${money(entry.amount)}</td>
    <td>${entry.paid ? "☑" : "☐"}</td>
    <td><button class="row-action" data-delete-entry="${entry.id}" type="button">Excluir</button></td>
  </tr>`);
  document.querySelector("#lancamentosTable").innerHTML = rows.join("");
}

function renderBills() {
  const orderedBills = [...state.bills].reverse();
  document.querySelector("#contasList").innerHTML = orderedBills.map((bill) => {
    const monthEntry = billEntryForMonth(bill, selectedMonth);
    const paid = monthEntry ? !!monthEntry.paid : false;
    return `<div class="data-card">
      <div>
        <strong>${escapeHtml(bill.name)}</strong>
        <small>${escapeHtml(bill.category)} · ${money(bill.amount)} · dia ${bill.dueDay} · ${escapeHtml(recurrenceLabel(bill.recurrence, selectedMonth))} · ${bill.active ? "Ativa" : "Inativa"}</small>
      </div>
      <div class="bill-actions">
        <span class="status ${paid ? "ok" : "unpaid"}">${paid ? "Pago" : "Não pago"}</span>
        <button class="row-action neutral" data-edit-bill="${bill.id}" type="button">Editar</button>
        <button class="row-action ${paid ? "neutral" : "pay"}" data-toggle-bill-paid="${bill.id}" type="button">${paid ? "Desmarcar" : "Marcar pago"}</button>
        <button class="row-action" data-delete-bill="${bill.id}" type="button">Excluir</button>
      </div>
    </div>`;
  }).join("");
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
    <td>${escapeHtml(item.type)}</td>
    <td>${escapeHtml(item.note || "")}</td>
    <td><button class="row-action" data-delete-reserve="${item.id}" type="button">Excluir</button></td>
  </tr>`).join("");
}

function switchTab(tabId) {
  const targetView = document.getElementById(tabId);
  if (!targetView) return;

  document.querySelectorAll(".nav-tab, .view").forEach((item) => item.classList.remove("active"));
  targetView.classList.add("active");
  const targetButton = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (targetButton) targetButton.classList.add("active");
}

function render() {
  renderDashboard();
  renderEntries();
  renderBills();
  renderGoals();
  renderReserve();
  renderMotorista(state.motorista, selectedMonth, money, dateLabel);
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// Database Loading
async function loadData() {
  if (!user || !supabase) return;
  try {
    const [
      entriesRes,
      billsRes,
      goalsRes,
      reserveRes,
      motoristaRes
    ] = await Promise.all([
      supabase.from("entries").select("*").order("date", { ascending: false }),
      supabase.from("bills").select("*").order("due_day", { ascending: true }),
      supabase.from("goals").select("*").order("name", { ascending: true }),
      supabase.from("reserve").select("*").order("date", { ascending: false }),
      supabase.from("motorista_registros").select("*").order("data", { ascending: false })
    ]);

    if (entriesRes.error) throw entriesRes.error;
    if (billsRes.error) throw billsRes.error;
    if (goalsRes.error) throw goalsRes.error;
    if (reserveRes.error) throw reserveRes.error;
    if (motoristaRes.error) throw motoristaRes.error;

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
    state.motorista = (motoristaRes.data || []).map((item) => ({
      ...item,
      uber: Number(item.uber),
      noventa_nove: Number(item.noventa_nove),
      quilometragem: Number(item.quilometragem),
      preco_gasolina: Number(item.preco_gasolina),
      consumo_veiculo: Number(item.consumo_veiculo)
    }));

    await ensureInstallmentsForMonth();

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

  selector.addEventListener("change", async (e) => {
    selectedMonth = e.target.value;
    updateMonthLabels();
    initForms(); // Atualiza data padrão dos formulários
    await ensureInstallmentsForMonth();
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

// Navigation Tabs (inclui abas dinâmicas)
document.querySelector(".nav-tabs").addEventListener("click", (event) => {
  const button = event.target.closest(".nav-tab");
  if (!button) return;
  switchTab(button.dataset.tab);
});

document.querySelector("#toggleUnpaidBills")?.addEventListener("click", () => {
  showOnlyUnpaidBills = !showOnlyUnpaidBills;
  renderDashboard();
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
  authError.innerHTML = `<strong>Configuração necessária!</strong><br>Use <code>.env</code> (Vite) ou <code>config.js</code> (Go Live) com URL e chave anon do Supabase. Veja <code>.env.example</code> e <code>config.example.js</code>.`;
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
  const allowedTypes = ["Entrada", "Saída", "Reserva"];
  const type = allowedTypes.includes(data.type) ? data.type : "Saída";
  const category = config.categories.includes(data.category) ? data.category : "Outros";
  const payment = config.payments.includes(data.payment) ? data.payment : "PIX";
  const entry = {
    user_id: user.id,
    date: data.date,
    type,
    category,
    description: normalizeTextInput(data.description, 120),
    payment,
    amount: Number(data.amount),
    paid: event.currentTarget.paid.checked,
    note: normalizeTextInput(data.note, 240),
  };
  
  const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  
  const { data: inserted, error } = await supabase.from('entries').insert(entry).select();
  submitBtn.disabled = false;

  if (error) {
    alert("Erro ao salvar lançamento: " + error.message);
    return;
  }

  event.currentTarget.reset();
  initForms();
  await loadData();
});

document.querySelector("#contaForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;

  const data = formData(event.currentTarget);
  const recurrenceOptions = ["Mensal", "Anual", "Única"];
  const recurrence = data.recurrence === "Parcelado"
    ? encodeInstallmentRecurrence(Number(data.installments), selectedMonth)
    : (recurrenceOptions.includes(data.recurrence) ? data.recurrence : "Mensal");
  const bill = {
    user_id: user.id,
    name: normalizeTextInput(data.name, 80),
    category: config.categories.includes(data.category) ? data.category : "Outros",
    amount: Number(data.amount),
    due_day: Number(data.dueDay),
    recurrence,
    active: event.currentTarget.active.checked,
  };
  
  const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const query = editingBillId
    ? supabase.from('bills').update(bill).eq('id', editingBillId).eq('user_id', user.id)
    : supabase.from('bills').insert(bill).select();
  const { error } = await query;
  submitBtn.disabled = false;

  if (error) {
    alert(`Erro ao ${editingBillId ? "atualizar" : "salvar"} conta: ` + error.message);
    return;
  }

  resetBillForm();
  await loadData();
});

document.querySelector("#metaForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;

  const data = formData(event.currentTarget);
  const goal = {
    user_id: user.id,
    name: normalizeTextInput(data.name, 80),
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

  event.currentTarget.reset();
  await loadData();
});

document.querySelector("#reservaForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;

  const data = formData(event.currentTarget);
  const reserveType = data.type === "Saída" ? "Saída" : "Entrada";
  const reserve = {
    user_id: user.id,
    date: data.date,
    amount: Number(data.amount),
    type: reserveType,
    note: normalizeTextInput(data.note, 240)
  };

  const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  const { data: inserted, error } = await supabase.from('reserve').insert(reserve).select();
  submitBtn.disabled = false;

  if (error) {
    alert("Erro ao salvar reserva: " + error.message);
    return;
  }

  event.currentTarget.reset();
  initForms();
  await loadData();
});

// ======================================================
// MOTORISTA DE APLICATIVO
// SALVAR REGISTRO
// ======================================================

document.querySelector("#driverForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !user) return;

  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  const registro = {
    user_id: user.id,
    data: document.querySelector("#driverData").value,
    uber: Number(document.querySelector("#driverUber").value || 0),
    noventa_nove: Number(document.querySelector("#driver99").value || 0),
    quilometragem: Number(document.querySelector("#driverKm").value || 0),
    preco_gasolina: Number(document.querySelector("#driverGasolina").value || 0),
    consumo_veiculo: Number(document.querySelector("#driverConsumo").value || 0)
  };

  const { error } = await supabase
    .from("motorista_registros")
    .insert(registro);

  submitButton.disabled = false;

  if (error) {
    console.error(error);
    alert(error.message);
    return;
  }

  event.currentTarget.reset();
  document.querySelector("#driverData").value = getDefaultDateForInput();
  await loadData();
});

// Delete Actions
document.body.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || !user) return;

  const editBillId = button.dataset.editBill;
  if (editBillId) {
    const bill = state.bills.find((item) => item.id === editBillId);
    if (!bill) return;

    const contaForm = document.querySelector("#contaForm");
    if (!contaForm) return;

    editingBillId = bill.id;
    const recurrenceSelect = contaForm.querySelector('select[name="recurrence"]');
    const installmentsInput = contaForm.querySelector('input[name="installments"]');
    const installmentData = parseInstallmentRecurrence(bill.recurrence);

    contaForm.querySelector('input[name="name"]').value = bill.name;
    contaForm.querySelector('select[name="category"]').value = bill.category;
    contaForm.querySelector('input[name="amount"]').value = String(bill.amount);
    contaForm.querySelector('input[name="dueDay"]').value = String(bill.dueDay);
    recurrenceSelect.value = installmentData ? "Parcelado" : bill.recurrence;
    installmentsInput.value = String(installmentData?.totalInstallments || 12);
    contaForm.querySelector('input[name="active"]').checked = !!bill.active;

    recurrenceSelect.dispatchEvent(new Event("change"));
    setBillFormMode(true);
    switchTab("contas");
    contaForm.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const toggleBillPaidId = button.dataset.toggleBillPaid;
  if (toggleBillPaidId) {
    if (!supabase) {
      alert("Configuração do Supabase necessária para marcar pagamento.");
      return;
    }

    const bill = state.bills.find((item) => item.id === toggleBillPaidId);
    if (!bill) return;

    const existingEntry = billEntryForMonth(bill, selectedMonth);
    button.disabled = true;

    if (existingEntry) {
      const { data, error } = await supabase
        .from("entries")
        .update({ paid: !existingEntry.paid })
        .eq("id", existingEntry.id)
        .select()
        .single();

      if (error) {
        alert("Erro ao atualizar pagamento: " + error.message);
        button.disabled = false;
        return;
      }

      state.entries = state.entries.map((entry) => entry.id === existingEntry.id ? { ...entry, ...data, amount: Number(data.amount) } : entry);
    } else {
      const newEntry = {
        user_id: user.id,
        date: buildDueDateForMonth(selectedMonth, bill.dueDay),
        type: "Saída",
        category: bill.category,
        description: billDescriptionForMonth(bill, selectedMonth),
        payment: "PIX",
        amount: Number(bill.amount),
        paid: true,
        note: "Pagamento manual de conta fixa",
      };

      const { data, error } = await supabase
        .from("entries")
        .insert(newEntry)
        .select()
        .single();

      if (error) {
        alert("Erro ao registrar pagamento: " + error.message);
        button.disabled = false;
        return;
      }

      state.entries.push({ ...data, amount: Number(data.amount) });
    }

    button.disabled = false;
    render();
    return;
  }

  if (!supabase) return;
  
  const maps = [
    { key: "deleteEntry", table: "entries", stateKey: "entries" },
    { key: "deleteBill", table: "bills", stateKey: "bills" },
    { key: "deleteGoal", table: "goals", stateKey: "goals" },
    { key: "deleteReserve", table: "reserve", stateKey: "reserve" },
    { key: "deleteDriver", table: "motorista_registros", stateKey: "motorista" },
  ];
  
  for (const map of maps) {
    const id = button.dataset[map.key];
    if (id) {
      if (!confirm("Tem certeza que deseja excluir este item?")) return;
      button.disabled = true;
      const { error } = await supabase.from(map.table).delete().eq('id', id);
      if (!error) {
        if (map.key === "deleteBill" && id === editingBillId) {
          resetBillForm();
        }
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
  const exportState = { ...state };
  const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: "application/json" });
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
      supabase.from('reserve').delete().eq('user_id', user.id),
      supabase.from('motorista_registros').delete().eq('user_id', user.id)
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

    const motorista = (imported.motorista || []).map(m => ({
      user_id: user.id,
      data: m.data,
      uber: Number(m.uber),
      noventa_nove: Number(m.noventa_nove),
      quilometragem: Number(m.quilometragem),
      preco_gasolina: Number(m.preco_gasolina),
      consumo_veiculo: Number(m.consumo_veiculo)
    }));

    await Promise.all([
      entries.length > 0 ? supabase.from('entries').insert(entries) : Promise.resolve(),
      bills.length > 0 ? supabase.from('bills').insert(bills) : Promise.resolve(),
      goals.length > 0 ? supabase.from('goals').insert(goals) : Promise.resolve(),
      reserve.length > 0 ? supabase.from('reserve').insert(reserve) : Promise.resolve(),
      motorista.length > 0 ? supabase.from('motorista_registros').insert(motorista) : Promise.resolve()
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
      supabase.from('reserve').delete().eq('user_id', user.id),
      supabase.from('motorista_registros').delete().eq('user_id', user.id)
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
  supabase.auth.onAuthStateChange(() => {
    checkAuth();
  });
  
  // Executar checkAuth na inicialização
  checkAuth();
}

initForms();
render();
