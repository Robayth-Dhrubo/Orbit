
import {
  useEffect,
  useState,
  type FormEvent
} from 'react';

import {
  getTutors,
  getTutorSlots,
  bookAppointment,
  ApiError,
  type AuthSession,
  type Tutor,
  type Slot
} from './api';

import {
  formatDay,
  formatTimeRange,
  groupSlotsByDay
} from './format';

interface Props {
  session: AuthSession;
  onViewAppointments?: () => void;
}

interface BookingAttempt {
  slotId: string;
  topic: string;
  notes: string;
  key: string;
}

export default function TutorBrowser({
  session,
  onViewAppointments
}: Props) {

  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [selectedTutor, setSelectedTutor] =
    useState<Tutor | null>(null);

  const [selectedSlot, setSelectedSlot] =
    useState<Slot | null>(null);

  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);

  const [error, setError] = useState('');
  const [slotError, setSlotError] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState('');

  const [pendingAttempt, setPendingAttempt] =
    useState<BookingAttempt | null>(null);

  // STEP 1: Fetch real tutors from PostgreSQL
  useEffect(() => {
    let active = true;

    async function loadTutors() {
      try {
        const data = await getTutors();

        if (active) {
          setTutors(data);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load tutors.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTutors();

    return () => {
      active = false;
    };
  }, []);

  // STEP 2: Load tutor's available slots
  async function viewSlots(tutor: Tutor) {
    setSelectedTutor(tutor);
    setSelectedSlot(null);
    setSlots([]);

    setSlotError('');
    setBookingError('');
    setBookingSuccess('');
    setPendingAttempt(null);

    setLoadingSlots(true);

    try {
      const data = await getTutorSlots(tutor.id);
      setSlots(data);
    } catch (err) {
      setSlotError(
        err instanceof Error
          ? err.message
          : 'Unable to retrieve available slots.'
      );
    } finally {
      setLoadingSlots(false);
    }
  }

  // STEP 3: Select a slot
  function selectSlot(slot: Slot) {
    setSelectedSlot(slot);

    setTopic('');
    setNotes('');

    setBookingError('');
    setBookingSuccess('');
    setPendingAttempt(null);
  }

  // STEP 4: Book the appointment
  async function handleBooking(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!selectedSlot || booking) {
      return;
    }

    setBookingError('');
    setBookingSuccess('');

    const cleanTopic = topic.trim();

    if (
      cleanTopic.length === 0 ||
      cleanTopic.length > 200
    ) {
      setBookingError(
        'Topic must contain 1 to 200 characters.'
      );
      return;
    }

    if (notes.length > 4000) {
      setBookingError(
        'Notes must not exceed 4000 characters.'
      );
      return;
    }

    // Reuse the same idempotency key when retrying
    // an identical request after a network error.
    const attempt: BookingAttempt =
      pendingAttempt &&
      pendingAttempt.slotId === selectedSlot.id &&
      pendingAttempt.topic === cleanTopic &&
      pendingAttempt.notes === notes
        ? pendingAttempt
        : {
            slotId: selectedSlot.id,
            topic: cleanTopic,
            notes,
            key: crypto.randomUUID()
          };

    setPendingAttempt(attempt);
    setBooking(true);

    try {
      const result = await bookAppointment(
        attempt.slotId,
        attempt.topic,
        attempt.notes,
        session.token,
        attempt.key
      );

      // Booking completed successfully
      setBookingSuccess(
        `Session booked. Reference ${result.appointmentId.slice(0, 8)}.`
      );

      setSelectedSlot(null);
      setPendingAttempt(null);

      setTopic('');
      setNotes('');

      // Refresh real available slots
      if (selectedTutor) {
        try {
          const updated = await getTutorSlots(
            selectedTutor.id
          );

          setSlots(updated);
        } catch {
          setSlotError(
            'Booking succeeded, but the slot list could not be refreshed.'
          );
        }
      }

    } catch (err) {

      setBookingError(
        err instanceof Error
          ? err.message
          : 'Appointment booking failed.'
      );

      if (err instanceof ApiError) {

        // A definite rejection is not an uncertain
        // request. Clear the pending retry key.
        if (
          [400, 401, 403, 404, 409].includes(err.status)
        ) {
          setPendingAttempt(null);
        }

        // Slot unavailable
        if (err.status === 409 && selectedTutor) {
          setSelectedSlot(null);

          try {
            const updated = await getTutorSlots(
              selectedTutor.id
            );

            setSlots(updated);

          } catch {
            setSlotError(
              'Could not refresh available slots.'
            );
          }
        }
      }

    } finally {
      setBooking(false);
    }
  }

  const days = groupSlotsByDay(slots);

  return (
    <section className="tutor-browser">

      <header className="page-head">
        <h1>Find a tutor</h1>
        <p>Choose a tutor, then pick one of their open slots.</p>
      </header>

      {/* Tutor loading errors */}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <div className="split">

        <div className="panel">
          <h2>Tutors</h2>

          {loading && (
            <p className="muted">Loading tutors...</p>
          )}

          {/* Empty tutor list */}
          {!loading &&
            !error &&
            tutors.length === 0 && (
              <p className="muted">
                No tutors have joined yet. Check back soon.
              </p>
            )}

          {/* Display actual tutor profiles */}
          <ul className="tutor-list">
            {tutors.map(tutor => (
              <li key={tutor.id}>
                <button
                  type="button"
                  className={
                    selectedTutor?.id === tutor.id
                      ? 'tutor-row active'
                      : 'tutor-row'
                  }
                  aria-pressed={selectedTutor?.id === tutor.id}
                  disabled={loadingSlots || booking}
                  onClick={() => viewSlots(tutor)}
                >
                  <span className="avatar" aria-hidden="true">
                    {tutor.displayName.trim().charAt(0).toUpperCase()}
                  </span>

                  <span className="tutor-text">
                    <span className="tutor-name">
                      {tutor.displayName}
                    </span>

                    {tutor.bio && (
                      <span className="tutor-bio">
                        {tutor.bio}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">

          {!selectedTutor && (
            <div className="empty">
              <h2>Open slots</h2>
              <p className="muted">
                Select a tutor to see when they are free.
              </p>
            </div>
          )}

          {/* Available appointment slots */}
          {selectedTutor && (
            <>
              <h2>
                Open slots with {selectedTutor.displayName}
              </h2>

              {loadingSlots && (
                <p className="muted">Loading open slots...</p>
              )}

              {slotError && (
                <p className="notice notice-error" role="alert">
                  {slotError}
                </p>
              )}

              {!loadingSlots &&
                !slotError &&
                slots.length === 0 && (
                  <p className="muted">
                    {selectedTutor.displayName} has no open
                    slots right now.
                  </p>
                )}

              {/* Display slots, grouped by day */}
              {days.map(day => (
                <div className="slot-day" key={day.key}>
                  <h3>{day.label}</h3>

                  <div className="slot-chips">
                    {day.slots.map(slot => (
                      <button
                        type="button"
                        key={slot.id}
                        className={
                          selectedSlot?.id === slot.id
                            ? 'slot-chip active'
                            : 'slot-chip'
                        }
                        aria-pressed={selectedSlot?.id === slot.id}
                        disabled={booking}
                        onClick={() => selectSlot(slot)}
                      >
                        {formatTimeRange(slot)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Student booking form */}
          {selectedSlot && (

            <div className="booking-form">

              <h3>
                Book {formatDay(selectedSlot.startTime)},{' '}
                {formatTimeRange(selectedSlot)}
              </h3>

              <form onSubmit={handleBooking}>

                <div className="field">
                  <label htmlFor="booking-topic">
                    What do you want to work on?
                  </label>

                  <input
                    id="booking-topic"
                    type="text"
                    placeholder="Integration by parts"
                    value={topic}
                    maxLength={200}
                    onChange={event =>
                      setTopic(event.target.value)
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="booking-notes">
                    Notes for the tutor (optional)
                  </label>

                  <textarea
                    id="booking-notes"
                    placeholder="Anything the tutor should know before the session"
                    value={notes}
                    maxLength={4000}
                    rows={3}
                    onChange={event =>
                      setNotes(event.target.value)
                    }
                  />
                </div>

                {bookingError && (
                  <p className="notice notice-error" role="alert">
                    {bookingError}
                  </p>
                )}

                <button
                  type="submit"
                  className="button-primary"
                  disabled={booking}
                >
                  {booking
                    ? 'Booking...'
                    : 'Book session'}
                </button>

              </form>

            </div>
          )}

          {/* Booking confirmation */}
          {bookingSuccess && (
            <div className="notice notice-success" role="status">
              <span>{bookingSuccess}</span>

              {onViewAppointments && (
                <button
                  type="button"
                  className="button-link"
                  onClick={onViewAppointments}
                >
                  View my appointments
                </button>
              )}
            </div>
          )}

          {/* Booking errors outside the form */}
          {!selectedSlot && bookingError && (
            <p className="notice notice-error" role="alert">
              {bookingError}
            </p>
          )}

        </div>
      </div>
    </section>
  );
}
