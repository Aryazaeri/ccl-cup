import { AdminLanguageSwitch } from './AdminLanguageSwitch'
import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import { type FormEvent, useState } from 'react'
import { ArrowLeft, LockKeyhole, Sparkles } from 'lucide-react'
import { Brand } from './Brand'
import { DEMO_EMAIL, DEMO_PASSWORD, useAuth } from '../auth/AuthContext'

export function LoginPage({ onBack }: { onBack: () => void }) {
  const { tr } = useAdminLanguage()
  const { signIn, backend, signingIn } = useAuth()
  const [email, setEmail] = useState(backend === 'local-demo' ? DEMO_EMAIL : '')
  const [password, setPassword] = useState(backend === 'local-demo' ? DEMO_PASSWORD : '')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      await signIn(email, password)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.')
    }
  }

  const handleQuickDemo = async () => {
    setError('')
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    try {
      await signIn(DEMO_EMAIL, DEMO_PASSWORD)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.')
    }
  }

  return (
    <main className="login-page">
      <button className="login-back" onClick={onBack}>
        <ArrowLeft size={16} /> {tr(" Public website")}</button>

      <section className="login-card">
            <AdminLanguageSwitch />
        <Brand admin />
        <div className="login-icon">
          <LockKeyhole />
        </div>
        <h1>{tr("Sign in to manage the tournament")}</h1>
        <p>{tr("Use your staff account to update teams, fixtures and published content.")}</p>

        <form onSubmit={submit}>
          <label>
            {tr("Email")}<input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </label>

          <label>
            {tr("Password")}<input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </label>

          {error ? (
            <div className="login-error" role="alert">
              {tr(error)}
            </div>
          ) : null}

          <button className="button button-primary" disabled={signingIn} type="submit">
            {signingIn ? tr("Signing in…") : tr("Sign in")}
          </button>
        </form>

        {backend === 'local-demo' ? (
          <div className="demo-credentials-box">
            <button
              type="button"
              className="quick-demo-login-btn"
              onClick={handleQuickDemo}
              disabled={signingIn}
            >
              <Sparkles size={14} />
              <span>
                {tr("One-click demo sign-in (")}{DEMO_EMAIL} / {DEMO_PASSWORD}{tr(") — offline prototype data only")}</span>
            </button>
          </div>
        ) : (
          <small>{tr("Connected securely through Supabase Auth")}</small>
        )}
      </section>
    </main>
  )
}
