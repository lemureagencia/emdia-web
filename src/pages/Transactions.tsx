import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { PAYMENT_METHODS, paymentMethodLabel, type PaymentMethod } from '../lib/installments';
import styles from './Transactions.module.css';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  status: 'paid' | 'pending';
  amount: number;
  description: string;
  category: string;
  service_type: string | null;
  created_at: string;
  due_date: string | null;
  payment_method: string | null;
  installment_group: string | null;
  installments: number;
  installment_number: number | null;
  goal_id: string | null;
}

interface Goal {
  id: string;
  title: string;
  current_amount: number;
}

interface Service {
  id: string;
  name: string;
}

// Linha exibida: transação solta OU grupo de parcelas (mostra a parcela atual)
interface TxRow {
  key: string;
  isGroup: boolean;
  current: Transaction;
  baseDesc: string;
  totalInstallments: number;
  remaining: number;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const stripParcela = (desc: string) => desc.replace(/\s*\(\d+\/\d+\)\s*$/, '');

export const Transactions = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Saldo em conta (manual)
  const [balanceInput, setBalanceInput] = useState('');
  const [savingBalance, setSavingBalance] = useState(false);
  const [balanceSaved, setBalanceSaved] = useState(false);

  // Metas (para destinar valor a uma meta)
  const [goals, setGoals] = useState<Goal[]>([]);

