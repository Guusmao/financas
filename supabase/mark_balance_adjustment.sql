-- Marcar o lançamento de 08/08/2026 como ajuste de saldo
-- Executar no SQL Editor do seu projeto Supabase:

UPDATE entries
SET hide_from_dashboard = true
WHERE date = '2026-08-08'
  AND description LIKE '%Igualar%saldo%'
  AND amount::numeric = 439.70
  AND type = 'Entrada';
