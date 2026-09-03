-- Executar no SQL Editor do seu projeto Supabase:

-- Adiciona colunas à tabela entries para rastrear origem e vincular com Pluggy
ALTER TABLE entries
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS pluggy_item_id TEXT;

-- Índice único parcial para evitar duplicatas de transações externas
CREATE UNIQUE INDEX IF NOT EXISTS entries_user_external_unique
ON entries(user_id, external_id)
WHERE external_id IS NOT NULL;

-- Cria tabela pluggy_items para gerenciar conexões bancárias
CREATE TABLE IF NOT EXISTS pluggy_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  item_id TEXT NOT NULL UNIQUE,
  connector_name TEXT,
  status TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS em pluggy_items
ALTER TABLE pluggy_items ENABLE ROW LEVEL SECURITY;

-- Policy: usuário vê apenas seus próprios items
CREATE POLICY "Users can view their own pluggy items"
ON pluggy_items FOR SELECT
USING (auth.uid() = user_id);

-- Policy: usuário deleta apenas seus próprios items
CREATE POLICY "Users can delete their own pluggy items"
ON pluggy_items FOR DELETE
USING (auth.uid() = user_id);

-- Policy: apenas o servidor (SERVICE_ROLE) insere/atualiza
-- (não precisa de policy explícita, SERVICE_ROLE bypassa RLS)
