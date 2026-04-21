import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/lib/getErrorMessage';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const registerSchema = loginSchema.extend({
  displayName: z.string().trim().min(1, 'Name is required'),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const { login, register: registerUser } = useAuth();
  const navigate = useNavigate();

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', displayName: '' },
  });

  const handleLogin = async (values: LoginValues) => {
    setError('');
    try {
      await login(values.email, values.password);
      navigate('/contacts', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Invalid email or password'));
    }
  };

  const handleRegister = async (values: RegisterValues) => {
    setError('');
    try {
      await registerUser(values.email, values.password, values.displayName);
      navigate('/contacts', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed'));
    }
  };

  return (
    <div className="min-h-screen bg-(--surface-page) flex items-center justify-center px-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-(--surface-overlay)" />

      {/* Auth Card */}
      <motion.div
        data-testid="auth-card"
        aria-label={mode === 'login' ? 'Log in' : 'Register'}
        className="relative z-10"
        initial={{ opacity: 0, scale: 0.95, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h2 className="mb-6">{mode === 'login' ? 'Log in' : 'Register'}</h2>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="mb-4 rounded-lg bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-error)_30%,transparent)] p-3"
              data-testid="auth-error"
            >
              <p className="typo-message" style={{ color: 'var(--color-error)' }}>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {mode === 'login' ? (
            <motion.form
              key="login"
              data-testid="login-form"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              onSubmit={loginForm.handleSubmit(handleLogin)}
              className="flex flex-col gap-4"
            >
            <div className="flex flex-col gap-3">
              <Input
                label="Email"
                type="email"
                placeholder="Enter email"
                {...loginForm.register('email')}
                error={loginForm.formState.errors.email?.message}
                autoFocus
              />
            </div>
              <div className="flex flex-col gap-3">
                <Input
                  label="Password"
                  type="password"
                  placeholder="Enter password"
                  {...loginForm.register('password')}
                  error={loginForm.formState.errors.password?.message}
                />
              </div>
              <div className="flex flex-col gap-3">
                <p className="typo-message text-(--text-secondary)">
                  <span className="text-(--text-primary)">demo@example.com</span> / <span className="text-(--text-primary)">password123</span>
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  data-testid="login-submit"
                  loading={loginForm.formState.isSubmitting}
                >
                  Log in
                </Button>
              </div>
            </motion.form>
          ) : (
            <motion.form
              key="register"
              data-testid="register-form"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              onSubmit={registerForm.handleSubmit(handleRegister)}
              className="flex flex-col gap-4"
            >
              <Input
                label="Name"
                placeholder="Enter your name"
                {...registerForm.register('displayName')}
                error={registerForm.formState.errors.displayName?.message}
                autoFocus
              />
              <Input
                label="Email"
                type="email"
                placeholder="Enter email"
                {...registerForm.register('email')}
                error={registerForm.formState.errors.email?.message}
              />
              <Input
                label="Password"
                type="password"
                placeholder="Enter password (min 8 characters)"
                {...registerForm.register('password')}
                error={registerForm.formState.errors.password?.message}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  data-testid="register-submit"
                  loading={registerForm.formState.isSubmitting}
                >
                  Register
                </Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-6 pt-6 border-t border-(--border-default) text-center">
          <button
            type="button"
            data-testid="auth-mode-toggle"
            className="typo-body text-(--text-secondary) hover:text-(--text-primary) transition-colors"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
              loginForm.reset();
              registerForm.reset();
            }}
          >
            {mode === 'login'
              ? "Don't have an account? Register"
              : 'Already have an account? Log in'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
