-- Executar no SQL Editor do seu projeto Supabase:

ALTER TABLE entries
ADD COLUMN IF NOT EXISTS hide_from_dashboard BOOLEAN DEFAULT false;
