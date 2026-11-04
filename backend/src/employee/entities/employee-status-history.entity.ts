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
import { EmploymentStatus } from '../../common/enums/roles.enum.js';
import { Employee } from './employee.entity.js';

@Entity({ name: 'employee_status_history' })
@Index(['employeeId', 'effectiveDate'])
export class EmployeeStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({
    name: 'previous_status',
    type: 'enum',
    enum: EmploymentStatus,
    enumName: 'employment_status_enum',
  })
  previousStatus: EmploymentStatus;

  @Column({
    name: 'new_status',
    type: 'enum',
    enum: EmploymentStatus,
    enumName: 'employment_status_enum',
  })
  newStatus: EmploymentStatus;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Employee, (employee) => employee.statusHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Relation<Employee>;
}
