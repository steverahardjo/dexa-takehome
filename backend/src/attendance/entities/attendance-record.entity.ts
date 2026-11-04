import type { Relation } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../../employee/entities/employee.entity.js';

@Entity({ name: 'attendance_records' })
@Unique('uq_attendance_employee_date', ['employeeId', 'attendanceDate'])
@Index(['employeeId', 'attendanceDate'])
@Index(['attendanceDate'])
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ name: 'check_in_time', type: 'timestamptz', nullable: true })
  checkInTime: Date | null;

  @Column({ name: 'check_out_time', type: 'timestamptz', nullable: true })
  checkOutTime: Date | null;

  @Column({ type: 'boolean', default: false })
  late: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ name: 'picture_url', type: 'text', nullable: true })
  pictureUrl: string | null;

  /** Snapshot of the schedule used when the check-in was evaluated. */
  @Column({ name: 'required_check_in', type: 'time', nullable: true })
  requiredCheckIn: string | null;

  @Column({ name: 'required_check_out', type: 'time', nullable: true })
  requiredCheckOut: string | null;

  @Column({ name: 'late_minutes', type: 'integer', default: 0 })
  lateMinutes: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employee_id' })
  employee: Relation<Employee>;
}
