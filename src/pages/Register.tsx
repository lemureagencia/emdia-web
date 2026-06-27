import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import styles from './Auth.module.css';

export const Register = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        },
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      // Supabase auto-logins if email confirmation is off, or requires confirmation
      // We will redirect to dashboard
      navigate('/');
    }
  };

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <CardHeader>
          <div className={styles.logo}>
            <img src="/logo.png" alt="EmDia" className={clsx(styles.logoImg, "logo-light")} />
            <img src="/logo-dark.png" alt="EmDia" className={clsx(styles.logoImg, "logo-dark")} />
          </div>
          <CardTitle>Criar uma conta</CardTitle>
          <CardDescription>Comece a organizar suas finanças hoje</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className={styles.form}>
            {error && <div className="text-sm text-danger">{error}</div>}
            <Input
              label="Nome completo"
              type="text"
              placeholder="João da Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="E-mail"
              type="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Senha"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <Button type="submit" className="w-full" isLoading={isLoading}>
              Criar conta
            </Button>
          </form>
          <div className={styles.link}>
            Já tem uma conta? <Link to="/login">Entrar</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
