
import { useEffect, useState, type FormEvent } from 'react';

import {
  getTutors,
  getTutorSlots,
  createTutorSlot,
  type AuthSession,
  type Tutor,
  type Slot
} from './api';

interface Props {
  session: AuthSession;
}

export default function TutorDashboard({ session }: Props) {
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;

    getTutors()
      .then(data => {
        if (active) setTutors(data);
      })
      .catch(err => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load tutor profiles.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function selectTutorProfile(id: string) {
    const selected = tutors.find(item => item.id === id);

    setTutor(selected ?? null);
    setSlots([]);
    setError('');
    setSuccess('');

    if (!selected) return;

    setLoadingSlots(true);

    try {
      const data = await getTutorSlots(selected.id);
      setSlots(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load available slots.'
      );
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleCreateSlot(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!tutor || saving) return;

    setError('');
    setSuccess('');

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime())
    ) {
      setError('Please enter valid dates.');
      return;
    }

    if (start.getTime() <= Date.now()) {
      setError('Start time must be in the future.');
      return;
    }

    if (end.getTime() <= start.getTime()) {
      setError('End time must be after start time.');
      return;
    }

    setSaving(true);

    try {
      await createTutorSlot(
        tutor.id,
        start.toISOString(),
        end.toISOString(),
        session.token
      );

      setSuccess('Availability published successfully!');
      setStartTime('');
      setEndTime('');

      const updated = await getTutorSlots(tutor.id);
      setSlots(updated);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to publish availability.'
      );
    } finally {
      setSaving(false);
    }
  }

  function formatTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Invalid date'
      : date.toLocaleString();
  }

  if (loading) {
    return <p>Loading tutor profiles...</p>;
  }

  return (
    <section className="tutor-dashboard">
      <h2>Tutor Dashboard</h2>

      <p>
        Signed in as: <strong>{session.user.email}</strong>
      </p>

      <label htmlFor="tutor-profile">
        Select Your Tutor Profile
      </label>

      <select
        id="tutor-profile"
        value={tutor?.id ?? ''}
        onChange={event => {
          void selectTutorProfile(event.target.value);
        }}
      >
        <option value="">Choose your profile</option>

        {tutors.map(item => (
          <option key={item.id} value={item.id}>
            {item.displayName}
          </option>
        ))}
      </select>

      {tutors.length === 0 && (
        <p>No tutor profiles are available.</p>
      )}

      <p className="subtitle">
        Select only your own tutor profile.
        The backend verifies ownership before
        allowing availability changes.
      </p>

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

      {tutor && (
        <>
          <h3>Publish Availability</h3>

          <form onSubmit={handleCreateSlot}>
            <label htmlFor="startTime">
              Start Time
            </label>

            <input
              id="startTime"
              type="datetime-local"
              value={startTime}
              onChange={event =>
                setStartTime(event.target.value)
              }
              required
            />

            <label htmlFor="endTime">
              End Time
            </label>

            <input
              id="endTime"
              type="datetime-local"
              value={endTime}
              onChange={event =>
                setEndTime(event.target.value)
              }
              required
            />

            <button
              type="submit"
              className="submit"
              disabled={saving || loadingSlots}
            >
              {saving
                ? 'Publishing...'
                : 'Publish Available Slot'}
            </button>
          </form>

          <h3>Available Slots</h3>

          {loadingSlots && <p>Loading slots...</p>}

          {!loadingSlots && slots.length === 0 && (
            <p>No available slots yet.</p>
          )}

          {slots.map(slot => (
            <div className="slot-item" key={slot.id}>
              <p>
                <strong>Start:</strong>{' '}
                {formatTime(slot.startTime)}
              </p>
              <p>
                <strong>End:</strong>{' '}
                {formatTime(slot.endTime)}
              </p>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
