import { useEffect, useState } from 'react';
import { Plus, Trash2, CheckCircle, Pencil, ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, AlertTriangle } from 'lucide-react';
import { format, parseISO, endOfMonth } from 'date-fns';
import { clsx } from 'clsx';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { PAYMENT_METHODS, paymentMethodLabel, splitInstallments, installmentDueDates, type PaymentMethod } from '../lib/installments';
import styles from './Pending.module.css';

interface PendingTx {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string | null;
  service_type: string | null;
  due_date: string | null;
  payment_method: string | null;
  installment_group: string | null;
  installments: number;
  installment_number: number | null;
}

interface Description {
  id: string;
  text: string;
}

// Linha exibida: item solto OU grupo de parcelas (mostra só a próxima a vencer)
interface DisplayRow {
  key: string;
  isGroup: boolean;
  baseDesc: string;
  totalInstallments: number;
  remaining: number;
  next: PendingTx; // parcela atual (mais próxima de vencer) ou o próprio item
  lastDue: string | null; // vencimento da última parcela do grupo
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const endOfMonthStr = () => format(endOfMonth(new Date()), 'yyyy-MM-dd');
const stripParcela = (desc: string) => desc.replace(/\s*\(\d+\/\d+\)\s*$/, '');

export const Pending = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingTx[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'income' | 'expense' | 'overdue_income' | 'overdue_expense'>('income');
  const [descriptions, setDescriptions] = useState<Description[]>([]);
  const [formData, setFormData] = useState({
    type: 'income' as 'income' | 'expense',
    amount: '',
    description: '',
    category: '',
    service_type: '',
    due_date: todayStr(),
    payment_method: 'pix' as PaymentMethod,
    parcelado: false,
    installments: '2',
  });

  const fetchPending = async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('transactions')
      .select('id, type, amount, description, category, service_type, due_date, payment_method, installment_group, installments, installment_number')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('due_date', { ascending: true, nullsFirst: false });

    if (!error && data) setItems(data);
    setIsLoading(false);
  };

