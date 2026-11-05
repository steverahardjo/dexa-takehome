import { Controller, Get } from '@nestjs/common';

/** Liveness probe for the container orchestrator. */
@Controller()
export class HealthController {
  @Get('health')
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
