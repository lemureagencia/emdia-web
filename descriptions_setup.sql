-- Tabela de descrições padrão por usuário
CREATE TABLE IF NOT EXISTS descriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, text)
);

-- RLS: cada usuário só vê suas próprias descrições
ALTER TABLE descriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own descriptions"
  ON descriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own descriptions"
  ON descriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own descriptions"
  ON descriptions FOR DELETE
  USING (auth.uid() = user_id);
