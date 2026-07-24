-- Executar no SQL Editor do seu projeto Supabase:

ALTER TABLE entries 
ADD COLUMN IF NOT EXISTS fuel_value_remaining NUMERIC;

ALTER TABLE entries 
ADD COLUMN IF NOT EXISTS fuel_closed BOOLEAN DEFAULT false;