  // Serviços/Produtos (categorias criadas pelo cliente)
  const [services, setServices] = useState<Service[]>([]);
  const [newServiceName, setNewServiceName] = useState('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: 'expense' as 'income' | 'expense',
    status: 'paid' as 'paid' | 'pending',
    amount: '',
    description: '',
    category: '',
    service_type: '',
    date: new Date().toISOString().slice(0, 16),
    due_date: todayStr(),
    payment_method: 'pix' as PaymentMethod,
    parcelado: false,
    installments: '2',
    goal_id: '',
  });

  const fetchGoals = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('goals')
      .select('id, title, current_amount')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setGoals(data);
  };

  const fetchServices = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('services')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name', { ascending: true });
    if (data) setServices(data);
  };

  const handleCreateService = async () => {
    if (!user || !newServiceName.trim()) return;
    const { data, error } = await supabase
      .from('services')
      .insert({ user_id: user.id, name: newServiceName.trim() })
      .select('id, name')
      .single();
    if (!error && data) {
      setServices([...services, data]);
      setFormData({ ...formData, service_type: data.name });
      setNewServiceName('');
    }
  };

  // Soma/subtrai um valor do progresso de uma meta
  const adjustGoal = async (goalId: string, delta: number) => {
    const { data } = await supabase.from('goals').select('current_amount').eq('id', goalId).single();
    if (data) {
      await supabase.from('goals').update({ current_amount: Number(data.current_amount) + delta }).eq('id', goalId);
    }
  };

  const fetchBalance = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('current_balance')
      .eq('id', user.id)
      .single();
    if (data && data.current_balance != null) {
      setBalanceInput(String(data.current_balance));
    }
  };

  useEffect(() => {
    fetchBalance();
    fetchGoals();
    fetchServices();
  }, [user]);

  const handleSaveBalance = async () => {
    if (!user) return;
    setSavingBalance(true);
    setBalanceSaved(false);
    const { error } = await supabase
      .from('profiles')
      .update({ current_balance: balanceInput === '' ? 0 : parseFloat(balanceInput) })
      .eq('id', user.id);
    setSavingBalance(false);
    if (!error) {
      setBalanceSaved(true);
      setTimeout(() => setBalanceSaved(false), 2500);
    } else {
      alert('Erro ao salvar o saldo. Verifique se a coluna current_balance existe no Supabase.');
    }
  };

  const fetchTransactions = async () => {
    if (!user) return;
    setIsLoading(true);
    
    // Transações = apenas movimentações JÁ concluídas (pagas/recebidas).
    // Os itens pendentes ("a pagar"/"a receber") vivem na aba Pendências.
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'paid')
      .order('created_at', { ascending: false });

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', new Date(endDate).toISOString());
    }

    const { data, error } = await query;
    if (!error && data) {
      setTransactions(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTransactions();
  }, [user, startDate, endDate]);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta transação?')) return;

    const tx = transactions.find(t => t.id === id);
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (!error) {
      if (tx?.goal_id) {
        await adjustGoal(tx.goal_id, -Number(tx.amount));
        fetchGoals();
      }
      setTransactions(transactions.filter(t => t.id !== id));
    } else {
      alert('Erro ao excluir transação.');
    }
  };

  const handleDeleteGroup = async (group: string) => {
    if (!confirm('Excluir todas as parcelas deste parcelamento?')) return;
    const { error } = await supabase.from('transactions').delete().eq('installment_group', group);
    if (!error) {
      setTransactions(transactions.filter(t => t.installment_group !== group));
    } else {
      alert('Erro ao excluir parcelamento.');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({ type: 'expense', status: 'paid', amount: '', description: '', category: '', service_type: '', date: new Date().toISOString().slice(0, 16), due_date: todayStr(), payment_method: 'pix', parcelado: false, installments: '2', goal_id: '' });
    setNewServiceName('');
  };

  const closeModal = () => { setIsModalOpen(false); resetForm(); };
  const openCreate = () => { resetForm(); setIsModalOpen(true); };

  const openEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setFormData({
      type: tx.type,
      status: 'paid',
      amount: String(tx.amount),
      description: tx.description,
      category: tx.category ?? '',
      service_type: tx.service_type ?? '',
      date: new Date(tx.created_at).toISOString().slice(0, 16),
      due_date: todayStr(),
      payment_method: (tx.payment_method as PaymentMethod) ?? 'pix',
      parcelado: false,
      installments: '2',
      goal_id: tx.goal_id ?? '',
    });
    setIsModalOpen(true);
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    const total = parseFloat(formData.amount);
    const method = formData.payment_method;

    // Edição: atualiza apenas o registro selecionado (não reajusta metas)
    if (editingId) {
      const { error } = await supabase.from('transactions').update({
        type: formData.type,
        amount: total,
        description: formData.description,
        category: formData.category || null,
        service_type: formData.service_type || null,
        created_at: new Date(formData.date).toISOString(),
        paid_date: formData.date.slice(0, 10),
        payment_method: method,
      }).eq('id', editingId);
      setIsSubmitting(false);
      if (!error) { closeModal(); fetchTransactions(); }
      else alert('Erro ao salvar alterações.');
      return;
    }

    // Transações cria APENAS movimentações concluídas (status = 'paid').
    // Pendências e parcelamentos ficam na aba Pendências.
    const rows: Record<string, unknown>[] = [{
      user_id: user.id,
      type: formData.type,
      status: 'paid',
      amount: total,
      description: formData.description,
      category: formData.category || null,
      service_type: formData.service_type || null,
      created_at: new Date(formData.date).toISOString(),
      due_date: null,
      paid_date: formData.date.slice(0, 10),
      payment_method: method,
      installments: 1,
      goal_id: formData.goal_id || null,
    }];

    const { data, error } = await supabase.from('transactions').insert(rows).select();

    // Se destinou a uma meta, soma o valor no progresso da meta
    if (!error && formData.goal_id) {
      await adjustGoal(formData.goal_id, total);
      fetchGoals();
    }

    setIsSubmitting(false);

    if (!error && data) {
      closeModal();
      fetchTransactions();
    } else {
      alert('Erro ao adicionar transação.');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // Agrupa parcelas (mesmo installment_group) em uma única linha (mostra a parcela atual)
  const displayRows: TxRow[] = (() => {
    const groups = new Map<string, Transaction[]>();
    const rows: TxRow[] = [];
    for (const t of transactions) {
      if (t.installment_group) {
        const arr = groups.get(t.installment_group) ?? [];
        arr.push(t);
        groups.set(t.installment_group, arr);
      } else {
        rows.push({ key: t.id, isGroup: false, current: t, baseDesc: t.description, totalInstallments: 1, remaining: 0 });
      }
    }
    for (const [group, arr] of groups) {
      const sorted = [...arr].sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0));
      const unpaid = sorted.filter((t) => t.status === 'pending');
      const current = unpaid[0] ?? sorted[sorted.length - 1];
      rows.push({ key: group, isGroup: true, current, baseDesc: stripParcela(current.description), totalInstallments: current.installments, remaining: unpaid.length });
    }
    return rows.sort((a, b) => b.current.created_at.localeCompare(a.current.created_at));
  })();

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Transações</h1>
          <p className="text-muted">Gerencie suas entradas e saídas</p>
        </div>
        
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Data Inicial (Opcional)</label>
            <Input 
              type="datetime-local" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Data Final (Opcional)</label>
            <Input 
              type="datetime-local" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
            />
          </div>
          <Button onClick={openCreate} className="mt-auto">
            <Plus size={18} /> Nova Transação
          </Button>
        </div>
      </div>

      <Card style={{ marginBottom: 'var(--spacing-4)' }}>
        <div className={styles.balanceBar}>
          <div>
            <div className={styles.balanceLabel}>Saldo em conta hoje</div>
            <div className={styles.balanceHint}>
              Valor isolado: quanto você tem no banco hoje. Aparece no Painel como <strong>Saldo na Conta</strong> (não inclui receita esperada nem pendências).
            </div>
          </div>
          <div className={styles.balanceEditor}>
            <div className={styles.balanceInput}>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
              />
            </div>
            <Button onClick={handleSaveBalance} isLoading={savingBalance}>Salvar saldo</Button>
            {balanceSaved && <span className={styles.balanceSaved}>Salvo!</span>}
          </div>
        </div>
      </Card>

      <Card>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Data e Hora</th>
                <th>Tipo</th>
                <th>Situação</th>
                <th>Forma</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Carregando...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                    Nenhuma transação encontrada no período.
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => {
                  const tx = row.current;
                  return (
                  <tr key={row.key} className={tx.status === 'paid' ? styles.rowPaid : undefined}>
                    <td style={{ fontWeight: 500 }}>{tx.category || '-'}</td>
                    <td>
                      {row.isGroup ? `${row.baseDesc} (${tx.installment_number}/${row.totalInstallments})` : tx.description}
                      {row.isGroup && (
                        <div className={styles.balanceHint}>Parcelado em {row.totalInstallments}x • restam {row.remaining}</div>
                      )}
                    </td>
                    <td>
                      {row.isGroup
                        ? (tx.due_date ? format(parseISO(tx.due_date), 'dd/MM/yyyy') : '-')
                        : format(parseISO(tx.created_at), 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td>
                      <span className={clsx(styles.typeBadge, tx.type === 'income' ? styles.typeIncome : styles.typeExpense)}>
                        {tx.type === 'income' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {tx.type === 'income' ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                    <td>
                      {tx.status === 'paid' ? (
                        <span className={clsx(styles.typeBadge, styles.statusPaid)}>Pago</span>
                      ) : tx.due_date && tx.due_date < todayStr() ? (
                        <span className={clsx(styles.typeBadge, styles.statusOverdue)}>Vencido</span>
                      ) : (
                        <span className={clsx(styles.typeBadge, styles.statusPending)}>Pendente</span>
                      )}
                    </td>
                    <td>{paymentMethodLabel(tx.payment_method)}</td>
                    <td style={{ textAlign: 'right' }} className={tx.type === 'income' ? styles.amountIncome : styles.amountExpense}>
                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 'var(--spacing-1)' }}>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(tx)} aria-label="Editar" title="Editar">
                          <Pencil size={16} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => row.isGroup ? handleDeleteGroup(row.key) : handleDelete(tx.id)} aria-label="Excluir" title={row.isGroup ? 'Excluir parcelamento' : 'Excluir'}>
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

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingId ? 'Editar Transação' : 'Nova Transação'}>
        <form onSubmit={handleAddTransaction} className="flex flex-col gap-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                name="type" 
                value="income" 
                checked={formData.type === 'income'} 
                onChange={() => setFormData({...formData, type: 'income'})}
              />
              Entrada
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value="expense"
                checked={formData.type === 'expense'}
                onChange={() => setFormData({...formData, type: 'expense'})}
              />
              Saída
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

          <Input
            label="Descrição"
            placeholder="Ex: Serviço de vídeos"
            required
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
          />

          <div>
            <label className="form-label">Tipo de serviço/produto (opcional)</label>
            <div className="flex gap-2 mt-1">
              <select
                value={formData.service_type}
                onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
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
                <option value="">Nenhum</option>
                {services.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="Criar novo serviço..."
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateService(); } }}
              />
              <Button type="button" variant="secondary" onClick={handleCreateService} disabled={!newServiceName.trim()}>
                Criar
              </Button>
            </div>
            {formData.service_type && (
              <div className="text-xs text-muted mt-1">Serviço selecionado: <strong>{formData.service_type}</strong></div>
            )}
          </div>

          <div className="flex gap-4">
            <div className="w-full">
              <Input
                label="Valor (R$)"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                required
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
              />
            </div>
            <div className="w-full">
              <Input
                label={formData.type === 'income' ? 'Data do recebimento' : 'Data do pagamento'}
                type="datetime-local"
                required
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
          </div>

          <Input
            label="Nome do cliente (opcional)"
            placeholder="Ex: Juliana Chieepe"
            value={formData.category}
            onChange={(e) => setFormData({...formData, category: e.target.value})}
          />

          {!editingId && goals.length > 0 && (
            <div>
              <label className="form-label">Destinar a uma meta (opcional)</label>
              <select
                value={formData.goal_id}
                onChange={(e) => setFormData({ ...formData, goal_id: e.target.value })}
                style={{
                  width: '100%',
                  marginTop: 'var(--spacing-1)',
                  padding: 'var(--spacing-2) var(--spacing-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)',
                  fontFamily: 'inherit',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">Nenhuma</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
              {formData.goal_id && (
                <div className="text-xs text-muted mt-1">O valor será somado ao progresso desta meta.</div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" isLoading={isSubmitting}>Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
