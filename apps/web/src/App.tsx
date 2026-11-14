

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

export default function App() {
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<Role>('student');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [session, setSession] =
    useState<AuthSession | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handle login and registration
  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError('');
    setSuccess('');
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
      setPassword('');

      setSuccess(
        mode === 'login'
          ? 'Login successful!'
          : 'Account created successfully!'
      );

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
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError('');
    setSuccess('');
  }

  // Logged-in interface
  if (session) {
    return (
      <main className="container">
        <section className="card">
          <h1>ORBIT</h1>
          <h2>Welcome!</h2>

          {success && (
            <p className="success">{success}</p>
          )}

          <p>
            <strong>Email:</strong>{' '}
            {session.user.email}
          </p>

          <p>
            <strong>Role:</strong>{' '}
            {session.user.role}
          </p>

          <p>
            <strong>Authentication:</strong>{' '}
            Successful
          </p>

          <p>
            You are connected to your ORBIT
            account.
          </p>


{session.user.role === 'student' && (
  <>
    <TutorBrowser session={session} />
    <MyAppointments session={session} />
  </>
)}



{session.user.role === 'tutor' && (
  <TutorDashboard session={session} />
)}



          <button
            type="button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </section>
      </main>
    );
  }

  // Login and registration interface
  return (
    <main className="container">
      <section className="card">
        <h1>ORBIT</h1>

        <p className="subtitle">
          Tutor Appointment Booking System
        </p>

        <h2>
          {mode === 'login'
            ? 'Login to Your Account'
            : 'Create an Account'}
        </h2>

        <div className="tabs">
          <button
            type="button"
            className={
              mode === 'login' ? 'active' : ''
            }
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Login
          </button>

          <button
            type="button"
            className={
              mode === 'register' ? 'active' : ''
            }
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit}>

          {mode === 'register' && (
            <>
              <label htmlFor="role">
                Account Type
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
            </>
          )}

          {mode === 'register' &&
            role === 'tutor' && (
              <>
                <label htmlFor="displayName">
                  Tutor Name
                </label>

                <input
                  id="displayName"
                  type="text"
                  placeholder="Enter your name"
                  value={displayName}
                  maxLength={120}
                  onChange={(event) =>
                    setDisplayName(event.target.value)
                  }
                  required
                />
              </>
            )}

          <label htmlFor="email">
            Email Address
          </label>

          <input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />

          <label htmlFor="password">
            Password
          </label>

          <input
            id="password"
            type="password"
            placeholder="Enter password"
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
            <small>
              Password must contain at least
              12 characters.
            </small>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="success">
              {success}
            </p>
          )}

          <button
            type="submit"
            className="submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait...'
              : mode === 'login'
                ? 'Login'
                : 'Create Account'}
          </button>
        </form>
      </section>
    </main>
  );
}