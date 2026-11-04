import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/roles.enum.js';
import { CreateDivisionDto, UpdateDivisionDto } from '../dto/division.dto.js';
import { DivisionService } from '../services/division.service.js';

@Controller('divisions')
@Roles(Role.ADMIN, Role.MASTER_ADMIN)
export class DivisionController {
  constructor(private readonly divisionService: DivisionService) {}

  @Get()
  list() {
    return this.divisionService.list();
  }

  @Post()
  create(@Body() dto: CreateDivisionDto) {
    return this.divisionService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDivisionDto,
  ) {
    return this.divisionService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.divisionService.remove(id);
  }
}
