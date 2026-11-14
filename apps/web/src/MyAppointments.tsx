
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

      setSuccess(
        'Appointment cancelled successfully.'
      );

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

  return (
    <section className="appointments-section">
      <h2>My Appointments</h2>

      <p>
        View and manage your tutoring sessions.
      </p>

      <button
        type="button"
        className="refresh-button"
        disabled={loading || cancellingId !== null}
        onClick={() => {
          setSuccess('');
          void loadAppointments();
        }}
      >
        {loading ? 'Loading...' : 'Refresh Appointments'}
      </button>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}

      {loading && (
        <p>Loading your appointments...</p>
      )}

      {!loading &&
        !error &&
        appointments.length === 0 && (
          <p>You have no appointments yet.</p>
        )}

      {!loading && appointments.map(appointment => (
        <div
          className="appointment-item"
          key={appointment.appointmentId}
        >
          <h3>
            {appointment.topic}
          </h3>

          <p>
            <strong>Appointment ID:</strong>{' '}
            {appointment.appointmentId}
          </p>

          <p>
            <strong>Slot ID:</strong>{' '}
            {appointment.slotId}
          </p>

          <p>
            <strong>Status:</strong>{' '}
            <span
              className={
                appointment.status === 'confirmed'
                  ? 'status-confirmed'
                  : 'status-cancelled'
              }
            >
              {appointment.status}
            </span>
          </p>

          {appointment.notes && (
            <p>
              <strong>Notes:</strong>{' '}
              {appointment.notes}
            </p>
          )}

          {appointment.status === 'confirmed' && (
            <button
              type="button"
              className="cancel-button"
              disabled={cancellingId !== null}
              onClick={() => {
                void handleCancel(
                  appointment.appointmentId
                );
              }}
            >
              {cancellingId === appointment.appointmentId
                ? 'Cancelling...'
                : 'Cancel Appointment'}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
