import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient, setToastRef } from '@/lib/queryClient';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { lazy, Suspense, useEffect } from 'react';
import ContactsPage from '@/pages/ContactsPage';

const AuthPage = lazy(() => import('@/pages/AuthPage'));
const DesignSystemPage = lazy(() => import('@/pages/DesignSystemPage'));

function Spinner() {
  return (
    <div className="min-h-screen bg-(--surface-page) flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--text-primary) border-t-transparent" />
    </div>
  );
}

/** Only accessible when authenticated — redirects to /auth otherwise. */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  return user ? <>{children}</> : <Navigate to="/auth" replace />;
}

/** Only accessible when unauthenticated — redirects to /contacts otherwise. */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  return !user ? <>{children}</> : <Navigate to="/contacts" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/contacts" replace />} />
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <Suspense fallback={<Spinner />}>
              <AuthPage />
            </Suspense>
          </PublicRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <PrivateRoute>
            <ContactsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/design-system"
        element={
          <Suspense fallback={<Spinner />}>
            <DesignSystemPage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/contacts" replace />} />
    </Routes>
  );
}

/** Bridges the Toast context into the queryClient's MutationCache for global error toasts. */
function ToastBridge() {
  const { addToast } = useToast();
  useEffect(() => {
    setToastRef({ addToast });
    return () => setToastRef({});
  }, [addToast]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <ToastProvider>
                <ToastBridge />
                <AppRoutes />
              </ToastProvider>
            </AuthProvider>
        </ThemeProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
