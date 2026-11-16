import MyAppointments from './MyAppointments';
import TutorBrowser from './TutorBrowser';
import TutorDashboard from './TutorDashboard';

import { useState, type FormEvent } from 'react';

import {
  login,
  registerStudent,
  registerTutor,
  type AuthSession,
  type Role
} from './api';

type Mode = 'login' | 'register';
type StudentView = 'browse' | 'appointments';

function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true" />
      ORBIT
    </span>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<Role>('student');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [session, setSession] =
    useState<AuthSession | null>(null);

  const [studentView, setStudentView] =
    useState<StudentView>('browse');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle login and registration
  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError('');
    setLoading(true);

    try {
      let result: AuthSession;

      if (mode === 'login') {
        result = await login(email, password);
      } else if (role === 'student') {
        result = await registerStudent(
          email,
          password
        );
      } else {
        result = await registerTutor(
          email,
          password,
          displayName
        );
      }

      setSession(result);
      setStudentView('browse');
      setPassword('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong.'
      );
    } finally {
      setLoading(false);
    }
  }

  // Logout
  function handleLogout() {
    setSession(null);
    setMode('login');
    setRole('student');
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError('');
  }

  // Logged-in interface
  if (session) {
    const isStudent = session.user.role === 'student';

    return (
      <div className="shell">
        <header className="topbar">
          <Brand />

          {isStudent && (
            <nav className="topbar-nav" aria-label="Sections">
              <button
                type="button"
                className={
                  studentView === 'browse' ? 'active' : ''
                }
                aria-current={
                  studentView === 'browse' ? 'page' : undefined
                }
                onClick={() => setStudentView('browse')}
              >
                Find a tutor
              </button>

              <button
                type="button"
                className={
                  studentView === 'appointments' ? 'active' : ''
                }
                aria-current={
                  studentView === 'appointments'
                    ? 'page'
                    : undefined
                }
                onClick={() => setStudentView('appointments')}
              >
                My appointments
              </button>
            </nav>
          )}

          <div className="topbar-user">
            <span className="user-email">
              {session.user.email}
            </span>

            <span className={`role-pill role-${session.user.role}`}>
              {isStudent ? 'Student' : 'Tutor'}
            </span>

            <button
              type="button"
              className="button-quiet"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="page">
          {isStudent && studentView === 'browse' && (
            <TutorBrowser
              session={session}
              onViewAppointments={() =>
                setStudentView('appointments')
              }
            />
          )}

          {isStudent && studentView === 'appointments' && (
            <MyAppointments session={session} />
          )}

          {!isStudent && (
            <TutorDashboard session={session} />
          )}
        </main>
      </div>
    );
  }

  // Login and registration interface
  return (
    <div className="auth">
      <aside className="auth-side">
        <Brand />

        <div className="auth-pitch">
          <h1>Find an hour with a tutor.</h1>

          <p>
            Tutors post the hours they are free. Pick one and
            it is yours. No slot is ever given to two students.
          </p>
        </div>

        <div className="hero-table" aria-hidden="true">
          <div className="hero-days">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
          </div>

          <div className="hero-grid">
            <span className="hero-block b1" />
            <span className="hero-block b2" />
            <span className="hero-block b3 is-yours">Yours</span>
            <span className="hero-block b4" />
            <span className="hero-block b5" />
            <span className="hero-block b6 is-taken" />
          </div>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h2>
            {mode === 'login'
              ? 'Sign in to ORBIT'
              : 'Create your account'}
          </h2>

          <div className="segmented" role="group" aria-label="Account action">
            <button
              type="button"
              className={
                mode === 'login' ? 'active' : ''
              }
              aria-pressed={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Sign in
            </button>

            <button
              type="button"
              className={
                mode === 'register' ? 'active' : ''
              }
              aria-pressed={mode === 'register'}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit}>

            {mode === 'register' && (
              <div className="field">
                <label htmlFor="role">
                  I am a
                </label>

                <select
                  id="role"
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as Role)
                  }
                >
                  <option value="student">
                    Student
                  </option>

                  <option value="tutor">
                    Tutor
                  </option>
                </select>
              </div>
            )}

            {mode === 'register' &&
              role === 'tutor' && (
                <div className="field">
                  <label htmlFor="displayName">
                    Name students will see
                  </label>

                  <input
                    id="displayName"
                    type="text"
                    placeholder="Dr. Amina Rahman"
                    value={displayName}
                    maxLength={120}
                    onChange={(event) =>
                      setDisplayName(event.target.value)
                    }
                    required
                  />
                </div>
              )}

            <div className="field">
              <label htmlFor="email">
                Email
              </label>

              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">
                Password
              </label>

              <input
                id="password"
                type="password"
                autoComplete={
                  mode === 'register'
                    ? 'new-password'
                    : 'current-password'
                }
                value={password}
                minLength={
                  mode === 'register' ? 12 : undefined
                }
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                required
              />

              {mode === 'register' && (
                <p className="hint">
                  At least 12 characters.
                </p>
              )}
            </div>

            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="button-primary button-block"
              disabled={loading}
            >
              {loading
                ? 'One moment...'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
