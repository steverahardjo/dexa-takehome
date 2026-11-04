import type { Relation } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AttendanceRecord } from './attendance-record.entity.js';

/** Append-only audit trail for manual attendance corrections. */
@Entity({ name: 'attendance_corrections' })
@Index(['attendanceId', 'createdAt'])
export class AttendanceCorrection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId: string;

  @Column({ name: 'corrected_by', type: 'uuid' })
  correctedBy: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'previous_values', type: 'jsonb' })
  previousValues: Record<string, unknown>;

  @Column({ name: 'new_values', type: 'jsonb' })
  newValues: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => AttendanceRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attendance_id' })
  attendance: Relation<AttendanceRecord>;
}
