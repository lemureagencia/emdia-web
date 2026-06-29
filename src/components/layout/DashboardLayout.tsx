import { useState, useMemo } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PlanActivation } from '../../pages/PlanActivation';
import styles from './DashboardLayout.module.css';

const PLAN_LINKS: Record<string, string> = {
  mensal:    'https://pay.kiwify.com.br/o2Lu6FO',
  semestral: 'https://pay.kiwify.com.br/Q8k2XCe',
  anual:     'https://pay.kiwify.com.br/rxb1agY',
};

export const DashboardLayout = () => {
  const { user, isLoading, profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const daysUntilExpiry = useMemo(() => {
    if (!profile?.plan_expires_at || profile.is_admin) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(profile.plan_expires_at);
    expiry.setHours(0, 0, 0, 0);
    return Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  }, [profile]);

  const showBanner =
    !bannerDismissed &&
    daysUntilExpiry !== null &&
    daysUntilExpiry >= 0 &&
    daysUntilExpiry <= 2;

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

  const renewLink = PLAN_LINKS[profile?.plan ?? 'mensal'];

  return (
    <div className={styles.layout}>
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={styles.main}>
        <Header onMenuToggle={() => setSidebarOpen(o => !o)} />
        {showBanner && (
          <div className={styles.bannerDanger}>
            <AlertTriangle size={15} />
            <span>
              {daysUntilExpiry === 0
                ? 'Seu plano vence hoje!'
                : `Seu plano vence em ${daysUntilExpiry} dia${daysUntilExpiry === 1 ? '' : 's'}.`}
              {' '}
              <a href={renewLink} target="_blank" rel="noopener noreferrer" className={styles.bannerLink}>
                Renovar agora →
              </a>
            </span>
            <button className={styles.bannerClose} onClick={() => setBannerDismissed(true)} aria-label="Fechar">
              <X size={14} />
            </button>
          </div>
        )}
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
