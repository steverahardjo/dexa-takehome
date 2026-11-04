import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'employee_attendance_summary' })
export class EmployeeAttendanceSummary {
  @PrimaryColumn({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @PrimaryColumn({ type: 'integer' })
  year: number;

  @Column({ name: 'working_days', type: 'integer', default: 0 })
  workingDays: number;

  @Column({ name: 'present_days', type: 'integer', default: 0 })
  presentDays: number;

  @Column({ name: 'on_time_days', type: 'integer', default: 0 })
  onTimeDays: number;

  @Column({ name: 'late_days', type: 'integer', default: 0 })
  lateDays: number;

  @Column({ name: 'absent_days', type: 'integer', default: 0 })
  absentDays: number;

  @Column({ name: 'leave_days', type: 'integer', default: 0 })
  leaveDays: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
