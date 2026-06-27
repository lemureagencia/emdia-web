import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import styles from './Goals.module.css';

interface Goal {
  id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
}

export const Goals = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    target_amount: '',
    current_amount: '',
    deadline: ''
  });

  const fetchGoals = async () => {
    if (!user) return;
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setGoals(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchGoals();
  }, [user]);

  const resetForm = () => {
    setEditingId(null);
    setFormData({ title: '', target_amount: '', current_amount: '', deadline: '' });
  };

  const openEdit = (goal: Goal) => {
    setEditingId(goal.id);
    setFormData({
      title: goal.title,
      target_amount: String(goal.target_amount),
      current_amount: String(goal.current_amount),
      deadline: goal.deadline ?? '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta meta?')) return;
    
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (!error) {
      setGoals(goals.filter(g => g.id !== id));
    } else {
      alert('Erro ao excluir meta.');
    }
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    if (editingId) {
      const { error } = await supabase.from('goals').update({
        title: formData.title,
        target_amount: parseFloat(formData.target_amount),
        current_amount: formData.current_amount ? parseFloat(formData.current_amount) : 0,
        deadline: formData.deadline || null,
      }).eq('id', editingId);
      setIsSubmitting(false);
      if (!error) {
        closeModal();
        fetchGoals();
      } else {
        alert('Erro ao salvar alterações.');
      }
      return;
    }

    const { data, error } = await supabase.from('goals').insert([{
      user_id: user.id,
      title: formData.title,
      target_amount: parseFloat(formData.target_amount),
      current_amount: formData.current_amount ? parseFloat(formData.current_amount) : 0,
      deadline: formData.deadline || null
    }]).select();

    setIsSubmitting(false);

    if (!error && data) {
      closeModal();
      fetchGoals();
    } else {
      alert('Erro ao adicionar meta.');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Metas Financeiras</h1>
          <p className="text-muted">Acompanhe seus objetivos e economias</p>
        </div>
        <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
          <Plus size={18} /> Nova Meta
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted">Carregando metas...</div>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="text-center py-10 text-muted">
            Você ainda não tem metas cadastradas.
          </CardContent>
        </Card>
      ) : (
        <div className={styles.goalsGrid}>
          {goals.map((goal) => {
            const progress = Math.min((goal.current_amount / goal.target_amount) * 100, 100);
            return (
              <Card key={goal.id} className={styles.goalCard}>
                <CardContent className="flex flex-col h-full">
                  <div className={styles.goalHeader}>
                    <div>
                      <div className={styles.goalTitle}>{goal.title}</div>
                      {goal.deadline && (
                        <div className={styles.goalDeadline}>
                          Prazo: {format(parseISO(goal.deadline), 'dd/MM/yyyy')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.progressContainer}>
                    <div className={styles.progressStats}>
                      <span className={styles.currentAmount}>{formatCurrency(goal.current_amount)}</span>
                      <span className={styles.targetAmount}>{formatCurrency(goal.target_amount)}</span>
                    </div>
                    <div className={styles.progressBarBg}>
                      <div 
                        className={styles.progressBarFill} 
                        style={{ width: `${progress}%`, backgroundColor: progress >= 100 ? 'var(--color-success)' : 'var(--color-accent)' }} 
                      />
                    </div>
                  </div>

                  <div className={styles.goalFooter}>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(goal)} aria-label="Editar" title="Editar">
                      <Pencil size={16} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(goal.id)} aria-label="Excluir">
                      <Trash2 size={16} className="text-danger" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editingId ? 'Editar Meta' : 'Nova Meta'}>
        <form onSubmit={handleAddGoal} className="flex flex-col gap-4">
          <Input 
            label="Título da Meta" 
            placeholder="Ex: Viagem para Europa, Reserva de Emergência" 
            required
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
          />
          
          <div className="flex gap-4">
            <div className="w-full">
              <Input 
                label="Valor Objetivo (R$)" 
                type="number" 
                step="0.01" 
                min="0"
                placeholder="0.00" 
                required
                value={formData.target_amount}
                onChange={(e) => setFormData({...formData, target_amount: e.target.value})}
              />
            </div>
            <div className="w-full">
              <Input 
                label="Valor Atual Guardado (R$)" 
                type="number" 
                step="0.01" 
                min="0"
                placeholder="0.00"
                value={formData.current_amount}
                onChange={(e) => setFormData({...formData, current_amount: e.target.value})}
              />
            </div>
          </div>

          <Input 
            label="Data Limite (Opcional)" 
            type="date" 
            value={formData.deadline}
            onChange={(e) => setFormData({...formData, deadline: e.target.value})}
          />
          
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" isLoading={isSubmitting}>Salvar Meta</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
