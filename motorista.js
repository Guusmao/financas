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