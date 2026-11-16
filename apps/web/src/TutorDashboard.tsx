
import { useEffect, useState, type FormEvent } from 'react';

import {
  getTutors,
  getTutorSlots,
  createTutorSlot,
  type AuthSession,
  type Tutor,
  type Slot
} from './api';

import SlotTimetable from './SlotTimetable';

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

      setSuccess('Slot published. Students can book it now.');
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

  if (loading) {
    return <p className="muted">Loading tutor profiles...</p>;
  }

  return (
    <section className="tutor-dashboard">
      <header className="page-head">
        <h1>Your availability</h1>
        <p>Publish the hours you are free. Each slot can be booked once.</p>
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

      <div className="split">
        <div className="panel">
          <h2>Publish a slot</h2>

          <div className="field">
            <label htmlFor="tutor-profile">
              Your tutor profile
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

            <p className="hint">
              {tutors.length === 0
                ? 'No tutor profiles exist yet.'
                : 'ORBIT checks the profile is yours before it publishes anything.'}
            </p>
          </div>

          {tutor && (
            <form onSubmit={handleCreateSlot}>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="startTime">
                    Starts
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
                </div>

                <div className="field">
                  <label htmlFor="endTime">
                    Ends
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
                </div>
              </div>

              <button
                type="submit"
                className="button-primary"
                disabled={saving || loadingSlots}
              >
                {saving
                  ? 'Publishing...'
                  : 'Publish slot'}
              </button>
            </form>
          )}
        </div>

        <div className="panel">
          <h2>Your open slots</h2>

          {!tutor && (
            <p className="muted">
              Choose your profile to see the slots students can
              still book.
            </p>
          )}

          {tutor && loadingSlots && (
            <p className="muted">Loading slots...</p>
          )}

          {tutor && !loadingSlots && slots.length === 0 && (
            <p className="muted">
              Nothing open yet. Publish your first slot.
            </p>
          )}

          {tutor && !loadingSlots && (
            <SlotTimetable slots={slots} />
          )}
        </div>
      </div>
    </section>
  );
}
