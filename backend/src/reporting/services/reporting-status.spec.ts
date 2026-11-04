import { AttendanceStatus } from '../../common/enums/roles.enum.js';
import { deriveAttendanceStatus, type DayStatusInput } from './reporting-status.js';

const BASE: DayStatusInput = {
  date: '2026-11-05',
  today: '2026-11-05',
  now: new Date('2026-11-05T01:00:00Z'), // 08:00 Jakarta
  scheduled: true,
  requiredCheckIn: '09:00:00',
  requiredCheckOut: '18:00:00',
  timezone: 'Asia/Jakarta',
  onLeave: false,
  attendance: null,
};

describe('attendance status derivation', () => {
  it('marks a checked-in employee on time', () => {
    const result = deriveAttendanceStatus({
      ...BASE,
      attendance: {
        checkInTime: new Date('2026-11-05T01:55:00Z'),
        checkOutTime: null,
        late: false,
        lateMinutes: 0,
      },
    });

    expect(result.status).toBe(AttendanceStatus.ON_TIME);
    expect(result.lateMinutes).toBe(0);
  });

  it('marks a late employee and keeps the recorded minutes', () => {
    const result = deriveAttendanceStatus({
      ...BASE,
      attendance: {
        checkInTime: new Date('2026-11-05T02:25:00Z'),
        checkOutTime: null,
        late: true,
        lateMinutes: 25,
      },
    });

    expect(result.status).toBe(AttendanceStatus.LATE);
    expect(result.lateMinutes).toBe(25);
  });

  it('recomputes late minutes when the record predates the field', () => {
    const result = deriveAttendanceStatus({
      ...BASE,
      attendance: {
        checkInTime: new Date('2026-11-05T02:10:00Z'), // 09:10 Jakarta
        checkOutTime: null,
        late: true,
        lateMinutes: 0,
      },
    });

    expect(result.status).toBe(AttendanceStatus.LATE);
    expect(result.lateMinutes).toBe(10);
  });

  it('marks approved leave on a scheduled day', () => {
    const result = deriveAttendanceStatus({ ...BASE, onLeave: true });
    expect(result.status).toBe(AttendanceStatus.ON_LEAVE);
  });

  it('never treats an unscheduled day as leave or absence', () => {
    expect(deriveAttendanceStatus({ ...BASE, scheduled: false }).status).toBe(
      AttendanceStatus.NOT_WORKING,
    );
    expect(
      deriveAttendanceStatus({ ...BASE, scheduled: false, onLeave: true }).status,
    ).toBe(AttendanceStatus.NOT_WORKING);
  });

  it('is NOT_CHECKED_IN before the cutoff, not absent', () => {
    expect(deriveAttendanceStatus(BASE).status).toBe(AttendanceStatus.NOT_CHECKED_IN);
  });

  it('becomes ABSENT once the cutoff passes today', () => {
    const result = deriveAttendanceStatus({
      ...BASE,
      now: new Date('2026-11-05T11:05:00Z'), // 18:05 Jakarta
    });

    expect(result.status).toBe(AttendanceStatus.ABSENT);
  });

  it('marks past scheduled days without a check-in as absent', () => {
    const result = deriveAttendanceStatus({
      ...BASE,
      date: '2026-11-04',
      now: new Date('2026-11-05T01:00:00Z'),
    });

    expect(result.status).toBe(AttendanceStatus.ABSENT);
  });

  it('treats a present employee as on time even on an unscheduled day', () => {
    const result = deriveAttendanceStatus({
      ...BASE,
      scheduled: false,
      attendance: {
        checkInTime: new Date('2026-11-05T01:55:00Z'),
        checkOutTime: null,
        late: false,
        lateMinutes: 0,
      },
    });

    expect(result.status).toBe(AttendanceStatus.ON_TIME);
  });
});
