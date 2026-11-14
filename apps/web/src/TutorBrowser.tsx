
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

interface Props {
  session: AuthSession;
}

interface BookingAttempt {
  slotId: string;
  topic: string;
  notes: string;
  key: string;
}

export default function TutorBrowser({ session }: Props) {

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
        `Appointment confirmed! ID: ${result.appointmentId}`
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

  // Format appointment date and time
  function formatDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Invalid date';
    }

    return date.toLocaleString();
  }

  return (
    <section className="tutor-browser">

      <h2>Find a Tutor</h2>

      <p>
        Browse available tutors and book a session.
      </p>

      {/* Loading state */}
      {loading && (
        <p>Loading tutors...</p>
      )}

      {/* Tutor loading errors */}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {/* Empty tutor list */}
      {!loading &&
        !error &&
        tutors.length === 0 && (
          <p>No tutors available yet.</p>
        )}

      {/* Display actual tutor profiles */}
      {tutors.map(tutor => (

        <div
          className="tutor-item"
          key={tutor.id}
        >

          <h3>{tutor.displayName}</h3>

          {tutor.bio && (
            <p>{tutor.bio}</p>
          )}

          <button
            type="button"
            disabled={loadingSlots || booking}
            onClick={() => viewSlots(tutor)}
          >
            View Available Slots
          </button>

        </div>
      ))}

      {/* Available appointment slots */}
      {selectedTutor && (

        <div className="slots-section">

          <h3>
            Available Slots — {selectedTutor.displayName}
          </h3>

          {loadingSlots && (
            <p>Loading available slots...</p>
          )}

          {slotError && (
            <p className="error" role="alert">
              {slotError}
            </p>
          )}

          {!loadingSlots &&
            !slotError &&
            slots.length === 0 && (
              <p>
                No available slots for this tutor.
              </p>
            )}

          {/* Display slots */}
          {slots.map(slot => (

            <div
              className="slot-item"
              key={slot.id}
            >

              <p>
                <strong>Start:</strong>{' '}
                {formatDate(slot.startTime)}
              </p>

              <p>
                <strong>End:</strong>{' '}
                {formatDate(slot.endTime)}
              </p>

              <button
                type="button"
                disabled={booking}
                onClick={() => selectSlot(slot)}
              >
                Select & Book
              </button>

            </div>
          ))}

        </div>
      )}

      {/* Student booking form */}
      {selectedSlot && (

        <div className="booking-form">

          <h3>Book Appointment</h3>

          <p>
            <strong>Selected Date:</strong>{' '}
            {formatDate(selectedSlot.startTime)}
          </p>

          <form onSubmit={handleBooking}>

            <label htmlFor="booking-topic">
              Session Topic
            </label>

            <input
              id="booking-topic"
              type="text"
              placeholder="e.g. Calculus Integration"
              value={topic}
              maxLength={200}
              onChange={event =>
                setTopic(event.target.value)
              }
              required
            />

            <label htmlFor="booking-notes">
              Additional Notes (Optional)
            </label>

            <textarea
              id="booking-notes"
              placeholder="What do you need help with?"
              value={notes}
              maxLength={4000}
              rows={4}
              onChange={event =>
                setNotes(event.target.value)
              }
            />

            {bookingError && (
              <p className="error" role="alert">
                {bookingError}
              </p>
            )}

            <button
              type="submit"
              className="submit"
              disabled={booking}
            >
              {booking
                ? 'Booking...'
                : 'Confirm Booking'}
            </button>

          </form>

        </div>
      )}

      {/* Booking confirmation */}
      {bookingSuccess && (

        <p
          className="success"
          role="status"
        >
          {bookingSuccess}
        </p>

      )}

      {/* Booking errors outside the form */}
      {!selectedSlot && bookingError && (
        <p className="error" role="alert">
          {bookingError}
        </p>
      )}

    </section>
  );
}
