const storageKey = "felip-financas-web-v1";

const config = {
  categories: ["Salário", "Mercado", "Internet", "Moradia", "Educação", "Transporte", "Faculdade", "Seguro", "TIM", "Lazer", "Saúde", "Reserva", "Outros"],
  payments: ["PIX", "Débito", "Crédito", "Dinheiro", "Transferência"],
};

const seed = {
  entries: [
    { id: crypto.randomUUID(), date: "2026-07-05", type: "Entrada", category: "Salário", description: "Salário Mensal", payment: "PIX", amount: 3000, paid: true, note: "" },
    { id: crypto.randomUUID(), date: "2026-07-06", type: "Saída", category: "Mercado", description: "Assaí", payment: "Débito", amount: 350, paid: true, note: "" },
    { id: crypto.randomUUID(), date: "2026-07-07", type: "Saída", category: "Internet", description: "Brisanet", payment: "PIX", amount: 60, paid: true, note: "" },
  ],
  bills: [
    { id: crypto.randomUUID(), name: "Internet", category: "Moradia", amount: 60, dueDay: 10, recurrence: "Mensal", active: true },
    { id: crypto.randomUUID(), name: "Faculdade", category: "Educação", amount: 356, dueDay: 5, recurrence: "Mensal", active: true },
    { id: crypto.randomUUID(), name: "Seguro Carro", category: "Transporte", amount: 174, dueDay: 15, recurrence: "Mensal", active: true },
  ],
  goals: [
    { id: crypto.randomUUID(), name: "Reserva de emergência", target: 1000, saved: 0 },
  ],
  reserve: [],
};

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return structuredClone(seed);
  try {
    return { ...structuredClone(seed), ...JSON.parse(raw) };
  } catch {
    return structuredClone(seed);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

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

function fillSelect(select, options) {
  select.innerHTML = options.map((item) => `<option>${item}</option>`).join("");
}

function initForms() {
  document.querySelectorAll('select[name="category"]').forEach((select) => fillSelect(select, config.categories));
  document.querySelectorAll('select[name="payment"]').forEach((select) => fillSelect(select, config.payments));
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.value) input.value = todayIso();
  });
}

function totals() {
  const entries = state.entries.filter((entry) => entry.paid);
  const entradas = entries.filter((entry) => entry.type === "Entrada").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const saidas = entries.filter((entry) => entry.type === "Saída").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const reservaLancamentos = entries.filter((entry) => entry.type === "Reserva").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const reservaMovimentos = state.reserve.reduce((sum, item) => sum + (item.type === "Entrada" ? Number(item.amount) : -Number(item.amount)), 0);
  const reserva = reservaLancamentos + reservaMovimentos;
  return { entradas, saidas, reserva, saldo: entradas - saidas - reserva };
}

