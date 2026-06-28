import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PlanActivation } from '../../pages/PlanActivation';
import styles from './DashboardLayout.module.css';

export const DashboardLayout = () => {
  const { user, isLoading, profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (profile && !profile.plan && !profile.is_admin) {
    return <PlanActivation />;
  }

  return (
    <div className={styles.layout}>
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={styles.main}>
        <Header onMenuToggle={() => setSidebarOpen(o => !o)} />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
