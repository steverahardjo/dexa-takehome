import { ScheduleSource } from '../../common/enums/roles.enum.js';
import { normalizeTime } from '../../common/time/time.util.js';
import type { WorkSchedule } from '../entities/work-schedule.entity.js';

export interface ResolvedSchedule {
  scheduleId: string;
  source: ScheduleSource;
  workingDays: number[];
  requiredCheckIn: string;
  requiredCheckOut: string;
  timezone: string;
}

const RANK: Record<ScheduleSource, number> = {
  [ScheduleSource.EMPLOYEE]: 3,
  [ScheduleSource.DIVISION]: 2,
  [ScheduleSource.COMPANY]: 1,
};

function sourceOf(schedule: Pick<WorkSchedule, 'employeeId' | 'divisionId'>): ScheduleSource {
  if (schedule.employeeId) return ScheduleSource.EMPLOYEE;
  if (schedule.divisionId) return ScheduleSource.DIVISION;
  return ScheduleSource.COMPANY;
}

function isEffectiveOn(schedule: WorkSchedule, date: string): boolean {
  if (schedule.effectiveFrom > date) return false;
  if (schedule.effectiveUntil && schedule.effectiveUntil < date) return false;
  return true;
}

/** Pure resolution rule: employee > division > company, newest wins. */
export function resolveScheduleFromList(
  schedules: WorkSchedule[],
  employeeId: string,
  divisionIds: string[],
  date: string,
): ResolvedSchedule | null {
  const candidates = schedules.filter((schedule) => {
    if (!isEffectiveOn(schedule, date)) return false;
    if (schedule.employeeId) return schedule.employeeId === employeeId;
    if (schedule.divisionId) return divisionIds.includes(schedule.divisionId);
    return true;
  });

  if (!candidates.length) return null;

  candidates.sort((left, right) => {
    const rankDiff = RANK[sourceOf(right)] - RANK[sourceOf(left)];
    if (rankDiff !== 0) return rankDiff;
    if (left.effectiveFrom !== right.effectiveFrom) {
      return right.effectiveFrom.localeCompare(left.effectiveFrom);
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  const chosen = candidates[0];
  return {
    scheduleId: chosen.id,
    source: sourceOf(chosen),
    workingDays: [...chosen.workingDays].sort((a, b) => a - b),
    requiredCheckIn: normalizeTime(chosen.requiredCheckIn),
    requiredCheckOut: normalizeTime(chosen.requiredCheckOut),
    timezone: chosen.timezone,
  };
}

