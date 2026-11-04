import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CreateDivisionDto, UpdateDivisionDto } from '../dto/division.dto.js';
import { Division } from '../entities/division.entity.js';

@Injectable()
export class DivisionService {
  constructor(
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
  ) {}

  async list(): Promise<Array<Division & { employeeCount: number }>> {
    const rows = await this.divisionRepository
      .createQueryBuilder('division')
      .leftJoin('employee_divisions', 'membership', 'membership.division_id = division.id')
      .addSelect('COUNT(membership.employee_id)', 'employeeCount')
      .groupBy('division.id')
      .orderBy('division.name', 'ASC')
      .getRawAndEntities();

    return rows.entities.map((division, index) => ({
      id: division.id,
      name: division.name,
      description: division.description,
      createdAt: division.createdAt,
      employeeCount: Number(rows.raw[index]?.employeeCount ?? 0),
    }));
  }

  async getOrThrow(id: string): Promise<Division> {
    const division = await this.divisionRepository.findOne({ where: { id } });
    if (!division) throw new NotFoundException('Division not found');
    return division;
  }

  async create(dto: CreateDivisionDto): Promise<Division> {
    await this.assertNameAvailable(dto.name);
    return this.divisionRepository.save(
      this.divisionRepository.create({
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
      }),
    );
  }

  async update(id: string, dto: UpdateDivisionDto): Promise<Division> {
    const division = await this.getOrThrow(id);
    if (dto.name !== undefined) {
      await this.assertNameAvailable(dto.name, id);
      division.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      division.description = dto.description;
    }
    return this.divisionRepository.save(division);
  }

  async remove(id: string): Promise<void> {
    const division = await this.getOrThrow(id);
    const rows: Array<{ count: string | number }> = await this.divisionRepository.manager.query(
      'SELECT COUNT(*)::int AS count FROM employee_divisions WHERE division_id = $1',
      [id],
    );
    const members = Number(rows[0]?.count ?? 0);

    if (members > 0) {
      throw new ConflictException(
        'This division still has employees assigned; reassign them before deleting it',
      );
    }

    await this.divisionRepository.remove(division);
  }

  private async assertNameAvailable(name: string, exceptId?: string): Promise<void> {
    const existing = await this.divisionRepository.findOne({ where: { name: name.trim() } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('A division with that name already exists');
    }
  }
}
