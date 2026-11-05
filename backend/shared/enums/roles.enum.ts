export enum Role {
  EMPLOYEE = 'EMPLOYEE',
  ADMIN = 'ADMIN',
  MASTER_ADMIN = 'MASTER_ADMIN',
}

export enum IdentityStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export enum EmploymentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  TERMINATED = 'TERMINATED',
}

export enum AttendanceStatus {
  ON_TIME = 'ON_TIME',
  LATE = 'LATE',
  NOT_CHECKED_IN = 'NOT_CHECKED_IN',
  ON_LEAVE = 'ON_LEAVE',
  NOT_WORKING = 'NOT_WORKING',
  ABSENT = 'ABSENT',
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum ScheduleSource {
  EMPLOYEE = 'EMPLOYEE',
  DIVISION = 'DIVISION',
  COMPANY = 'COMPANY',
}
