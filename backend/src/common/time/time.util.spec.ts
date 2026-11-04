import {
  addDays,
  compareTimes,
  eachDate,
  evaluateLateness,
  hasCutoffPassed,
  isValidTimeZone,
  localDate,
  localTime,
  minutesBetween,
  normalizeTime,
  timeToMinutes,
  weekdayOf,
} from './time.util.js';

const JAKARTA = 'Asia/Jakarta';

describe('time utilities', () => {
  it('derives the local date in the business timezone', () => {
    expect(localDate(new Date('2026-11-05T16:59:59Z'), JAKARTA)).toBe('2026-11-05');
    expect(localDate(new Date('2026-11-05T17:00:00Z'), JAKARTA)).toBe('2026-11-06');
  });

  it('formats local wall-clock time', () => {
    expect(localTime(new Date('2026-11-05T01:39:00Z'), JAKARTA)).toBe('08:39:00');
    expect(localTime(new Date('2026-11-05T11:00:00Z'), JAKARTA)).toBe('18:00:00');
  });

  it('normalizes and compares times', () => {
    expect(normalizeTime('9:05')).toBe('09:05:00');
    expect(compareTimes('09:00:30', '09:00:00')).toBeGreaterThan(0);
    expect(compareTimes('09:00:00', '09:00:00')).toBe(0);
    expect(timeToMinutes('09:30:00')).toBe(570);
  });

  it('flags a check-in after the required time as late with minutes', () => {
    const result = evaluateLateness(
      new Date('2026-11-05T02:12:00Z'), // 09:12 Jakarta
      '09:00:00',
      JAKARTA,
    );

    expect(result.late).toBe(true);
    expect(result.lateMinutes).toBe(12);
    expect(result.checkInLocalTime).toBe('09:12:00');
  });

  it('is not late exactly at the required time', () => {
    const result = evaluateLateness(new Date('2026-11-05T02:00:00Z'), '09:00:00', JAKARTA);
    expect(result.late).toBe(false);
    expect(result.lateMinutes).toBe(0);
  });

  it('only marks absence after the day cutoff', () => {
    expect(
      hasCutoffPassed(new Date('2026-11-05T10:59:00Z'), '18:00:00', JAKARTA),
    ).toBe(false);
    expect(
      hasCutoffPassed(new Date('2026-11-05T11:00:00Z'), '18:00:00', JAKARTA),
    ).toBe(true);
  });

  it('rounds positive minute differences up', () => {
    expect(minutesBetween('09:00:01', '09:00:00')).toBe(1);
    expect(minutesBetween('09:00:00', '09:10:00')).toBe(0);
  });

  it('handles weekdays, date arithmetic and ranges', () => {
    expect(weekdayOf('2026-11-05')).toBe(4); // Thursday
    expect(weekdayOf('2026-11-08')).toBe(7); // Sunday
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(eachDate('2026-11-01', '2026-11-03')).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
  });

  it('validates IANA timezones', () => {
    expect(isValidTimeZone(JAKARTA)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
