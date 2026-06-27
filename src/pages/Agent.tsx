import { useState, useEffect } from 'react';
import { Bot, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import styles from './Agent.module.css';

export const Agent = () => {
  const { user } = useAuth();
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.phone) setPhone(data.phone);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from('profiles')
      .update({ phone: phone.replace(/\D/g, '') })
      .eq('id', user.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      alert('Erro ao salvar o número.');
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
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepContent}>
                <h3 className={styles.stepTitle}>Cadastre seu número de WhatsApp</h3>
                <p className={styles.stepDescription}>
                  É assim que o agente sabe que as mensagens são suas. Informe o número (com DDD)
                  do WhatsApp que você vai usar para falar com o agente.
                </p>
                <div className={styles.configValueGroup}>
                  <div style={{ flex: 1 }}>
                    <Input
                      type="tel"
                      placeholder="Ex: 11 91234-5678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleSave} isLoading={saving}>Salvar número</Button>
                  {saved && (
                    <span className="text-success" style={{ alignSelf: 'center' }}>
                      <Check size={18} />
                    </span>
                  )}
                </div>
              </div>
            </div>

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