  const fetchDescriptions = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('descriptions')
      .select('id, text')
      .eq('user_id', user.id)
      .order('text', { ascending: true });
    if (data) setDescriptions(data);
  };

  useEffect(() => {
    fetchPending();
    fetchDescriptions();
  }, [user]);

  const resetForm = () => {
    setEditingId(null);
    setFormData({ type: 'income', amount: '', description: '', category: '', service_type: '', due_date: todayStr(), payment_method: 'pix', parcelado: false, installments: '2' });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (item: PendingTx) => {
    setEditingId(item.id);
    setFormData({
      type: item.type,
      amount: String(item.amount),
      description: stripParcela(item.description),
      category: item.category ?? '',
      service_type: item.service_type ?? '',
      due_date: item.due_date ?? todayStr(),
      payment_method: (item.payment_method as PaymentMethod) ?? 'pix',
      parcelado: false,
      installments: '2',
    });
    setIsModalOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    const total = parseFloat(formData.amount);
    const method = formData.payment_method;

    // Edição: atualiza apenas o item selecionado (não mexe em status/parcelas)
    if (editingId) {
      const { error } = await supabase.from('transactions').update({
        type: formData.type,
        amount: total,
        description: formData.description,
        category: formData.category || null,
        service_type: formData.service_type || null,
        due_date: formData.due_date || null,
        payment_method: method,
      }).eq('id', editingId);
      setIsSubmitting(false);
      if (!error) { closeModal(); fetchPending(); }
      else alert('Erro ao salvar alterações.');
      return;
    }

    let rows: Record<string, unknown>[];

    if (formData.parcelado) {
      const n = Math.max(2, parseInt(formData.installments, 10) || 2);
      const amounts = splitInstallments(total, n);
      const dues = installmentDueDates(formData.due_date, n);
      const group = (crypto as Crypto).randomUUID();
      rows = amounts.map((amt, i) => ({
        user_id: user.id,
        type: formData.type,
        status: 'pending',
        amount: amt,
        description: `${formData.description} (${i + 1}/${n})`,
        category: formData.category || null,
        service_type: formData.service_type || null,
        due_date: dues[i],
        payment_method: method,
        installments: n,
        installment_number: i + 1,
        installment_group: group,
      }));
    } else {
      rows = [{
        user_id: user.id,
        type: formData.type,
        status: 'pending',
        amount: total,
        description: formData.description,
        category: formData.category || null,
        service_type: formData.service_type || null,
        due_date: formData.due_date || null,
        payment_method: method,
        installments: 1,
      }];
    }

    const { error } = await supabase.from('transactions').insert(rows);

    setIsSubmitting(false);
    if (!error) {
      closeModal();
      fetchPending();
    } else {
      alert('Erro ao adicionar pendência.');
    }
  };

  const handleMarkPaid = async (id: string) => {
    const { error } = await supabase
      .from('transactions')
      .update({ status: 'paid', paid_date: todayStr() })
      .eq('id', id);
    if (!error) {
      setItems(items.filter((i) => i.id !== id));
    } else {
      alert('Erro ao marcar como pago.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta pendência?')) return;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (!error) {
      setItems(items.filter((i) => i.id !== id));
    } else {
      alert('Erro ao excluir.');
    }
  };

  const handleDeleteGroup = async (group: string) => {
    if (!confirm('Excluir todas as parcelas restantes deste parcelamento?')) return;
    const { error } = await supabase.from('transactions').delete().eq('installment_group', group);
    if (!error) {
      setItems(items.filter((i) => i.installment_group !== group));
    } else {
      alert('Erro ao excluir parcelamento.');
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const isOverdue = (item: PendingTx) => !!item.due_date && item.due_date < todayStr();
  // Item avulso que vence neste mês (ou antes / sem data) — usado nos cartões de resumo
  const isCurrentOrOverdue = (i: PendingTx) => !i.due_date || i.due_date <= endOfMonthStr();

  // Agrupa parcelas (mesmo installment_group) em uma única linha (mostra a próxima a vencer)
  const displayRows: DisplayRow[] = (() => {
    const groups = new Map<string, PendingTx[]>();
    const rows: DisplayRow[] = [];
    for (const item of items) {
      if (item.installment_group) {
        const arr = groups.get(item.installment_group) ?? [];
        arr.push(item);
        groups.set(item.installment_group, arr);
      } else {
        rows.push({ key: item.id, isGroup: false, baseDesc: item.description, totalInstallments: 1, remaining: 1, next: item, lastDue: item.due_date });
      }
    }
    for (const [group, arr] of groups) {
      const sorted = [...arr].sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
      const next = sorted[0];
      const lastDue = sorted[sorted.length - 1].due_date;
      rows.push({ key: group, isGroup: true, baseDesc: stripParcela(next.description), totalInstallments: next.installments, remaining: sorted.length, next, lastDue });
    }
    return rows.sort((a, b) => (a.next.due_date ?? '').localeCompare(b.next.due_date ?? ''));
  })();

  // Cartões: parcelamentos contam só a PARCELA ATIVA (próxima não paga) — sempre 1 parcela.
  // Itens avulsos contam se vencem neste mês ou estão atrasados.
  const cardRows = displayRows.filter((r) => r.isGroup || isCurrentOrOverdue(r.next));
  const expectedIncome = cardRows.filter((r) => r.next.type === 'income').reduce((s, r) => s + Number(r.next.amount), 0);
  const toPay = cardRows.filter((r) => r.next.type === 'expense').reduce((s, r) => s + Number(r.next.amount), 0);
  const overdueItems = displayRows.filter((r) => isOverdue(r.next));
  const overdueTotal = overdueItems.reduce((s, r) => s + Number(r.next.amount), 0);
  const overdueIncomeItems = overdueItems.filter((r) => r.next.type === 'income');
  const overdueExpenseItems = overdueItems.filter((r) => r.next.type === 'expense');

  // Filtro da aba: separa clientes (a receber) de contas (a pagar) e vencidos por lado
  const visibleRows = displayRows.filter((r) =>
    filter === 'income' ? r.next.type === 'income'
    : filter === 'expense' ? r.next.type === 'expense'
    : filter === 'overdue_income' ? isOverdue(r.next) && r.next.type === 'income'
    : isOverdue(r.next) && r.next.type === 'expense'
  );

  // Contadores por aba (badge)
  const incomeCount = displayRows.filter((r) => r.next.type === 'income').length;
  const expenseCount = displayRows.filter((r) => r.next.type === 'expense').length;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Pendências</h1>
          <p className="text-muted">Contas a pagar e a receber, com datas e vencidos</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={18} /> Nova Pendência
        </Button>
      </div>

      <div className={styles.summaryGrid}>
        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <TrendingUp size={16} className={styles.success} /> A Receber
            </div>
            <div className={clsx(styles.summaryValue, styles.success)}>{formatCurrency(expectedIncome)}</div>
            <div className={styles.summaryHint}>Entradas a receber de pagamentos pendentes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <Wallet size={16} className={styles.danger} /> Contas a Pagar
            </div>
            <div className={clsx(styles.summaryValue, styles.danger)}>{formatCurrency(toPay)}</div>
            <div className={styles.summaryHint}>Saídas pendentes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <AlertTriangle size={16} className={styles.warning} /> Vencidos
            </div>
            <div className={clsx(styles.summaryValue, styles.warning)}>{formatCurrency(overdueTotal)}</div>
            <div className={styles.summaryHint}>{overdueItems.length} pendência(s) em atraso</div>
          </CardContent>
        </Card>
      </div>

      <div className={styles.tabs} role="tablist">
        {([
          ['income', 'A receber', 'clientes', TrendingUp, incomeCount, styles.tabIncome],
          ['expense', 'A pagar', 'contas', Wallet, expenseCount, styles.tabExpense],
          ['overdue_income', 'Vencidos a receber', 'clientes', AlertTriangle, overdueIncomeItems.length, styles.tabOverdue],
          ['overdue_expense', 'Vencidos a pagar', 'contas', AlertTriangle, overdueExpenseItems.length, styles.tabOverdueExpense],
        ] as const).map(([key, label, sub, Icon, count, colorClass]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            className={clsx(styles.tab, filter === key && styles.tabActive, filter === key && colorClass)}
            onClick={() => setFilter(key)}
          >
            <Icon size={18} className={styles.tabIcon} />
            <span className={styles.tabLabel}>
              {label}
              <span className={styles.tabSub}>{sub}</span>
            </span>
            <span className={styles.tabCount}>{count}</span>
          </button>
        ))}
      </div>

      <Card>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Vencimento</th>
                <th>Tipo</th>
                <th>Situação</th>
                <th>Forma</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Carregando...</td></tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                    {items.length === 0 ? 'Nenhuma pendência. Tudo em dia! 🎉' : 'Nenhuma pendência neste filtro.'}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const item = row.next;
                  const overdue = isOverdue(item);
                  return (
                    <tr key={row.key}>
                      <td style={{ fontWeight: 500 }}>{item.category || '-'}</td>
                      <td>
                        {row.baseDesc}
                        {row.isGroup && (
                          <div className={styles.summaryHint}>
                            Parcela {item.installment_number} de {row.totalInstallments} • restam {row.remaining}
                            {row.lastDue && <> • última {format(parseISO(row.lastDue), 'dd/MM/yyyy')}</>}
                          </div>
                        )}
                      </td>
                      <td>{item.due_date ? format(parseISO(item.due_date), 'dd/MM/yyyy') : '-'}</td>
                      <td>
                        <span className={clsx(styles.badge, item.type === 'income' ? styles.typeIncome : styles.typeExpense)}>
                          {item.type === 'income' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {item.type === 'income' ? 'A receber' : 'A pagar'}
                        </span>
                      </td>
                      <td>
                        <span className={clsx(styles.badge, overdue ? styles.statusOverdue : styles.statusPending)}>
                          {overdue ? 'Vencido' : 'Pendente'}
                        </span>
                      </td>
                      <td>{paymentMethodLabel(item.payment_method)}</td>
                      <td style={{ textAlign: 'right' }} className={item.type === 'income' ? styles.amountIncome : styles.amountExpense}>
                        {formatCurrency(item.amount)}
                        {row.isGroup && <span className={styles.summaryHint}> /parcela</span>}
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <Button variant="ghost" size="icon" onClick={() => handleMarkPaid(item.id)} aria-label="Marcar parcela como paga" title={row.isGroup ? 'Marcar esta parcela como paga' : 'Marcar como pago'}>
                            <CheckCircle size={16} className="text-success" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)} aria-label="Editar" title={row.isGroup ? 'Editar esta parcela' : 'Editar'}>
                            <Pencil size={16} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => row.isGroup ? handleDeleteGroup(row.key) : handleDelete(item.id)} aria-label="Excluir" title={row.isGroup ? 'Excluir parcelamento' : 'Excluir'}>
                            <Trash2 size={16} className="text-danger" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingId ? 'Editar Pendência' : 'Nova Pendência'}>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="type" checked={formData.type === 'income'} onChange={() => setFormData({ ...formData, type: 'income' })} />
              A receber (entrada)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="type" checked={formData.type === 'expense'} onChange={() => setFormData({ ...formData, type: 'expense' })} />
              A pagar (saída)
            </label>
          </div>

          <div>
            <label className="form-label">Forma de pagamento</label>
            <div className="flex gap-4 mt-1">
              {PAYMENT_METHODS.map((m) => (
                <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="payment_method"
                    checked={formData.payment_method === m.value}
                    onChange={() => setFormData({ ...formData, payment_method: m.value })}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          {!editingId && (
            <div>
              <label className="form-label">Pagamento</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="parcelado" checked={!formData.parcelado} onChange={() => setFormData({ ...formData, parcelado: false })} />
                  À vista
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="parcelado" checked={formData.parcelado} onChange={() => setFormData({ ...formData, parcelado: true })} />
                  Parcelado
                </label>
              </div>
            </div>
          )}

          {formData.parcelado && (
            <div>
              <Input
                label="Número de parcelas"
                type="number"
                min="2"
                step="1"
                required
                value={formData.installments}
                onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
              />
              {formData.amount && parseInt(formData.installments, 10) >= 2 && (
                <div className="text-xs text-muted mt-1">
                  {formData.installments}x de {formatCurrency(parseFloat(formData.amount) / parseInt(formData.installments, 10))} (vencendo mês a mês)
                </div>
              )}
            </div>
          )}

          <Input
            label="Nome do cliente (opcional)"
            placeholder="Ex: Juliana Chieepe"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          />

          <div>
            <label className="form-label">Descrição</label>
            <div className="flex gap-2 mt-1">
              <select
                value={descriptions.some((d) => d.text === formData.description) ? formData.description : '__custom__'}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setFormData({ ...formData, description: '' });
                  } else {
                    setFormData({ ...formData, description: e.target.value });
                  }
                }}
                style={{
                  flex: 1,
                  padding: 'var(--spacing-2) var(--spacing-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)',
                  fontFamily: 'inherit',
                  fontSize: '0.875rem',
                }}
              >
                <option value="__custom__">Digite uma nova descrição...</option>
                {descriptions.map((d) => (
                  <option key={d.id} value={d.text}>{d.text}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="Descrição da pendência"
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-full">
              <Input
                label={formData.parcelado ? 'Valor total (R$)' : 'Valor (R$)'}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>
            <div className="w-full">
              <Input
                label={formData.parcelado ? 'Vencimento da 1ª parcela' : 'Data de Vencimento'}
                type="date"
                required
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" isLoading={isSubmitting}>Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
