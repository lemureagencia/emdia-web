import { addMonths, format, parseISO } from 'date-fns';

export type PaymentMethod = 'pix' | 'card' | 'cash';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'card', label: 'Cartão' },
  { value: 'cash', label: 'Dinheiro' },
];

export const paymentMethodLabel = (value: string | null | undefined): string => {
  if (!value) return '-';
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;
};

/**
 * Divide um valor total em N parcelas (2 casas), com a última absorvendo
 * o arredondamento para que a soma feche exatamente com o total.
 */
export const splitInstallments = (total: number, count: number): number[] => {
  if (count <= 1) return [Math.round(total * 100) / 100];
  const base = Math.floor((total / count) * 100) / 100;
  const amounts = Array(count).fill(base);
  const used = Math.round(base * count * 100) / 100;
  const diff = Math.round((total - used) * 100) / 100;
  amounts[count - 1] = Math.round((base + diff) * 100) / 100;
  return amounts;
};

/** Gera as datas de vencimento (yyyy-MM-dd) mês a mês a partir da 1ª. */
export const installmentDueDates = (firstDue: string, count: number): string[] => {
  const start = parseISO(firstDue);
  return Array.from({ length: count }, (_, i) => format(addMonths(start, i), 'yyyy-MM-dd'));
};

export interface PendingLike {
  amount: number;
  due_date: string | null;
  installment_group: string | null;
}

/**
 * Reduz uma lista de pendências à "parcela ativa" de cada parcelamento
 * (a próxima a vencer ainda não paga) + os itens avulsos. Usado nos cartões
 * de resumo para que um parcelamento conte sempre 1 parcela por vez.
 */
export const activePending = <T extends PendingLike>(rows: T[]): T[] => {
  const groups = new Map<string, T[]>();
  const result: T[] = [];
  for (const r of rows) {
    if (r.installment_group) {
      const arr = groups.get(r.installment_group) ?? [];
      arr.push(r);
      groups.set(r.installment_group, arr);
    } else {
      result.push(r);
    }
  }
  for (const arr of groups.values()) {
    const sorted = [...arr].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
    result.push(sorted[0]);
  }
  return result;
};
