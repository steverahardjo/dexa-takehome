import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { AttendanceStatus } from '../../../shared/enums/roles.enum.js';

/**
 * One row per employee per local day.
 *
 * `employee_id` is a cross-service reference: employees live in the employee
 * service's database, so there is no foreign key here.
 */
@Entity({ name: 'attendance_records' })
@Unique('uq_attendance_employee_date', ['employeeId', 'attendanceDate'])
@Index(['employeeId', 'attendanceDate'])
@Index(['attendanceDate'])
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'char', length: 36 })
  employeeId: string;

  /** Local day the record belongs to, `YYYY-MM-DD`. */
  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({
    name: 'check_in_time',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  checkInTime: Date | null;

  @Column({
    type: 'enum',
    enum: AttendanceStatus,
    default: AttendanceStatus.NOT_CHECKED_IN,
  })
  status: AttendanceStatus;

  @Column({ type: 'boolean', default: false })
  late: boolean;

  @Column({ name: 'late_minutes', type: 'integer', default: 0 })
  lateMinutes: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  /** Object key of the check-in proof in the storage bucket. */
  @Column({ name: 'proof_key', type: 'varchar', length: 1024, nullable: true })
  proofKey: string | null;

  /** Company check-in time used when this row was evaluated (audit). */
  @Column({
    name: 'required_check_in',
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  requiredCheckIn: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
