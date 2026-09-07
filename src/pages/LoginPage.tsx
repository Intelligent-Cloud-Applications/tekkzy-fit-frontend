import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandWordmark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Field';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BRAND } from '@/brand';
import { loginWithPassword } from '@/services/auth';
import { useAuthStore } from '@/store/authStore';
import { DEMO_PASSWORD } from '@/data/demo';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@gymaccess.in');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await loginWithPassword(email, password);
      login(session.user, session.token);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ambient relative grid min-h-full place-items-center overflow-hidden p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="page-enter w-full max-w-[400px]">
        <div className="mb-7 text-center">
          <BrandWordmark size="lg" />
          <p className="mt-2 text-[13px] text-ink-soft">{BRAND.tagline}</p>
        </div>
        <div className="surface overflow-hidden">
          <div className="h-1 bg-accent" />
          <form onSubmit={onSubmit} className="space-y-4 p-5 sm:p-6">
            <Field label="Email">
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </Field>
            <Field label="Password">
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error ? <div className="text-[12px] font-medium text-bad">{error}</div> : null}
            <Button type="submit" className="h-11 w-full" loading={busy} disabled={busy}>
              {busy ? 'Signing in…' : 'Enter Tekkzy Fit'}
            </Button>
          </form>
          <div className="border-t border-line px-5 py-4 text-[12px] leading-relaxed text-ink-soft sm:px-6">
            <div className="mb-1 font-semibold text-ink">Demo · {DEMO_PASSWORD}</div>
            <div>admin@gymaccess.in — Super Admin</div>
            <div>gymadmin@gymaccess.in — Gym Admin</div>
            <div>reception@gymaccess.in — Receptionist</div>
            <div>manager@gymaccess.in — Manager</div>
          </div>
        </div>
      </div>
    </div>
  );
}
