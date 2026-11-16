/**
 * Open slots drawn as a timetable: one column per day, time running
 * down the page, each slot a block sized by its length. On narrow
 * screens the same markup collapses into a list per day (see index.css).
 */

import type { CSSProperties } from 'react';

import type { Slot } from './api';
import { formatTime, groupSlotsByDay } from './format';

interface Props {
  slots: Slot[];
  selectedId?: string | null;
  disabled?: boolean;
  /** When omitted the blocks are read-only. */
  onSelect?: (slot: Slot) => void;
}

const HOUR_PX = 64;
const MINUTES_PER_DAY = 24 * 60;

function startMinute(slot: Slot): number {
  const date = new Date(slot.startTime);
  return date.getHours() * 60 + date.getMinutes();
}

function lengthMinutes(slot: Slot): number {
  const length =
    (new Date(slot.endTime).getTime() -
      new Date(slot.startTime).getTime()) /
    60000;

  return Math.max(15, length);
}

export default function SlotTimetable({
  slots,
  selectedId = null,
  disabled = false,
  onSelect
}: Props) {
  const days = groupSlotsByDay(slots);

  if (days.length === 0) return null;

  // Visible range: whole hours around the earliest start and latest end.
  let first = MINUTES_PER_DAY;
  let last = 0;

  for (const slot of slots) {
    const start = startMinute(slot);
    const end = Math.min(
      MINUTES_PER_DAY,
      start + lengthMinutes(slot)
    );

    first = Math.min(first, start);
    last = Math.max(last, end);
  }

  const startHour = Math.floor(first / 60);
  const endHour = Math.min(
    24,
    Math.max(startHour + 3, Math.ceil(last / 60))
  );

  const hours = Array.from(
    { length: endHour - startHour },
    (_, index) => startHour + index
  );

  const hourLabel = (hour: number) =>
    new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
      hour: 'numeric'
    });

  const gridStyle = {
    '--days': days.length,
    '--hours': hours.length,
    '--hour-px': `${HOUR_PX}px`
  } as CSSProperties;

  return (
    <div className="timetable" style={gridStyle}>
      <div className="timetable-axis" aria-hidden="true">
        {hours.map(hour => (
          <span key={hour}>{hourLabel(hour)}</span>
        ))}
      </div>

      {days.map(day => {
        const date = new Date(day.slots[0].startTime);

        return (
          <section
            className="timetable-day"
            key={day.key}
            aria-label={day.label}
          >
            <h3>
              <span className="day-name">
                {date.toLocaleDateString(undefined, {
                  weekday: 'long'
                })}
              </span>

              <span className="day-date">
                {date.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </h3>

            <div className="timetable-track">
              {day.slots.map(slot => {
                const start = startMinute(slot);
                const visible = Math.min(
                  lengthMinutes(slot),
                  endHour * 60 - start
                );

                const blockStyle = {
                  '--top': `${((start - startHour * 60) / 60) * HOUR_PX}px`,
                  '--height': `${(visible / 60) * HOUR_PX}px`
                } as CSSProperties;

                const content = (
                  <>
                    <span className="slot-start">
                      {formatTime(slot.startTime)}
                    </span>

                    <span className="slot-end">
                      to {formatTime(slot.endTime)}
                    </span>
                  </>
                );

                const size = visible < 45 ? ' is-short' : '';

                if (!onSelect) {
                  return (
                    <div
                      className={`slot-block is-static${size}`}
                      style={blockStyle}
                      key={slot.id}
                    >
                      {content}
                    </div>
                  );
                }

                return (
                  <button
                    type="button"
                    className={
                      selectedId === slot.id
                        ? `slot-block active${size}`
                        : `slot-block${size}`
                    }
                    style={blockStyle}
                    aria-pressed={selectedId === slot.id}
                    disabled={disabled}
                    onClick={() => onSelect(slot)}
                    key={slot.id}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
