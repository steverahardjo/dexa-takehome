/**
 * Named TypeORM data sources, one per service database. Names keep the
 * connections distinguishable when several service modules run in the same
 * process (tests, or a future API gateway).
 */
export const AUTH_DATA_SOURCE = 'auth';
export const EMPLOYEE_DATA_SOURCE = 'employee';
export const ATTENDANCE_DATA_SOURCE = 'attendance';
