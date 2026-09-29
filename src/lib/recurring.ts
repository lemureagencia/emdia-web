import { format } from 'date-fns';
import { supabase } from './supabase';

export interface RecurringItem {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string | null;
  service_type: string | null;
  due_day: number;
  payment_method: string | null;
  active: boolean;
  start_month: string;
}

/**
 * Garante que as transações pendentes dos lançamentos fixos existam para o mês
 * informado (default: mês atual). Idempotente — o banco nunca duplica o mesmo mês.
 * Retorna quantas transações novas foram criadas (0 se nada a fazer ou em erro).
 */
export const ensureRecurringMonth = async (month: Date = new Date()): Promise<number> => {
  const { data, error } = await supabase.rpc('ensure_recurring_month', {
    p_month: format(month, 'yyyy-MM-dd'),
  });
  if (error) {
    // Função ainda não criada no banco (recurring_setup.sql) → segue sem quebrar a tela
    console.warn('ensure_recurring_month:', error.message);
    return 0;
  }
  return Number(data ?? 0);
};
