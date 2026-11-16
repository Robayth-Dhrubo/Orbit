/**
 * Date and time helpers shared by the slot views.
 * Slots arrive from the API as UTC ISO strings and are shown
 * in the viewer's own time zone.
 */

import type { Slot } from './api';

export interface SlotDay {
  key: string;
  label: string;
  slots: Slot[];
}

function parse(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDay(value: string): string {
  const date = parse(value);

  if (!date) return 'Unknown date';

  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

export function formatTime(value: string): string {
  const date = parse(value);

  if (!date) return '--:--';

  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function formatTimeRange(slot: Slot): string {
  return `${formatTime(slot.startTime)} to ${formatTime(slot.endTime)}`;
}

/** Groups slots under the local calendar day they start on, earliest first. */
export function groupSlotsByDay(slots: Slot[]): SlotDay[] {
  const sorted = [...slots].sort(
    (a, b) =>
      new Date(a.startTime).getTime() -
      new Date(b.startTime).getTime()
  );

  const days: SlotDay[] = [];

  for (const slot of sorted) {
    const date = parse(slot.startTime);
    const key = date ? date.toDateString() : 'unknown';
    const last = days[days.length - 1];

    if (last && last.key === key) {
      last.slots.push(slot);
    } else {
      days.push({
        key,
        label: formatDay(slot.startTime),
        slots: [slot]
      });
    }
  }

  return days;
}
