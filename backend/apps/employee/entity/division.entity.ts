import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'divisions' })
@Index(['name'], { unique: true })
export class Division {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Unique through the index above, not on the column: declaring both makes
  // TypeORM create two indexes with the same generated name.
  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
