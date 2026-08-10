-- Executar no SQL Editor do seu projeto Supabase:

ALTER TABLE entries
ADD COLUMN IF NOT EXISTS is_internal_transfer BOOLEAN DEFAULT false;
