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

function weekRangeLabel(selectedMonth, weekIndex) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDay = (weekIndex - 1) * 7 + 1;
  const endDay = Math.min(startDay + 6, daysInMonth);
  return `Semana ${weekIndex} (${String(startDay).padStart(2, "0")} a ${String(endDay).padStart(2, "0")})`;
}

function renderGanhosSemanais(registrosMes, selectedMonth, money) {
  const list = document.querySelector("#driverWeeklyList");
  if (!list) return;

  const weeklyTotals = new Map();

  registrosMes.forEach((registro) => {
    const day = Number(String(registro.data || "").slice(8, 10));
    if (!Number.isFinite(day) || day <= 0) return;

    const weekIndex = Math.floor((day - 1) / 7) + 1;
    if (!weeklyTotals.has(weekIndex)) {
      weeklyTotals.set(weekIndex, {
        bruto: 0,
        combustivel: 0,
        liquido: 0,
        dias: 0,
      });
    }

    const summary = weeklyTotals.get(weekIndex);
    const { combustivel, bruto, liquido } = resumoRegistro(registro);
    summary.bruto += bruto;
    summary.combustivel += combustivel;
    summary.liquido += liquido;
    summary.dias += 1;
  });

  const weekIndexes = Array.from(weeklyTotals.keys()).sort((a, b) => a - b);

  if (!weekIndexes.length) {
    list.innerHTML = `<div class="list-row"><div><strong>Sem registros no mês</strong><small>Adicione corridas para ver o resumo semanal.</small></div></div>`;
    return;
  }

  list.innerHTML = weekIndexes
    .map((weekIndex) => {
      const week = weeklyTotals.get(weekIndex);
      return `
        <div class="list-row">
          <div>
            <strong>${weekRangeLabel(selectedMonth, weekIndex)}</strong>
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