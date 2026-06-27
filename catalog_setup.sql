-- Política de UPDATE na tabela descriptions (para editar via catálogo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'descriptions'
      AND policyname = 'Users can update their own descriptions'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can update their own descriptions"
        ON descriptions FOR UPDATE
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    ';
  END IF;
END $$;

-- RPC para o agente buscar descrições padrão pelo telefone do usuário
CREATE OR REPLACE FUNCTION get_descriptions_by_phone(p_phone text)
RETURNS TABLE(text text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT d.text
  FROM descriptions d
  JOIN profiles pr ON pr.id = d.user_id
  WHERE canon_phone(pr.phone) = canon_phone(p_phone)
  ORDER BY d.text;
$$;
