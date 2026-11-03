import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Employee } from './employee.entity.js';

export const CAPTURE_STATUSES = ['pending', 'submitted', 'confirmed'] as const;
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

/**
 * The hand-off between the desktop and the phone. The unguessable id in the QR
 * is the capability: the phone needs no token to fill it in.
 */
@Entity('capture_sessions')
export class CaptureSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'emp_id', type: 'varchar', length: 36 })
  empId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emp_id' })
  employee: Employee;

  @Column({ type: 'enum', enum: CAPTURE_STATUSES, default: 'pending' })
  status: CaptureStatus;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  /** Photo evidence, stored as the data URL the phone produced. */
  @Column({ type: 'longtext', nullable: true })
  image: string | null;

  @Column({ name: 'captured_at', type: 'datetime', nullable: true })
  capturedAt: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: string | null;

  @Column({ type: 'int', nullable: true })
  accuracy: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
