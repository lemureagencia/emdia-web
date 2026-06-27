import { useState, useEffect } from 'react';
import { Bot, Check, Plus, Trash2, Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import styles from './Agent.module.css';

type Plan = 'mensal' | 'semestral' | 'anual';

const PLAN_LIMITS: Record<Plan, number> = {
  mensal: 1,
  semestral: 2,
  anual: 4,
};

const PLAN_LABELS: Record<Plan, string> = {
  mensal: 'Mensal',
  semestral: 'Semestral',
  anual: 'Anual',
};

const ADMIN_LIMIT = 999;

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export const Agent = () => {
  const { user } = useAuth();
  const [phones, setPhones] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan>('mensal');
  const [isAdmin, setIsAdmin] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const limit = isAdmin ? ADMIN_LIMIT : PLAN_LIMITS[plan];

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg(null);
    setTimeout(() => setErrorMsg(null), 4000);
  };

  useEffect(() => {
    if (!user) return;

    supabase
      .from('profiles')
      .select('plan, is_admin')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.plan) setPlan(data.plan as Plan);
        if (data?.is_admin) setIsAdmin(true);
      });

    supabase
      .from('user_phones')
      .select('phone')
      .eq('user_id', user.id)
      .order('created_at')
      .then(({ data }) => {
        if (data) setPhones(data.map((r) => r.phone));
      });
  }, [user]);

  const handleAdd = async () => {
    if (!user) return;
    const cleaned = newPhone.replace(/\D/g, '');
    if (!cleaned) return;

    if (phones.length >= limit) {
      showError(`Limite de ${limit} número(s) atingido no plano ${PLAN_LABELS[plan]}.`);
      return;
    }

    setAdding(true);
    const { error } = await supabase
      .from('user_phones')
      .insert({ user_id: user.id, phone: cleaned });
    setAdding(false);

    if (!error) {
      setPhones((prev) => [...prev, cleaned]);
      setNewPhone('');
      showSuccess('Número salvo com sucesso!');
    } else if (error.code === '23505') {
      showError('Este número já está cadastrado.');
    } else {
      showError('Erro ao salvar o número.');
    }
  };

  const handleRemove = async (phone: string) => {
    if (!user) return;
    setRemoving(phone);
    const { error } = await supabase
      .from('user_phones')
      .delete()
      .eq('user_id', user.id)
      .eq('phone', phone);
    setRemoving(null);

    if (!error) {
      setPhones((prev) => prev.filter((p) => p !== phone));
      showSuccess('Número removido.');
    } else {
      showError('Erro ao remover número.');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Conectar Agente de IA</h1>
        <p className="text-muted">Controle suas finanças pelo WhatsApp.</p>
      </div>

      <Card className={styles.card}>
        <CardContent className="p-8">
          <div className={styles.stepContainer}>

            {/* Passo 1: Números */}
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepContent}>
                <div className={styles.stepTitleRow}>
                  <h3 className={styles.stepTitle}>Cadastre seu número de WhatsApp</h3>
                  {isAdmin ? (
                    <span className={`${styles.planBadge} ${styles.plan_admin}`}>Admin</span>
                  ) : (
                    <span className={`${styles.planBadge} ${styles[`plan_${plan}`]}`}>
                      Plano {PLAN_LABELS[plan]}
                    </span>
                  )}
                </div>
                <p className={styles.stepDescription}>
                  É assim que o agente sabe que as mensagens são suas. Informe o número (com DDD)
                  do WhatsApp que você vai usar para falar com o agente.
                </p>

                {/* Lista de números cadastrados */}
                {phones.length > 0 && (
                  <div className={styles.phoneList}>
                    {phones.map((phone) => (
                      <div key={phone} className={styles.phoneItem}>
                        <Phone size={14} />
                        <span>{formatPhone(phone)}</span>
                        <button
                          className={styles.removeBtn}
                          onClick={() => handleRemove(phone)}
                          disabled={removing === phone}
                          title="Remover número"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Contador de slots */}
                <p className={styles.slotInfo}>
                  {isAdmin
                    ? `${phones.length} número(s) cadastrado(s) · acesso ilimitado`
                    : `${phones.length} de ${limit} número(s) do plano utilizados`}
                </p>

                {/* Formulário para adicionar número */}
                {phones.length < limit ? (
                  <div className={styles.configValueGroup}>
                    <div style={{ flex: 1 }}>
                      <Input
                        type="tel"
                        placeholder="Ex: 55 71 98191-3493"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                      />
                    </div>
                    <Button onClick={handleAdd} isLoading={adding}>
                      <span className={styles.btnInner}>
                        <Plus size={15} />
                        Adicionar
                      </span>
                    </Button>
                  </div>
                ) : (
                  <div className={styles.limitReached}>
                    <span>Limite de números do plano {PLAN_LABELS[plan]} atingido.</span>
                    <span className={styles.upgradeHint}>
                      Entre em contato para fazer upgrade e adicionar mais números.
                    </span>
                  </div>
                )}

                {/* Mensagens de feedback */}
                {successMsg && (
                  <div className={styles.successBanner}>
                    <Check size={15} />
                    {successMsg}
                  </div>
                )}
                {errorMsg && (
                  <div className={styles.errorBanner}>
                    {errorMsg}
                  </div>
                )}
              </div>
            </div>

            {/* Passo 2: Exemplos */}
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepContent}>
                <h3 className={styles.stepTitle}>Mande uma mensagem para o agente</h3>
                <p className={styles.stepDescription}>Exemplos do que você pode escrever:</p>
                <ul className="list-disc list-inside text-sm text-muted space-y-2 mb-4">
                  <li>"Paguei 150 de luz no pix"</li>
                  <li>"Recebi 2000 do cliente"</li>
                  <li>"Vou pagar 300 de internet dia 10" (conta a pagar)</li>
                  <li>"Meu saldo é 3000"</li>
                  <li>"Qual meu saldo?" / "Resumo"</li>
                </ul>
              </div>
            </div>

            {/* Pronto */}
            <div className={styles.step}>
              <div className={styles.stepNumber}>
                <Bot size={18} />
              </div>
              <div className={styles.stepContent}>
                <h3 className={styles.stepTitle}>Pronto!</h3>
                <p className={styles.stepDescription}>
                  O agente registra tudo automaticamente e você vê no painel na hora. Entradas e
                  saídas pagas ajustam o <strong>Saldo na Conta</strong>; contas futuras viram
                  pendências.
                </p>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>
    </div>
  );
};
