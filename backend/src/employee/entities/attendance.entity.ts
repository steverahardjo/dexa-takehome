import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Employee } from './employee.entity.js';

/**
 * One check-in per employee per local day. `clockInAt` is the server clock;
 * `capturedAt` is the phone's clock, kept as evidence only.
 */
@Entity('attendances')
@Index('IDX_attendances_employee_day', ['empId', 'workDate'], { unique: true })
@Index('IDX_attendances_work_date', ['workDate'])
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'emp_id', type: 'varchar', length: 36 })
  empId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emp_id' })
  employee: Employee;

  /** The local day the check-in belongs to, `YYYY-MM-DD`. */
  @Column({ name: 'work_date', type: 'date' })
  workDate: string;

  /** Authoritative time of the check-in: captured on the server. */
  @Column({ name: 'clock_in_at', type: 'datetime' })
  clockInAt: Date;

  /** Photo evidence, stored as the data URL the phone produced. */
  @Column({ type: 'longtext', nullable: true })
  evidence: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: string | null;

  /** GPS accuracy in metres. */
  @Column({ type: 'int', nullable: true })
  accuracy: number | null;

  /** The phone's clock, kept as evidence only. */
  @Column({ name: 'captured_at', type: 'datetime', nullable: true })
  capturedAt: Date | null;

  /** `capture` for the QR photo flow, `manual` for the dashboard button. */
  @Column({ type: 'varchar', length: 16, default: 'manual' })
  source: 'capture' | 'manual';

  @CreateDateColumn()
  createdAt: Date;
}
