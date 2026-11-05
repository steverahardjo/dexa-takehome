import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmploymentStatus } from '../../../shared/enums/roles.enum.js';
import { Division } from './division.entity.js';

@Entity({ name: 'employees' })
@Index(['employeeNumber'], { unique: true })
@Index(['email'])
@Index(['employmentStatus'])
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Unique through the index above: a second unique constraint would make
  // TypeORM emit the same generated index name twice and fail the sync.
  @Column({ name: 'employee_number', type: 'varchar', length: 32 })
  employeeNumber: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  /** Object key in the storage bucket, as handed out by the storage service. */
  @Column({ name: 'avatar_key', type: 'varchar', length: 1024, nullable: true })
  avatarKey: string | null;

  @Column({
    name: 'employment_status',
    type: 'enum',
    enum: EmploymentStatus,
    default: EmploymentStatus.ACTIVE,
  })
  employmentStatus: EmploymentStatus;

  @Column({ name: 'joined_at', type: 'date' })
  joinedAt: string;

  @Column({ name: 'terminated_at', type: 'date', nullable: true })
  terminatedAt: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;

  @ManyToMany(() => Division, { eager: false })
  @JoinTable({
    name: 'employee_divisions',
    joinColumn: { name: 'employee_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'division_id', referencedColumnName: 'id' },
  })
  divisions: Division[];
}
