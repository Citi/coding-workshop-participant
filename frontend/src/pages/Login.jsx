import { useState } from 'react';
import { ACME_DOMAIN, isAcmeEmail, login, register } from '../services/authService';
import './Login.css';

const PERSONAS = [
  { role: 'Employee', text: 'Report and track facility & workplace tech issues' },
  { role: 'Facility Admin', text: 'Manage facilities, engineers and ticket assignment' },
  { role: 'Engineer', text: 'Resolve assigned tickets and update requesters' },
];

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isRegister = mode === 'register';

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  const validate = () => {
    if (!form.email || !form.password) return 'Email and password are required.';
    if (!isAcmeEmail(form.email)) return `Please use your @${ACME_DOMAIN} email address.`;
    if (isRegister) {
      if (!form.name.trim()) return 'Please enter your full name.';
      if (form.password.length < 8) return 'Password must be at least 8 characters.';
      if (form.password !== form.confirm) return 'Passwords do not match.';
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        await register(form.name, form.email, form.password);
        setForm({ ...form, password: '', confirm: '' });
        setMode('signin');
        setNotice('Account created. You can now sign in.');
      } else {
        const user = await login(form.email, form.password);
        onLogin?.(user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-brand">
        <div className="brand-mark" aria-hidden="true">A</div>
        <h1>ACME Facility Desk</h1>
        <p className="brand-tagline">
          One place to report, track and resolve facility and workplace technology incidents.
        </p>
        <ul className="persona-list">
          {PERSONAS.map((p) => (
            <li key={p.role}>
              <strong>{p.role}</strong>
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
      </aside>

      <main className="login-panel">
        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <div className="mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={!isRegister}
              className={!isRegister ? 'active' : ''}
              onClick={() => switchMode('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegister}
              className={isRegister ? 'active' : ''}
              onClick={() => switchMode('register')}
            >
              Register
            </button>
          </div>

          <h2>{isRegister ? 'Create your employee account' : 'Welcome back'}</h2>
          <p className="subtitle">
            {isRegister
              ? `Employees can self-register with an @${ACME_DOMAIN} email.`
              : 'Sign in as an Employee, Facility Admin or Engineer.'}
          </p>

          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {notice && <div className="alert alert-success" role="status">{notice}</div>}

          {isRegister && (
            <label>
              Full name
              <input
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={update('name')}
                placeholder="Jane Doe"
              />
            </label>
          )}

          <label>
            Work email
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              placeholder={`name@${ACME_DOMAIN}`}
            />
          </label>

          <label>
            Password
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={update('password')}
                placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {isRegister && (
            <label>
              Confirm password
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.confirm}
                onChange={update('confirm')}
              />
            </label>
          )}

          <button type="submit" className="submit" disabled={loading}>
            {loading ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>

          <p className="footnote">
            {isRegister
              ? 'Engineer and Facility Admin accounts are created by your Facility Admin.'
              : 'Trouble signing in? Contact your Facility Admin.'}
          </p>
        </form>
      </main>
    </div>
  );
}
