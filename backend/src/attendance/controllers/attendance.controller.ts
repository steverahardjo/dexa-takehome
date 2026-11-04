import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/roles.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import {
  AttendanceQueryDto,
  CheckInDto,
  CheckOutDto,
  CorrectAttendanceDto,
} from '../dto/attendance.dto.js';
import { AttendanceService } from '../services/attendance.service.js';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('check-in')
  @UseInterceptors(
    FileInterceptor('picture', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: MAX_PHOTO_BYTES },
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException('Only JPEG, PNG or WebP attendance photos are accepted'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckInDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.attendanceService.checkIn(user.employeeId, dto, file);
  }

  @Post('check-out')
  checkOut(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckOutDto) {
    return this.attendanceService.checkOut(user.employeeId, dto);
  }

  @Get('me')
  myHistory(@CurrentUser() user: AuthenticatedUser, @Query() query: AttendanceQueryDto) {
    return this.attendanceService.findForEmployee(user.employeeId, query);
  }

  @Get('me/:date')
  myDay(@CurrentUser() user: AuthenticatedUser, @Param('date') date: string) {
    return this.attendanceService.findForEmployeeDate(user.employeeId, date);
  }

  @Get('employee/:id')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  employeeHistory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: AttendanceQueryDto,
  ) {
    return this.attendanceService.findForEmployee(id, query);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MASTER_ADMIN)
  correct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CorrectAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendanceService.correct(id, dto, user.identityId);
  }
}
