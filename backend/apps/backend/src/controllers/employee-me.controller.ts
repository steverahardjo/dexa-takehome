import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../../../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../../../auth/guards/jwt.guard.js';
import type { JwtPayload } from '../../../auth/services/jwt.service.js';
import type { MeView } from '../../../../shared/contracts/gateway.contracts.js';
import { requireEmployeeId } from '../auth/claims.js';
import { OPENAPI_SECURITY } from '../docs/openapi.js';
import { MeViewModel } from '../docs/models.js';
import { DayQueryDto } from '../dto/attendance.dto.js';
import { MeService } from '../services/me.service.js';

/**
 * The phone screen: the signed-in employee and their attendance for the day.
 * Only a valid token is needed — the person can only ever read their own row.
 */
@ApiTags('Employee')
@ApiBearerAuth(OPENAPI_SECURITY)
@ApiUnauthorizedResponse({ description: 'Missing, expired or malformed token' })
@Controller('employee')
@UseGuards(AuthGuard)
export class EmployeeMeController {
  constructor(private readonly me: MeService) {}

  @Get('me')
  @ApiOperation({
    summary: 'The signed-in employee and their day',
    description:
      'Composed from two services, which is why it is a single call for the phone screen. `attendance` is `null` when there is no record for the day — the screen shows "not checked in yet".',
  })
  @ApiOkResponse({
    type: MeViewModel,
    description: 'The employee and their day',
  })
  @ApiForbiddenResponse({
    description: 'The account exists but is not linked to an employee',
  })
  findMe(
    @CurrentUser() user: JwtPayload,
    @Query() query: DayQueryDto,
  ): Promise<MeView> {
    return this.me.view(requireEmployeeId(user), query.date);
  }
}
