import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/roles.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { CreateLeaveDto, LeaveQueryDto, UpdateLeaveStatusDto } from '../dto/leave.dto.js';
import { LeaveService } from '../services/leave.service.js';

@Controller('employees/:employeeId/leaves')
@Roles(Role.ADMIN, Role.MASTER_ADMIN)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Post()
  create(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateLeaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leaveService.create(employeeId, dto, user.email);
  }

  @Get()
  list(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Query() query: LeaveQueryDto,
  ) {
    query.employeeId = employeeId;
    return this.leaveService.list(query);
  }

  @Patch(':leaveId')
  update(
    @Param('leaveId', new ParseUUIDPipe()) leaveId: string,
    @Body() dto: UpdateLeaveStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leaveService.updateStatus(leaveId, dto, user.email);
  }
}
