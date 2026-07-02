import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, AlertTriangle, Target } from 'lucide-react';
import { format, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx } from 'clsx';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import styles from './Dashboard.module.css';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  created_at: string;
}

interface PendingRow {
  type: 'income' | 'expense';
  amount: number;
  due_date: string | null;
  installment_group: string | null;
}

interface PaidRow {
  type: 'income' | 'expense';
  amount: number;
  paid_date: string | null;
  created_at: string;
}

interface MonthlyData {
  name: string;
  income: number;
  expense: number;
}

// Agrega os lançamentos pagos nos últimos 7 meses (mês atual incluso) para os gráficos.
const buildMonthlyChartData = (paid: PaidRow[]): MonthlyData[] => {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = subMonths(today, 6 - i);
    const monthKey = format(d, 'yyyy-MM');
    const label = format(d, 'MMM', { locale: ptBR });
    const ofMonth = paid.filter((p) => (p.paid_date ?? p.created_at ?? '').slice(0, 7) === monthKey);
    return {
      name: label.charAt(0).toUpperCase() + label.slice(1),
      income: ofMonth.filter((p) => p.type === 'income').reduce((s, p) => s + Number(p.amount), 0),
      expense: ofMonth.filter((p) => p.type === 'expense').reduce((s, p) => s + Number(p.amount), 0),
    };
  });
};

