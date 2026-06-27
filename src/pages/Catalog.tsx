import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';
import styles from './Goals.module.css';

interface Description {
  id: string;
  text: string;
}

export const Catalog = () => {
  const { user } = useAuth();
  const [descriptions, setDescriptions] = useState<Description[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const fetchDescriptions = async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from('descriptions')
      .select('id, text')
      .eq('user_id', user.id)
      .order('text', { ascending: true });
    if (data) setDescriptions(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDescriptions();
  }, [user]);

  const isDuplicate = (text: string, excludeId?: string) =>
    descriptions.some(
      (d) => d.id !== excludeId && d.text.toLowerCase() === text.trim().toLowerCase()
    );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newText.trim()) return;
    if (isDuplicate(newText)) {
      alert('Essa descrição já está no catálogo.');
      return;
    }
    setIsAdding(true);
    const { data, error } = await supabase
      .from('descriptions')
      .insert({ user_id: user.id, text: newText.trim() })
      .select('id, text')
      .single();
    setIsAdding(false);
    if (!error && data) {
      setDescriptions(
        [...descriptions, data].sort((a, b) => a.text.localeCompare(b.text, 'pt-BR'))
      );
      setNewText('');
    } else {
      alert('Erro ao adicionar descrição.');
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!user || !editText.trim()) return;
    if (isDuplicate(editText, id)) {
      alert('Essa descrição já existe no catálogo.');
      return;
    }
    const { error } = await supabase
      .from('descriptions')
      .update({ text: editText.trim() })
      .eq('id', id);
    if (!error) {
      setDescriptions(
        descriptions
          .map((d) => (d.id === id ? { ...d, text: editText.trim() } : d))
          .sort((a, b) => a.text.localeCompare(b.text, 'pt-BR'))
      );
      setEditingId(null);
    } else {
      alert('Erro ao salvar alteração.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta descrição do catálogo?')) return;
    const { error } = await supabase.from('descriptions').delete().eq('id', id);
    if (!error) {
      setDescriptions(descriptions.filter((d) => d.id !== id));
    } else {
      alert('Erro ao remover descrição.');
    }
  };

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Catálogo de Descrições</h1>
          <p className="text-muted">
            Cadastre descrições padrão (produtos, serviços, tipos de pendência) para usar nos
            lançamentos e no WhatsApp.
          </p>
        </div>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <Input
              placeholder="Ex.: Tráfego Pago, Criação de Site, Mensalidade..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button type="submit" disabled={isAdding || !newText.trim()}>
              <Plus size={16} />
              Adicionar
            </Button>
          </form>

          {isLoading ? (
            <p className="text-muted">Carregando...</p>
          ) : descriptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--color-text-muted)' }}>
              <p>Nenhuma descrição cadastrada.</p>
              <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Adicione acima para usar nos lançamentos e no WhatsApp.
              </p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {descriptions.map((d) => (
                <li
                  key={d.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                  }}
                >
                  {editingId === d.id ? (
                    <>
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(d.id); }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        style={{ flex: 1 }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(d.id)}
                        title="Salvar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-success)', display: 'flex', padding: '4px' }}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        title="Cancelar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: '4px' }}
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: '0.875rem' }}>{d.text}</span>
                      <button
                        type="button"
                        onClick={() => { setEditingId(d.id); setEditText(d.text); }}
                        title="Editar"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: '4px' }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id)}
                        title="Remover"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: '4px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
