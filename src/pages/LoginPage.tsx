import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, CreditCard, Eye, EyeOff, Lock, Mail, ShieldCheck, Users } from 'lucide-react';
import { BrandWordmark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BRAND } from '@/brand';
import { confirmPasswordReset, loginWithPassword, requestPasswordReset } from '@/services/auth';
import { useAuthStore } from '@/store/authStore';

type View = 'login' | 'forgot' | 'code';

const highlights = [
  { icon: Users, title: 'Members', text: 'Enrol, renew, and keep the floor list current.' },
  { icon: CalendarCheck, title: 'Attendance', text: 'See who checked in and who is still due.' },
  { icon: CreditCard, title: 'Plans & pay', text: 'Cash at the desk or online auto-pay.' },
  { icon: ShieldCheck, title: 'Staff access', text: 'Reception and admin stay on one login.' },
];

export function LoginPage() {
  const sessionUser = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  if (sessionUser) return <Navigate to="/" replace />;

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const session = await loginWithPassword(email, password);
      login(session.user, session.token);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestPasswordReset(email);
      setNotice('If that email is registered, a reset code is on its way.');
      setView('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset code');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await confirmPasswordReset(email, code, nextPassword);
      setPassword('');
      setCode('');
      setNextPassword('');
      setView('login');
      setNotice('Password updated. Sign in with the new password.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password');
    } finally {
      setBusy(false);
    }
  }

  const heading =
    view === 'login' ? 'Welcome back' : view === 'forgot' ? 'Forgot password' : 'Enter reset code';
  const subcopy =
    view === 'login'
      ? 'Sign in with your staff email to open the desk.'
      : view === 'forgot'
        ? 'We will email a short code if this account exists.'
        : 'Use the code from your email, then choose a new password.';

  return (
    <div className="login-shell">
      <div className="login-toolbar">
        <ThemeToggle />
      </div>
      <aside className="login-hero">
        <div className="login-hero-inner">
          <div className="login-hero-mark">TF</div>
          <BrandWordmark size="lg" />
          <p className="login-hero-kicker">{BRAND.tagline}</p>
          <h1 className="login-hero-title">The desk for a smoother<br />gym day</h1>
          <p className="login-hero-copy">
            Members, attendance, plans, and payments — one staff login for the reception floor.
          </p>
          <ul className="login-hero-list">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title}>
                  <span className="login-hero-icon">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <em>{item.text}</em>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="login-hero-foot">Fitnessworld · Tekkzy Fit</p>
        </div>
      </aside>

      <main className="login-main">
        <div className="login-stack">
        <div className="login-mobile-brand">
          <span className="login-hero-mark">TF</span>
          <BrandWordmark size="lg" />
          <p className="text-[12px] text-ink-soft">{BRAND.tagline}</p>
        </div>
        <div className="login-card page-enter">
          {view !== 'login' ? (
            <button
              type="button"
              className="tap mb-4 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-soft hover:text-ink"
              onClick={() => {
                setView('login');
                setError('');
                setNotice('');
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </button>
          ) : null}
          <p className="login-eyebrow">Staff portal</p>
          <h2 className="font-display text-[1.65rem] font-bold tracking-tight">{heading}</h2>
          <p className="mt-1.5 mb-6 text-[13px] leading-relaxed text-ink-soft">{subcopy}</p>

          {view === 'login' ? (
            <form onSubmit={onLogin} className="space-y-4">
              <EmailField value={email} onChange={setEmail} />
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-[12px] font-semibold text-accent hover:underline"
                  onClick={() => {
                    setView('forgot');
                    setError('');
                    setNotice('');
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <FormStatus error={error} notice={notice} />
              <Button type="submit" className="h-12 w-full" loading={busy} disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          ) : null}

          {view === 'forgot' ? (
            <form onSubmit={onForgot} className="space-y-4">
              <EmailField value={email} onChange={setEmail} />
              <FormStatus error={error} notice={notice} />
              <Button type="submit" className="h-12 w-full" loading={busy} disabled={busy}>
                {busy ? 'Sending…' : 'Send reset code'}
              </Button>
            </form>
          ) : null}

          {view === 'code' ? (
            <form onSubmit={onConfirm} className="space-y-4">
              <EmailField value={email} onChange={setEmail} />
              <FieldShell label="Reset code">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  className="h-12 w-full rounded-[12px] border border-line bg-[var(--input-bg)] px-3 text-[13px] text-ink outline-none focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
                />
              </FieldShell>
              <PasswordField
                label="New password"
                value={nextPassword}
                onChange={setNextPassword}
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
              <p className="text-[11px] text-ink-soft">
                Use at least 8 characters with a letter, a number, and a symbol.
              </p>
              <FormStatus error={error} notice={notice} />
              <Button type="submit" className="h-12 w-full" loading={busy} disabled={busy}>
                {busy ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          ) : null}
        </div>
        <p className="login-legal">Authorized staff only. Keep the desk signed out when you step away.</p>
        </div>
      </main>
    </div>
  );
}

function EmailField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <FieldShell label="Email">
      <div className="relative">
        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoFocus
          autoComplete="username"
          placeholder="you@tekkzy.com"
          className="h-12 w-full rounded-[12px] border border-line bg-[var(--input-bg)] pl-11 pr-3 text-[13px] text-ink outline-none placeholder:text-ink-soft focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
        />
      </div>
    </FieldShell>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <FieldShell label={label}>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoComplete={label === 'Password' ? 'current-password' : 'new-password'}
          className="h-12 w-full rounded-[12px] border border-line bg-[var(--input-bg)] pl-11 pr-11 text-[13px] text-ink outline-none focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-ink-soft hover:bg-[var(--hover-fill)] hover:text-ink"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </FieldShell>
  );
}

function FieldShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[12px]">
      <span className="mb-1.5 block font-semibold tracking-tight text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function FormStatus({ error, notice }: { error: string; notice: string }) {
  if (!error && !notice) return null;
  return (
    <div className={`text-[12px] font-medium ${error ? 'text-bad' : 'text-ok'}`}>
      {error || notice}
    </div>
  );
}
