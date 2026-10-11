import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, RequireAuth } from './context/AuthContext.jsx';
import { AppShell } from './components/AppShell.jsx';
import { LoginPage } from './pages/Login.jsx';
import { RegisterPage } from './pages/Register.jsx';
import { DashboardPage } from './pages/Dashboard.jsx';
import { TicketsPage } from './pages/Tickets.jsx';
import { TicketDetailPage } from './pages/TicketDetail.jsx';
import { NewTicketPage } from './pages/NewTicket.jsx';
import { TeamPage } from './pages/Team.jsx';
import { AnalyticsPage } from './pages/Analytics.jsx';
import { SettingsPage } from './pages/Settings.jsx';
import { Button, EmptyState } from './components/ui.jsx';

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="surface max-w-md p-6 text-center">
        <EmptyState
          icon="🧭"
          title="That page does not exist"
          description="The link may be out of date, or the ticket was removed."
          action={
            <Link to="/">
              <Button variant="primary">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    </div>
  );
}

/** Signed-in users don't need to see the auth screens again. */
function PublicOnly({ children }) {
  const { isAuthenticated, status } = useAuth();
  if (status === 'loading') return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <RegisterPage />
          </PublicOnly>
        }
      />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="/new" element={<NewTicketPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route
          path="/analytics"
          element={
            <RequireAuth roles={['ADMIN', 'MANAGER']}>
              <AnalyticsPage />
            </RequireAuth>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