export const Dashboard = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [paid, setPaid] = useState<PaidRow[]>([]);
  const [accountBalance, setAccountBalance] = useState(0);
  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [editingBudget, setEditingBudget] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;

      const [recent, pendingRes, paidRes, profileRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('transactions')
          .select('type, amount, due_date, installment_group')
          .eq('user_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('transactions')
          .select('type, amount, paid_date, created_at')
          .eq('user_id', user.id)
          .eq('status', 'paid'),
        supabase
          .from('profiles')
          .select('current_balance, monthly_budget')
          .eq('id', user.id)
          .single(),
      ]);

      if (!recent.error && recent.data) setTransactions(recent.data);
      if (!pendingRes.error && pendingRes.data) setPending(pendingRes.data);
      if (!paidRes.error && paidRes.data) setPaid(paidRes.data);
      if (!profileRes.error && profileRes.data) {
        if (profileRes.data.current_balance != null) setAccountBalance(Number(profileRes.data.current_balance));
        setMonthlyBudget(profileRes.data.monthly_budget != null ? Number(profileRes.data.monthly_budget) : null);
      }
      setIsLoading(false);
    };

    fetchDashboardData();
  }, [user]);

  const saveBudget = async (value: number | null) => {
    if (!user) return;
    setSavingBudget(true);
    const { error } = await supabase.from('profiles').update({ monthly_budget: value }).eq('id', user.id);
    if (!error) {
      setMonthlyBudget(value);
      setEditingBudget(false);
      setBudgetInput('');
    }
    setSavingBudget(false);
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const eomStr = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  // Painel = só o que vence NESTE mês (ou antes / sem data); parcelas de meses futuros não somam
  const currentOrOverdue = (p: PendingRow) => !p.due_date || p.due_date <= eomStr;
  const expectedIncome = pending.filter((p) => p.type === 'income' && currentOrOverdue(p)).reduce((s, p) => s + Number(p.amount), 0);
  const toPay = pending.filter((p) => p.type === 'expense' && currentOrOverdue(p)).reduce((s, p) => s + Number(p.amount), 0);
  const overdueIncome = pending.filter((p) => p.type === 'income' && p.due_date && p.due_date < todayStr);
  const overdueExpense = pending.filter((p) => p.type === 'expense' && p.due_date && p.due_date < todayStr);
  const overdueIncomeTotal = overdueIncome.reduce((s, p) => s + Number(p.amount), 0);
  const overdueExpenseTotal = overdueExpense.reduce((s, p) => s + Number(p.amount), 0);

  // Saldo na Conta = valor informado manualmente ("quanto tenho em conta hoje")
  const totalBalance = accountBalance;
  // Receitas / Despesas = totais reais dos lançamentos pagos
  const totalIncome = paid.filter((p) => p.type === 'income').reduce((s, p) => s + Number(p.amount), 0);
  const totalExpense = paid.filter((p) => p.type === 'expense').reduce((s, p) => s + Number(p.amount), 0);
  const chartData = buildMonthlyChartData(paid);

  // Controle de gastos = saídas pagas do mês atual vs teto definido
  const monthKey = format(new Date(), 'yyyy-MM');
  const spentThisMonth = paid
    .filter((p) => p.type === 'expense' && (p.paid_date ?? p.created_at ?? '').slice(0, 7) === monthKey)
    .reduce((s, p) => s + Number(p.amount), 0);
  const budgetPct = monthlyBudget && monthlyBudget > 0 ? Math.min(100, Math.round((spentThisMonth / monthlyBudget) * 100)) : 0;
  const budgetOver = monthlyBudget != null && spentThisMonth > monthlyBudget;
  const budgetRemaining = (monthlyBudget ?? 0) - spentThisMonth;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Painel</h1>
        <div className={styles.dateRange}>{format(new Date(), 'MMMM yyyy', { locale: ptBR })}</div>
      </div>

      <div className={styles.summaryGrid}>
        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <Wallet size={16} /> Saldo na Conta
            </div>
            <div className={styles.summaryValue}>{formatCurrency(totalBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <ArrowUpRight size={16} className={styles.success} /> Entradas
            </div>
            <div className={styles.summaryValue}>{formatCurrency(totalIncome)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <ArrowDownRight size={16} className={styles.danger} /> Saídas
            </div>
            <div className={styles.summaryValue}>{formatCurrency(totalExpense)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <Target size={16} /> Controle de Gastos
            </div>

            {monthlyBudget == null && !editingBudget && (
              <>
                <div className={styles.summaryValue}>—</div>
                <button className={styles.budgetEditBtn} onClick={() => { setBudgetInput(''); setEditingBudget(true); }}>
                  Definir teto
                </button>
              </>
            )}

            {editingBudget && (
              <div className={styles.budgetFormCompact}>
                <div className={styles.budgetInputWrap}>
                  <span>R$</span>
                  <input
                    type="number" inputMode="decimal" placeholder="3000" autoFocus
                    value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveBudget(Number(budgetInput) || 0); if (e.key === 'Escape') setEditingBudget(false); }}
                  />
                </div>
                <div className={styles.budgetFormActions}>
                  <Button size="sm" onClick={() => saveBudget(Number(budgetInput) || 0)} isLoading={savingBudget} disabled={!budgetInput}>Salvar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingBudget(false)}>Cancelar</Button>
                  {monthlyBudget != null && (
                    <Button size="sm" variant="ghost" onClick={() => saveBudget(null)}>Remover</Button>
                  )}
                </div>
              </div>
            )}

            {monthlyBudget != null && !editingBudget && (
              <>
                <div className={styles.summaryValue}>
                  <span className={clsx(budgetOver && styles.danger)}>{formatCurrency(spentThisMonth)}</span>
                  <span className={styles.budgetOf}> / {formatCurrency(monthlyBudget)}</span>
                </div>
                <div className={styles.budgetBarTrack}>
                  <div
                    className={clsx(styles.budgetBarFill, budgetOver ? styles.budgetBarOver : budgetPct >= 80 && styles.budgetBarWarn)}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
                <div className={styles.budgetHint}>
                  {budgetOver
                    ? <span className={styles.danger}>⚠️ {formatCurrency(spentThisMonth - monthlyBudget)} acima</span>
                    : <span className="text-muted">Resta {formatCurrency(budgetRemaining)}</span>}
                  <button className={styles.budgetEditInline} onClick={() => { setBudgetInput(String(monthlyBudget)); setEditingBudget(true); }}>
                    editar
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={styles.header} style={{ marginBottom: 'var(--spacing-4)' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Pendências do mês</h2>
        <Link to="/pending" className="text-sm">Ver tudo →</Link>
      </div>
      <div className={styles.summaryGrid}>
        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <TrendingUp size={16} className={styles.success} /> A Receber
            </div>
            <div className={clsx(styles.summaryValue, styles.success)}>{formatCurrency(expectedIncome)}</div>
            <div className="text-xs text-muted">entradas a receber neste mês</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <Wallet size={16} className={styles.danger} /> Contas a Pagar
            </div>
            <div className={clsx(styles.summaryValue, styles.danger)}>{formatCurrency(toPay)}</div>
            <div className="text-xs text-muted">a pagar neste mês</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <AlertTriangle size={16} className={styles.warning} /> Vencidos a Receber
            </div>
            <div className={clsx(styles.summaryValue, styles.warning)}>{formatCurrency(overdueIncomeTotal)}</div>
            <div className="text-xs text-muted">{overdueIncome.length} pendência(s) em atraso</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className={styles.summaryCard}>
            <div className={styles.summaryTitle}>
              <AlertTriangle size={16} className={styles.danger} /> Vencidos a Pagar
            </div>
            <div className={clsx(styles.summaryValue, styles.danger)}>{formatCurrency(overdueExpenseTotal)}</div>
            <div className="text-xs text-muted">{overdueExpense.length} pendência(s) em atraso</div>
          </CardContent>
        </Card>
      </div>

      <div className={styles.chartsGrid}>
        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Visão do Fluxo de Caixa</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R$${value}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}
                    itemStyle={{ color: 'var(--color-text)' }}
                  />
                  <Area type="monotone" dataKey="income" stroke="var(--color-success)" fillOpacity={1} fill="url(#colorIncome)" />
                  <Area type="monotone" dataKey="expense" stroke="var(--color-danger)" fillOpacity={1} fill="url(#colorExpense)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Entradas vs Saídas</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.slice(-1)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{fill: 'var(--color-surface-hover)'}} contentStyle={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-border)' }} />
                  <Bar dataKey="income" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" fill="var(--color-danger)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={styles.recentTransactions}>
        <Card>
          <CardHeader>
            <CardTitle>Transações Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted text-sm">Carregando transações...</div>
            ) : transactions.length === 0 ? (
              <div className="text-muted text-sm text-center py-4">Nenhuma transação recente.</div>
            ) : (
              <div className={styles.transactionList}>
                {transactions.map((tx) => (
                  <div key={tx.id} className={styles.transactionItem}>
                    <div className={styles.transactionInfo}>
                      <div className={clsx(styles.transactionIcon, tx.type === 'income' ? styles.iconIncome : styles.iconExpense)}>
                        {tx.type === 'income' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                      </div>
                      <div className={styles.transactionDetails}>
                        <span className={styles.transactionDesc}>{tx.description}</span>
                        <span className={styles.transactionDate}>{format(new Date(tx.created_at), 'dd MMM yyyy', { locale: ptBR })}</span>
                      </div>
                    </div>
                    <div className={clsx(styles.transactionAmount, tx.type === 'income' ? styles.success : styles.danger)}>
                      {tx.type === 'income' ? '+' : '-'} {formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
