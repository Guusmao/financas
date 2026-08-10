-- Marcar retroativamente lançamentos de "Uso pessoal - sobra do abastecimento" como transferências internas
-- Executar no SQL Editor do seu projeto Supabase:

UPDATE entries
SET is_internal_transfer = true
WHERE type = 'Saída'
  AND category = 'Abastecimento'
  AND description LIKE 'Uso pessoal - sobra do abastecimento%';
