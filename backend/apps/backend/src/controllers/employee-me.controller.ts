import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../../../auth/guards/jwt.guard.js';
import type { JwtPayload } from '../../../auth/services/jwt.service.js';
import type { MeView } from '../../../../shared/contracts/gateway.contracts.js';
import { requireEmployeeId } from '../auth/claims.js';
import { DayQueryDto } from '../dto/attendance.dto.js';
import { MeService } from '../services/me.service.js';

/**
 * The phone screen: the signed-in employee and their attendance for the day.
 * Only a valid token is needed — the person can only ever read their own row.
 */
@Controller('employee')
@UseGuards(AuthGuard)
export class EmployeeMeController {
  constructor(private readonly me: MeService) {}

  @Get('me')
  findMe(
    @CurrentUser() user: JwtPayload,
    @Query() query: DayQueryDto,
  ): Promise<MeView> {
    return this.me.view(requireEmployeeId(user), query.date);
  }
}
