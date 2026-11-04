import { ScheduleSource } from '../../common/enums/roles.enum.js';
import type { WorkSchedule } from '../entities/work-schedule.entity.js';
import { resolveScheduleFromList } from './schedule-resolution.js';

function schedule(overrides: Partial<WorkSchedule>): WorkSchedule {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    employeeId: null,
    divisionId: null,
    effectiveFrom: '2026-01-01',
    effectiveUntil: null,
    workingDays: [1, 2, 3, 4, 5],
    requiredCheckIn: '09:00:00',
    requiredCheckOut: '18:00:00',
    timezone: 'Asia/Jakarta',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as WorkSchedule;
}

describe('schedule resolution', () => {
  const employeeId = 'employee-1';
  const divisionId = 'division-1';

  it('falls back to the company default', () => {
    const resolved = resolveScheduleFromList(
      [schedule({ id: 'company' })],
      employeeId,
      [],
      '2026-11-05',
    );

    expect(resolved?.scheduleId).toBe('company');
    expect(resolved?.source).toBe(ScheduleSource.COMPANY);
  });

  it('prefers a division schedule over the company default', () => {
    const resolved = resolveScheduleFromList(
      [
        schedule({ id: 'company' }),
        schedule({ id: 'division', divisionId, requiredCheckIn: '08:30:00' }),
      ],
      employeeId,
      [divisionId],
      '2026-11-05',
    );

    expect(resolved?.scheduleId).toBe('division');
    expect(resolved?.source).toBe(ScheduleSource.DIVISION);
    expect(resolved?.requiredCheckIn).toBe('08:30:00');
  });

  it('prefers an employee schedule over division and company', () => {
    const resolved = resolveScheduleFromList(
      [
        schedule({ id: 'company' }),
        schedule({ id: 'division', divisionId }),
        schedule({ id: 'employee', employeeId, requiredCheckIn: '07:45' }),
      ],
      employeeId,
      [divisionId],
      '2026-11-05',
    );

    expect(resolved?.scheduleId).toBe('employee');
    expect(resolved?.source).toBe(ScheduleSource.EMPLOYEE);
    expect(resolved?.requiredCheckIn).toBe('07:45:00');
  });

  it('ignores division schedules for divisions the employee does not belong to', () => {
    const resolved = resolveScheduleFromList(
      [schedule({ id: 'company' }), schedule({ id: 'other', divisionId: 'other-division' })],
      employeeId,
      [divisionId],
      '2026-11-05',
    );

    expect(resolved?.scheduleId).toBe('company');
  });

  it('respects effective windows and falls back when expired', () => {
    const resolved = resolveScheduleFromList(
      [
        schedule({ id: 'company' }),
        schedule({
          id: 'expired',
          employeeId,
          effectiveFrom: '2025-01-01',
          effectiveUntil: '2025-12-31',
        }),
      ],
      employeeId,
      [],
      '2026-11-05',
    );

    expect(resolved?.scheduleId).toBe('company');
  });

  it('does not apply a schedule before it becomes effective', () => {
    const resolved = resolveScheduleFromList(
      [schedule({ id: 'future', employeeId, effectiveFrom: '2027-01-01' })],
      employeeId,
      [],
      '2026-11-05',
    );

    expect(resolved).toBeNull();
  });

  it('picks the latest effective schedule when ranks tie', () => {
    const resolved = resolveScheduleFromList(
      [
        schedule({ id: 'older', employeeId, effectiveFrom: '2026-01-01' }),
        schedule({ id: 'newer', employeeId, effectiveFrom: '2026-06-01' }),
      ],
      employeeId,
      [],
      '2026-11-05',
    );

    expect(resolved?.scheduleId).toBe('newer');
  });
});
