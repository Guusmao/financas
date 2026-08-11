export function calcularCombustivel(km, consumo, gasolina) {
  if (!consumo || consumo <= 0) {
    return 0;
  }

  return (km / consumo) * gasolina;
}

export function calcularBruto(uber, noventaNove) {
  return Number(uber) + Number(noventaNove);
}

export function calcularLiquido(bruto, combustivel) {
  return bruto - combustivel;
}

function resumoRegistro(registro) {
  const combustivel = calcularCombustivel(
    registro.quilometragem,
    registro.consumo_veiculo,
    registro.preco_gasolina
  );
  const bruto = calcularBruto(registro.uber, registro.noventa_nove);
  const liquido = calcularLiquido(bruto, combustivel);

  return { combustivel, bruto, liquido };
}

function getWeekKey(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();

  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(date);
  monday.setDate(monday.getDate() - daysToMonday);

  return monday.toISOString().split('T')[0];
}

function weekRangeLabel(mondayDateString, selectedMonth) {
  const [year, month, day] = mondayDateString.split("-").map(Number);
  const monday = new Date(year, month - 1, day);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const [selectedYear, selectedMonthNum] = selectedMonth.split("-").map(Number);

  let startDay = monday.getDate();
  if (monday.getFullYear() !== selectedYear || monday.getMonth() + 1 !== selectedMonthNum) {
    startDay = 1;
  }

  let endDay = sunday.getDate();
  if (sunday.getFullYear() !== selectedYear || sunday.getMonth() + 1 !== selectedMonthNum) {
    const lastDay = new Date(selectedYear, selectedMonthNum, 0);
    endDay = lastDay.getDate();
  }

  return `Semana ${String(startDay).padStart(2, "0")} a ${String(endDay).padStart(2, "0")}`;
}

function renderGanhosSemanais(registrosMes, selectedMonth, money) {
  const list = document.querySelector("#driverWeeklyList");
  if (!list) return;

  const weeklyTotals = new Map();

  registrosMes.forEach((registro) => {
    const weekKey = getWeekKey(registro.data);
    if (!weeklyTotals.has(weekKey)) {
      weeklyTotals.set(weekKey, {
        bruto: 0,
        combustivel: 0,
        liquido: 0,
        dias: 0,
      });
    }

    const summary = weeklyTotals.get(weekKey);
    const { combustivel, bruto, liquido } = resumoRegistro(registro);
    summary.bruto += bruto;
    summary.combustivel += combustivel;
    summary.liquido += liquido;
    summary.dias += 1;
  });

  const weekKeys = Array.from(weeklyTotals.keys()).sort();

  if (!weekKeys.length) {
    list.innerHTML = `<div class="list-row"><div><strong>Sem registros no mês</strong><small>Adicione corridas para ver o resumo semanal.</small></div></div>`;
    return;
  }

  list.innerHTML = weekKeys
    .map((weekKey) => {
      const week = weeklyTotals.get(weekKey);
      return `
        <div class="list-row">
          <div>
            <strong>${weekRangeLabel(weekKey, selectedMonth)}</strong>
            <small>${week.dias} dia(s) trabalhado(s)</small>
          </div>
          <div>
            <small>Bruto: ${money(week.bruto)}</small>
            <small>Combustível: ${money(week.combustivel)}</small>
            <strong>${money(week.liquido)}</strong>
          </div>
        </div>
      `;
    })
    .join("");
}

export function renderMotorista(registros, selectedMonth, money, dateLabel) {
  const registrosMes = registros.filter((registro) => registro.data.startsWith(selectedMonth));

  let totalBruto = 0;
  let totalLiquido = 0;
  let totalCombustivel = 0;

  registrosMes.forEach((registro) => {
    const { combustivel, bruto, liquido } = resumoRegistro(registro);
    totalBruto += bruto;
    totalLiquido += liquido;
    totalCombustivel += combustivel;
  });

  document.querySelector("#driverTotalBruto").textContent = money(totalBruto);
  document.querySelector("#driverTotalLiquido").textContent = money(totalLiquido);
  document.querySelector("#driverTotalCombustivel").textContent = money(totalCombustivel);
  document.querySelector("#driverDias").textContent = registrosMes.length;

  renderGanhosSemanais(registrosMes, selectedMonth, money);

  document.querySelector("#driverTable").innerHTML = registrosMes
    .map((registro) => {
      const { combustivel, bruto, liquido } = resumoRegistro(registro);

      return `
        <tr>
          <td>${dateLabel(registro.data)}</td>
          <td>${money(registro.uber)}</td>
          <td>${money(registro.noventa_nove)}</td>
          <td>${registro.quilometragem}</td>
          <td>${money(registro.preco_gasolina)}</td>
          <td>${registro.consumo_veiculo}</td>
          <td>${money(bruto)}</td>
          <td>${money(combustivel)}</td>
          <td>${money(liquido)}</td>
          <td>
            <button class="row-action neutral" data-edit-driver="${registro.id}">Editar</button>
            <button class="row-action" data-delete-driver="${registro.id}">Excluir</button>
          </td>
        </tr>
      `;
    })
    .join("");
}