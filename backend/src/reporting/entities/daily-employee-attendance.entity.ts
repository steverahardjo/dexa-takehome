import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { AttendanceStatus } from '../../common/enums/roles.enum.js';

/** One projected attendance day per employee. Rebuildable from source modules. */
@Entity({ name: 'daily_employee_attendance' })
@Unique('uq_daily_employee_date', ['employeeId', 'attendanceDate'])
@Index(['attendanceDate', 'status'])
@Index(['employeeId', 'attendanceDate'])
export class DailyEmployeeAttendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ name: 'employee_name', type: 'varchar', length: 255 })
  employeeName: string;

  @Column({ name: 'division_names', type: 'varchar', length: 512, default: '' })
  divisionNames: string;

  @Column({ name: 'required_check_in', type: 'time', nullable: true })
  requiredCheckIn: string | null;

  @Column({ name: 'actual_check_in', type: 'timestamptz', nullable: true })
  actualCheckIn: Date | null;

  @Column({ name: 'required_check_out', type: 'time', nullable: true })
  requiredCheckOut: string | null;

  /** Schedule timezone used to display the actual timestamps. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone: string | null;

  @Column({ name: 'actual_check_out', type: 'timestamptz', nullable: true })
  actualCheckOut: Date | null;

  @Column({
    type: 'enum',
    enum: AttendanceStatus,
    enumName: 'attendance_status_enum',
  })
  status: AttendanceStatus;

  @Column({ name: 'late_minutes', type: 'integer', default: 0 })
  lateMinutes: number;

  @Column({ name: 'picture_url', type: 'text', nullable: true })
  pictureUrl: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
