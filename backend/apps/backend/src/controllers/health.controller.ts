import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthModel } from '../docs/models.js';

/** Liveness probe for the container orchestrator. */
@ApiTags('Health')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Answers without touching a downstream service: a failing gateway is a gateway problem, not a service one.',
  })
  @ApiOkResponse({ type: HealthModel, description: 'The gateway is up' })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
