export function renderBancos(pluggyItems, money, dateLabel, showToast, disconnectBank) {
  const container = document.querySelector('#bancosList');
  if (!container) return;

  if (!pluggyItems || pluggyItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p><strong>Nenhum banco conectado</strong></p>
        <small>Conecte uma conta bancária via Meu Pluggy para começar a sincronizar transações automaticamente.</small>
      </div>
    `;
    return;
  }

  container.innerHTML = pluggyItems
    .map((item) => {
      const lastSync = item.last_synced_at
        ? dateLabel(item.last_synced_at)
        : 'Nunca sincronizado';

      return `
        <div class="banco-card">
          <div class="banco-header">
            <strong>${item.connector_name || 'Banco'}</strong>
            <span class="status-badge status-${item.status || 'unknown'}">${item.status || 'pendente'}</span>
          </div>
          <div class="banco-info">
            <small>Última sincronização: ${lastSync}</small>
          </div>
          <button class="banco-disconnect" data-disconnect-item="${item.item_id}">
            Desconectar
          </button>
        </div>
      `;
    })
    .join('');

  // Info text abaixo da lista
  const syncFromDate = document.querySelector('[data-sync-from-date]')?.dataset.syncFromDate || 'hoje';
  const info = document.querySelector('#bancosInfo');
  if (info) {
    info.innerHTML = `
      <small>
        A partir de <strong>${syncFromDate}</strong>, os lançamentos de Outras Movimentações destes bancos
        entram automaticamente. Evite lançar manualmente gastos já cobertos por eles.
      </small>
    `;
  }

  // Listeners dos botões
  container.querySelectorAll('[data-disconnect-item]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const itemId = btn.dataset.disconnectItem;
      await disconnectBank(itemId);
    });
  });
}

export async function loadPluggyItems(supabase) {
  const { data, error } = await supabase
    .from('pluggy_items')
    .select('*');

  if (error) {
    console.error('Error loading pluggy items:', error);
    return [];
  }

  return data || [];
}

export async function disconnectBank(supabase, itemId, showToast) {
  const session = await supabase.auth.getSession();
  if (!session?.data?.session?.access_token) {
    showToast('Erro: Não autenticado', 'error');
    return false;
  }

  try {
    const res = await fetch('/api/pluggy/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.data.session.access_token}`,
      },
      body: JSON.stringify({ itemId }),
    });

    if (!res.ok) {
      const error = await res.json();
      showToast(`Erro ao desconectar: ${error.error}`, 'error');
      return false;
    }

    showToast('Banco desconectado com sucesso', 'success');
    return true;
  } catch (err) {
    console.error('Error disconnecting bank:', err);
    showToast('Erro ao desconectar banco', 'error');
    return false;
  }
}
