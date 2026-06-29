-- agent_edit.sql
-- Funções RPC para editar, marcar como pago e excluir pendências pelo agente WhatsApp.
-- Rodar no SQL Editor do Supabase.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Busca pendências por nome (category) ou descrição (ilike)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION agent_find_pending_by_phone(p_phone TEXT, p_search TEXT)
RETURNS TABLE(
  id           UUID,
  type         TEXT,
  amount       NUMERIC,
  description  TEXT,
  category     TEXT,
  due_date     DATE,
  service_type TEXT,
  overdue      BOOLEAN
)
SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE v_uid UUID;
BEGIN
  v_uid := _phone_to_user_id(p_phone);
  IF v_uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.type::TEXT,
    t.amount,
    t.description,
    t.category,
    t.due_date,
    t.service_type,
    (t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE)
  FROM transactions t
  WHERE t.user_id = v_uid
    AND t.status = 'pending'
    AND (
      t.category    ILIKE '%' || p_search || '%'
      OR t.description ILIKE '%' || p_search || '%'
    )
  ORDER BY t.due_date ASC NULLS LAST
  LIMIT 5;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Edita campos de uma pendência ou a marca como paga
--    Quando p_mark_paid=TRUE: status → 'paid', ajusta saldo em profiles.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION agent_edit_pending_by_phone(
  p_phone       TEXT,
  p_id          UUID,
  p_amount      NUMERIC  DEFAULT NULL,
  p_due_date    DATE     DEFAULT NULL,
  p_description TEXT     DEFAULT NULL,
  p_category    TEXT     DEFAULT NULL,
  p_mark_paid   BOOLEAN  DEFAULT FALSE
)
RETURNS JSONB SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_uid        UUID;
  v_type       TEXT;
  v_eff_amount NUMERIC;
  v_rows       INT;
BEGIN
  v_uid := _phone_to_user_id(p_phone);
  IF v_uid IS NULL THEN
    RETURN '{"success":false,"reason":"user_not_found"}'::JSONB;
  END IF;

  -- Lê tipo e valor efetivo antes de atualizar (para ajuste de saldo)
  SELECT t.type::TEXT, COALESCE(p_amount, t.amount)
  INTO v_type, v_eff_amount
  FROM transactions t
  WHERE t.id = p_id AND t.user_id = v_uid AND t.status = 'pending';

  IF NOT FOUND THEN
    RETURN '{"success":false,"reason":"not_found"}'::JSONB;
  END IF;

  UPDATE transactions
  SET
    amount      = COALESCE(p_amount,      amount),
    due_date    = COALESCE(p_due_date,    due_date),
    description = COALESCE(p_description, description),
    category    = COALESCE(p_category,    category),
    status      = CASE WHEN p_mark_paid THEN 'paid'       ELSE status    END,
    paid_date   = CASE WHEN p_mark_paid THEN CURRENT_DATE ELSE paid_date END
  WHERE id = p_id AND user_id = v_uid AND status = 'pending';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Se marcou como pago, ajusta saldo em profiles
  IF p_mark_paid AND v_rows > 0 THEN
    UPDATE profiles
    SET current_balance = current_balance +
      CASE WHEN v_type = 'income' THEN v_eff_amount ELSE -v_eff_amount END
    WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'success',         v_rows > 0,
    'account_balance', (SELECT current_balance FROM profiles WHERE id = v_uid)
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Exclui uma pendência existente (status = 'pending')
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION agent_delete_pending_by_phone(p_phone TEXT, p_id UUID)
RETURNS JSONB SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_uid UUID;
  v_rows INT;
BEGIN
  v_uid := _phone_to_user_id(p_phone);
  IF v_uid IS NULL THEN
    RETURN '{"success":false,"reason":"user_not_found"}'::JSONB;
  END IF;

  DELETE FROM transactions
  WHERE id = p_id AND user_id = v_uid AND status = 'pending';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', v_rows > 0);
END;
$$;
