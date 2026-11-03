import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { env } from '../../config/env.js';
import type { TokenUser } from '../../auth/guards/jwt-auth.guard.js';
import type { CapturePosition } from '../dto/attendance.dto.js';
import type { SubmitCaptureDto } from '../dto/attendance.dto.js';
import { CaptureSession } from '../entities/capture-session.entity.js';
import { Employee } from '../entities/employee.entity.js';
import {
  EmployeePresenter,
  positionOf,
  type EmployeeView,
} from '../presenter/employee.presenter.js';
import { AttendanceService } from './attendance.service.js';

/** A QR lives this long; matches `CAPTURE_SESSION_TTL_MS` in the frontend. */
export const CAPTURE_TTL_SECONDS = env.int('CAPTURE_TTL_SECONDS', 10 * 60);

export interface CaptureSubmissionView {
  image: string;
  /** ISO timestamp, from the phone. */
  capturedAt: string;
  position: CapturePosition | null;
}

/** Exactly the `CaptureSession` shape the frontend polls. */
export interface CaptureSessionView {
  id: string;
  employeeId: string;
  employeeName: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'submitted';
  submission: CaptureSubmissionView | null;
}

/**
 * The QR hand-off: the desktop opens a session, the phone fills it in, the
 * desktop confirms it. The session id is the capability the phone uses.
 */
@Injectable()
export class CaptureService {
  constructor(
    @InjectRepository(CaptureSession)
    private readonly sessions: Repository<CaptureSession>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly attendance: AttendanceService,
    private readonly presenter: EmployeePresenter,
  ) {}

  /** Opens a session for one employee and returns what the QR points at. */
  async create(employeeId: string): Promise<CaptureSessionView> {
    const employee = await this.findEmployee(employeeId);

    const session = await this.sessions.save(
      this.sessions.create({
        empId: employee.id,
        status: 'pending',
        expiresAt: new Date(Date.now() + CAPTURE_TTL_SECONDS * 1000),
      }),
    );

    return this.view(session, employee);
  }

  /** What the desktop polls while the QR is on screen. */
  async status(id: string): Promise<CaptureSessionView> {
    const session = await this.live(id);

    return this.view(session, session.employee);
  }

  /** Stores the photo the phone sent; the desktop confirms it next. */
  async submit(id: string, dto: SubmitCaptureDto): Promise<CaptureSessionView> {
    const session = await this.live(id);

    if (session.status !== 'pending') {
      throw new ConflictException('This QR was already used');
    }

    session.image = dto.image;
    session.capturedAt = new Date(dto.capturedAt);
    session.latitude =
      dto.position?.latitude !== undefined
        ? String(dto.position.latitude)
        : null;
    session.longitude =
      dto.position?.longitude !== undefined
        ? String(dto.position.longitude)
        : null;
    session.accuracy = dto.position?.accuracy ?? null;
    session.status = 'submitted';

    return this.view(await this.sessions.save(session), session.employee);
  }

  /** The desktop releases the session once the check-in is stored. */
  async remove(id: string): Promise<void> {
    await this.sessions.delete({ id });
  }

  /**
   * The desktop confirms the photo: writes today's check-in with the evidence
   * and returns the employee as the dashboard renders them.
   */
  async confirm(id: string, user: TokenUser): Promise<EmployeeView> {
    const session = await this.live(id);
    const employee = session.employee;

    if (user.role !== 'HR Admin' && user.id !== session.empId) {
      throw new ForbiddenException('This photo belongs to another employee');
    }

    if (session.status === 'pending' || !session.image) {
      throw new ConflictException('The phone has not sent a photo yet');
    }

    if (session.status !== 'confirmed') {
      await this.attendance.record(employee, {
        evidence: session.image,
        position: positionOf(session),
        capturedAt: session.capturedAt,
        source: 'capture',
        // The photo was reviewed on screen, so it wins over an older check-in.
        replace: true,
      });

      session.status = 'confirmed';
      await this.sessions.save(session);
    }

    return this.presenter.one(employee);
  }

  /** The session behind `id`, refusing the missing and the expired alike. */
  private async live(id: string): Promise<CaptureSession> {
    const session = await this.sessions.findOne({
      where: { id },
      relations: { employee: true },
    });

    if (!session) {
      throw new NotFoundException(
        'This QR code has expired. Start again on the desktop.',
      );
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessions.delete({ id });
      throw new NotFoundException(
        'This QR code has expired. Start again on the desktop.',
      );
    }

    return session;
  }

  private async findEmployee(id: string): Promise<Employee> {
    const employee = await this.employees.findOne({ where: { id } });

    if (!employee) {
      throw new NotFoundException(`No employee with id ${id}`);
    }

    return employee;
  }

  private view(
    session: CaptureSession,
    employee: Employee,
  ): CaptureSessionView {
    const submitted = session.status !== 'pending' && session.image;

    return {
      id: session.id,
      employeeId: session.empId,
      employeeName: employee.name,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      // `confirmed` is internal; the frontend only knows the two public states.
      status: session.status === 'pending' ? 'pending' : 'submitted',
      submission: submitted
        ? {
            image: session.image!,
            capturedAt: (session.capturedAt ?? session.createdAt).toISOString(),
            position: positionOf(session),
          }
        : null,
    };
  }
}
