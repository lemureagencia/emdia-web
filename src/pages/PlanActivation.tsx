import { useState } from 'react';
import { RefreshCw, LogOut, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import styles from './PlanActivation.module.css';

const PLANS = [
  {
    key: 'mensal',
    name: 'Mensal',
    price: 'R$19,90',
    period: '/mês',
    phones: '1 número de WhatsApp',
    link: 'https://pay.kiwify.com.br/o2Lu6FO',
    highlight: false,
  },
  {
    key: 'semestral',
    name: 'Semestral',
    price: 'R$97,00',
    period: '/semestre',
    phones: '2 números de WhatsApp',
    link: 'https://pay.kiwify.com.br/Q8k2XCe',
    highlight: true,
  },
  {
    key: 'anual',
    name: 'Anual',
    price: 'R$120,00',
    period: '/ano',
    phones: '4 números de WhatsApp',
    link: 'https://pay.kiwify.com.br/rxb1agY',
    highlight: false,
  },
];

const FEATURES = [
  'Controle financeiro completo',
  'Agente de IA no WhatsApp',
  'Transações e pendências',
  'Metas financeiras',
  'Catálogo de descrições',
];

export const PlanActivation = () => {
  const { signOut, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>EmDia</h1>
        <p className={styles.subtitle}>Escolha seu plano para começar</p>
      </div>

      <div className={styles.features}>
        {FEATURES.map((f) => (
          <span key={f} className={styles.featureItem}>
            <Check size={14} />
            {f}
          </span>
        ))}
      </div>

      <div className={styles.plans}>
        {PLANS.map((plan) => (
          <div key={plan.key} className={`${styles.planCard} ${plan.highlight ? styles.highlighted : ''}`}>
            {plan.highlight && <div className={styles.badge}>Mais popular</div>}
            <h2 className={styles.planName}>{plan.name}</h2>
            <div className={styles.planPrice}>
              {plan.price}
              <span className={styles.planPeriod}>{plan.period}</span>
            </div>
            <p className={styles.planPhones}>{plan.phones}</p>
            <a href={plan.link} target="_blank" rel="noopener noreferrer" className={styles.planBtn}>
              Assinar agora
            </a>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <Button variant="outline" onClick={handleRefresh} isLoading={refreshing}>
          <RefreshCw size={15} />
          Já comprei — verificar ativação
        </Button>
        <Button variant="ghost" onClick={signOut}>
          <LogOut size={15} />
          Sair
        </Button>
      </div>
    </div>
  );
};
