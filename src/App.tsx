import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Pending } from './pages/Pending';
import { Goals } from './pages/Goals';
import { Agent } from './pages/Agent';
import { Catalog } from './pages/Catalog';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="pending" element={<Pending />} />
            <Route path="goals" element={<Goals />} />
            <Route path="agent" element={<Agent />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="reports" element={<div className="p-6">Página de Relatórios (Em breve)</div>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
