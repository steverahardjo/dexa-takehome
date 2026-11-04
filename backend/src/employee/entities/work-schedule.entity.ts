import type { Relation } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Division } from './division.entity.js';
import { Employee } from './employee.entity.js';

/**
 * A schedule applies to one employee, one division, or the whole company when
 * both foreign keys are null. Resolution order: employee > division > company.
 */
@Entity({ name: 'work_schedules' })
@Index(['employeeId', 'effectiveFrom'])
@Index(['divisionId', 'effectiveFrom'])
export class WorkSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_until', type: 'date', nullable: true })
  effectiveUntil: string | null;

  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  @Column({ name: 'working_days', type: 'int', array: true })
  workingDays: number[];

  @Column({ name: 'required_check_in', type: 'time' })
  requiredCheckIn: string;

  @Column({ name: 'required_check_out', type: 'time' })
  requiredCheckOut: string;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Employee, (employee) => employee.schedules, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Relation<Employee> | null;

  @ManyToOne(() => Division, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'division_id' })
  division: Relation<Division> | null;
}
