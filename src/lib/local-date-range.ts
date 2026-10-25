export type IsoDateRange = {
  start_at: string;
  end_at: string;
};

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return null;
  return date;
}

/** Converts an inclusive local-calendar date range into a half-open ISO timestamp range. */
export function localInclusiveDateRange(startDate: string, endDate: string): IsoDateRange | null {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end || end.getTime() < start.getTime()) return null;

  const endExclusive = new Date(end);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return {
    start_at: start.toISOString(),
    end_at: endExclusive.toISOString(),
  };
}