function renderDashboard() {
  const total = totals();
  document.querySelector("#totalEntradas").textContent = money(total.entradas);
  document.querySelector("#totalSaidas").textContent = money(total.saidas);
  document.querySelector("#totalReserva").textContent = money(total.reserva);
  document.querySelector("#saldoAtual").textContent = money(total.saldo);
  document.querySelector("#todayLabel").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const paidCategories = new Set(state.entries.filter((entry) => entry.paid).map((entry) => entry.category));
  const bills = state.bills.filter((bill) => bill.active);
  document.querySelector("#contasStatus").textContent = `${bills.length} ativas`;
  document.querySelector("#dashboardContas").innerHTML = bills.map((bill) => {
    const paid = paidCategories.has(bill.name) || paidCategories.has(bill.category);
    return `<div class="list-row">
      <div><strong>${bill.name}</strong><small>${bill.category} · vence dia ${bill.dueDay}</small></div>
      <div><span class="amount">${money(bill.amount)}</span><span class="status ${paid ? "ok" : "warn"}">${paid ? "Pago" : "Pendente"}</span></div>
    </div>`;
  }).join("") || emptyRow("Nenhuma conta fixa");

  const gastos = state.entries.filter((entry) => entry.type === "Saída").slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  document.querySelector("#gastosStatus").textContent = `${gastos.length} recentes`;
  document.querySelector("#dashboardGastos").innerHTML = gastos.map((entry) => `<div class="list-row">
    <div><strong>${entry.description}</strong><small>${dateLabel(entry.date)} · ${entry.category} · ${entry.payment}</small></div>
    <span class="amount">${money(entry.amount)}</span>
  </div>`).join("") || emptyRow("Nenhum gasto lançado");

  document.querySelector("#metasStatus").textContent = `${state.goals.length} metas`;
  document.querySelector("#dashboardMetas").innerHTML = state.goals.map(goalCard).join("") || emptyRow("Nenhuma meta cadastrada");

  document.querySelector("#dashboardReserva").textContent = money(total.reserva);
  document.querySelector("#reservaStatus").textContent = `${state.reserve.length} movimentos`;
  document.querySelector("#dashboardReservaMovimentos").innerHTML = state.reserve.slice(-4).reverse().map((item) => `<div class="list-row">
    <div><strong>${dateLabel(item.date)}</strong><small>${item.note || item.type}</small></div>
    <span class="amount">${item.type === "Saída" ? "-" : ""}${money(item.amount)}</span>
  </div>`).join("") || emptyRow("Sem movimentos");

  const max = Math.max(total.entradas, total.saidas, total.reserva, 1);
  document.querySelector("#barEntradas").style.width = `${(total.entradas / max) * 100}%`;
  document.querySelector("#barSaidas").style.width = `${(total.saidas / max) * 100}%`;
  document.querySelector("#barReserva").style.width = `${(total.reserva / max) * 100}%`;
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
  const rows = state.entries.slice().sort((a, b) => b.date.localeCompare(a.date)).map((entry) => `<tr>
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

function renderGoals() {
  document.querySelector("#metasList").innerHTML = state.goals.map(goalCard).join("");
}

function renderReserve() {
  document.querySelector("#reservaTable").innerHTML = state.reserve.slice().sort((a, b) => b.date.localeCompare(a.date)).map((item) => `<tr>
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

document.querySelectorAll(".nav-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab, .view").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}`).classList.add("active");
  });
});

document.querySelector("#lancamentoForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  state.entries.push({
    id: crypto.randomUUID(),
    date: data.date,
    type: data.type,
    category: data.category,
    description: data.description,
    payment: data.payment,
    amount: Number(data.amount),
    paid: event.currentTarget.paid.checked,
    note: data.note,
  });
  event.currentTarget.reset();
  initForms();
  saveState();
  render();
});

document.querySelector("#contaForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  state.bills.push({
    id: crypto.randomUUID(),
    name: data.name,
    category: data.category,
    amount: Number(data.amount),
    dueDay: Number(data.dueDay),
    recurrence: data.recurrence,
    active: event.currentTarget.active.checked,
  });
  event.currentTarget.reset();
  initForms();
  saveState();
  render();
});

document.querySelector("#metaForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  state.goals.push({ id: crypto.randomUUID(), name: data.name, target: Number(data.target), saved: Number(data.saved) });
  event.currentTarget.reset();
  saveState();
  render();
});

document.querySelector("#reservaForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  state.reserve.push({ id: crypto.randomUUID(), date: data.date, amount: Number(data.amount), type: data.type, note: data.note });
  event.currentTarget.reset();
  initForms();
  saveState();
  render();
});

document.body.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const maps = [
    ["deleteEntry", "entries"],
    ["deleteBill", "bills"],
    ["deleteGoal", "goals"],
    ["deleteReserve", "reserve"],
  ];
  for (const [key, collection] of maps) {
    const id = button.dataset[key];
    if (id) {
      state[collection] = state[collection].filter((item) => item.id !== id);
      saveState();
      render();
    }
  }
});

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
  if (!file) return;
  state = JSON.parse(await file.text());
  saveState();
  render();
  event.target.value = "";
});

document.querySelector("#resetData").addEventListener("click", () => {
  state = structuredClone(seed);
  saveState();
  render();
});

initForms();
render();
