import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowRightLeft, CalendarClock, Target, FileText, LogOut, Bot, BookOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Sidebar.module.css';

const navItems = [
  { path: '/', label: 'Painel', icon: LayoutDashboard },
  { path: '/transactions', label: 'Transações', icon: ArrowRightLeft },
  { path: '/pending', label: 'Pendências', icon: CalendarClock },
  { path: '/goals', label: 'Metas', icon: Target },
  { path: '/catalog', label: 'Catálogo', icon: BookOpen },
  { path: '/reports', label: 'Relatórios', icon: FileText },
  { path: '/agent', label: 'Conectar Agente', icon: Bot },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { signOut } = useAuth();

  return (
    <aside className={clsx(styles.sidebar, isOpen && styles.open)}>
      <div className={styles.logo}>
        <img src="/logo.png" alt="EmDia" className={clsx(styles.logoImg, "logo-light")} />
        <img src="/logo-dark.png" alt="EmDia" className={clsx(styles.logoImg, "logo-dark")} />
      </div>
      <nav className={styles.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={({ isActive }) => clsx(styles.navItem, isActive && styles.active)}
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className={styles.footer}>
        <button onClick={signOut} className={styles.logoutBtn}>
          <LogOut size={20} />
          Sair
        </button>
      </div>
    </aside>
  );
};
