
import {
  useCallback,
  useEffect,
  useState
} from 'react';

import {
  getMyAppointments,
  cancelAppointment,
  type AuthSession,
  type Appointment
} from './api';

interface Props {
  session: AuthSession;
}

export default function MyAppointments({
  session
}: Props) {
  const [appointments, setAppointments] =
    useState<Appointment[]>([]);

  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] =
    useState<string | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load appointments from PostgreSQL
  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getMyAppointments(
        session.token
      );

      setAppointments(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load appointments.'
      );
    } finally {
      setLoading(false);
    }
  }, [session.token]);

 
useEffect(() => {
  let active = true;

  getMyAppointments(session.token)
    .then((data) => {
      if (active) {
        setAppointments(data);
      }
    })
    .catch((err) => {
      if (active) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load appointments.'
        );
      }
    })
    .finally(() => {
      if (active) {
        setLoading(false);
      }
    });

  return () => {
    active = false;
  };
}, [session.token]);


  // Cancel an appointment through the real API
  async function handleCancel(
    appointmentId: string
  ) {
    if (cancellingId) return;

    setError('');
    setSuccess('');
    setCancellingId(appointmentId);

    try {
      await cancelAppointment(
        appointmentId,
        session.token
      );

      // Update the interface immediately
      setAppointments(current =>
        current.map(item =>
          item.appointmentId === appointmentId
            ? { ...item, status: 'cancelled' }
            : item
        )
      );

      setSuccess('Session cancelled. The slot is open again.');

      // Refresh the records from PostgreSQL
      try {
        const updated = await getMyAppointments(
          session.token
        );
        setAppointments(updated);
      } catch {
        setError(
          'Cancellation succeeded, but the list could not be refreshed.'
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to cancel appointment.'
      );
    } finally {
      setCancellingId(null);
    }
  }

  // Upcoming sessions first, cancelled ones after
  const ordered = [...appointments].sort(
    (a, b) =>
      Number(a.status !== 'confirmed') -
      Number(b.status !== 'confirmed')
  );

  return (
    <section className="appointments-section">
      <header className="page-head page-head-row">
        <div>
          <h1>My appointments</h1>
          <p>Sessions you have booked, and any you cancelled.</p>
        </div>

        <button
          type="button"
          className="button-quiet"
          disabled={loading || cancellingId !== null}
          onClick={() => {
            setSuccess('');
            void loadAppointments();
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className="notice notice-success" role="status">
          {success}
        </p>
      )}

      {loading && (
        <p className="muted">Loading your appointments...</p>
      )}

      {!loading &&
        !error &&
        appointments.length === 0 && (
          <div className="panel empty">
            <h2>No sessions yet</h2>
            <p className="muted">
              Book a slot under Find a tutor and it will show
              up here.
            </p>
          </div>
        )}

      {!loading && ordered.length > 0 && (
        <ul className="appointment-list">
          {ordered.map(appointment => (
            <li
              className={
                appointment.status === 'confirmed'
                  ? 'appointment-item'
                  : 'appointment-item is-cancelled'
              }
              key={appointment.appointmentId}
            >
              <div className="appointment-main">
                <h2>{appointment.topic}</h2>

                {appointment.notes && (
                  <p className="appointment-notes">
                    {appointment.notes}
                  </p>
                )}

                <p
                  className="appointment-ref"
                  title={`Appointment ${appointment.appointmentId}, slot ${appointment.slotId}`}
                >
                  Reference {appointment.appointmentId.slice(0, 8)}
                </p>
              </div>

              <div className="appointment-side">
                <span
                  className={
                    appointment.status === 'confirmed'
                      ? 'status status-confirmed'
                      : 'status status-cancelled'
                  }
                >
                  {appointment.status === 'confirmed'
                    ? 'Confirmed'
                    : 'Cancelled'}
                </span>

                {appointment.status === 'confirmed' && (
                  <button
                    type="button"
                    className="button-danger"
                    disabled={cancellingId !== null}
                    onClick={() => {
                      void handleCancel(
                        appointment.appointmentId
                      );
                    }}
                  >
                    {cancellingId === appointment.appointmentId
                      ? 'Cancelling...'
                      : 'Cancel session'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
