import type { EmploymentStatus } from '../enums/roles.enum.js';

/**
 * Internal TCP API of the employee service.
 *
 * `avatarUrl` on every returned view is a MinIO presigned URL: it is
 * temporary by design and must be refreshed by calling the pattern again.
 */
export const EMPLOYEE_PATTERNS = {
  create: 'employee.create',
  update: 'employee.update',
  delete: 'employee.delete',
  get: 'employee.get',
  list: 'employee.list',
  /** Every ACTIVE employee, minimal fields (used by attendance). */
  listActive: 'employee.list-active',
  /** Every division, for the picker that fills `divisionIds`. */
  divisions: 'employee.divisions',
  /** Reserves a key + presigned PUT URL for an employee avatar. */
  avatarUploadUrl: 'employee.avatar-upload-url',
} as const;

/** Minimal employee projection other services may hold. */
export interface ActiveEmployee {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  divisionIds: string[];
}

export interface EmployeeView {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  employmentStatus: EmploymentStatus;
  joinedAt: string;
  terminatedAt: string | null;
  divisionIds: string[];
  avatarKey: string | null;
  /** Temporary presigned URL, or null when the employee has no avatar. */
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A division an employee can belong to. The employee service owns the table;
 * there are only a handful, so it is never paginated.
 */
export interface DivisionView {
  id: string;
  name: string;
  description: string | null;
}

export interface EmployeeListResult {
  items: EmployeeView[];
  total: number;
  page: number;
  limit: number;
}

export interface DeletedEmployee {
  id: string;
  deleted: true;
}
