-- Vincula cada corrida de motorista ao abastecimento usado para descontar combustível.
ALTER TABLE motorista_registros
ADD COLUMN IF NOT EXISTS tank_entry_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'motorista_registros_tank_entry_id_fkey'
  ) THEN
    ALTER TABLE motorista_registros
    ADD CONSTRAINT motorista_registros_tank_entry_id_fkey
    FOREIGN KEY (tank_entry_id)
    REFERENCES entries(id)
    ON DELETE SET NULL;
  END IF;
END $$;
