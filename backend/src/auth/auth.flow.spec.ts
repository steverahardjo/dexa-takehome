import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';

import { Employee } from '../employee/entities/employee.entity.js';
import { AuthService, type RoleChoice } from './services/auth.service.js';
import { EmailService } from './services/email.service.js';
import { OtpService } from './services/otp.service.js';
import { TokenService } from './services/token.service.js';
import { OtpVerification } from './entities/otp-verification.entity.js';

function matches(
  row: Record<string, any>,
  where: Record<string, any>,
): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected instanceof FindOperator) {
      return expected.type === 'isNull' ? row[key] === null : false;
    }

    return row[key] === expected;
  });
}

describe('auth flow (in-memory persistence)', () => {
  const rows: any[] = [];
  const sent: any[] = [];

  const otpRepository = {
    insert: async (row: any) => {
      rows.push({
        id: `otp-${rows.length + 1}`,
        createdAt: new Date(Date.now() + rows.length * 1000),
        verifiedAt: null,
        attempts: 0,
        ...row,
      });
    },
    findOne: async ({ where }: any) =>
      rows
        .filter((row) => matches(row, where))
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
    update: async (where: any, patch: any) => {
      rows
        .filter((row) => matches(row, where))
        .forEach((row) => Object.assign(row, patch));
    },
    increment: async (where: any, field: string, by: number) => {
      rows
        .filter((row) => matches(row, where))
        .forEach((row) => (row[field] += by));
    },
  };

  const employee = Object.assign(new Employee(), {
    id: 'employee-1',
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    role: 'Employee',
  });

  const admin = Object.assign(new Employee(), {
    id: 'employee-2',
    name: 'Ada Admin',
    email: 'ada.admin@example.com',
    role: 'HR Admin',
  });

  const people = [employee, admin];

  const signer = new JwtService({
    secret: 'test-secret',
    signOptions: { expiresIn: '8h' },
  });

  let service: AuthService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        OtpService,
        TokenService,
        {
          provide: EmailService,
          useValue: {
            sendOtp: async (mail: any) => {
              sent.push(mail);
            },
          },
        },
        {
          provide: getRepositoryToken(Employee),
          useValue: {
            findOne: async ({ where }: any) =>
              people.find(
                (person) =>
                  person.email === where.email || person.id === where.id,
              ) ?? null,
          },
        },
        {
          provide: getRepositoryToken(OtpVerification),
          useValue: otpRepository,
        },
        { provide: JwtService, useValue: signer },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('answers the same for an unknown address, without mailing', async () => {
    const result = await service.requestOtp('nobody@example.com');

    expect(result.message).toMatch(/verification code is on its way/);
    expect(sent).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });

  it('issues and mails a code for a known address', async () => {
    await service.requestOtp('  Jane.Doe@Example.com ');

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('jane.doe@example.com');
    expect(sent[0].name).toBe('Jane Doe');
    expect(sent[0].code).toMatch(/^\d{6}$/);
    expect(sent[0].ttlMinutes).toBe(10);
    expect(rows).toHaveLength(1);
    expect(rows[0].employeeId).toBe('employee-1');
    expect(rows[0].otpHash).not.toBe(sent[0].code);
  });

  it('throttles an immediate second request', async () => {
    await expect(
      service.requestOtp('jane.doe@example.com'),
    ).rejects.toMatchObject({
      status: 429,
    });
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const wrong = sent[0].code === '000000' ? '111111' : '000000';

    await expect(
      service.verifyOtp('jane.doe@example.com', wrong),
    ).rejects.toMatchObject({ status: 401 });
    expect(rows[0].attempts).toBe(1);
  });

  it('returns a jwt for the right code', async () => {
    const result = await service.verifyOtp(
      'jane.doe@example.com',
      sent[0].code,
    );

    if (result.needsChoice)
      throw new Error('an employee is not asked to choose');
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(8 * 60 * 60);
    expect(result.user).toEqual({
      id: 'employee-1',
      email: employee.email,
      name: 'Jane Doe',
      role: 'Employee',
    });

    const claims = signer.verify(result.accessToken);
    expect(claims.sub).toBe('employee-1');
    expect(claims.email).toBe(employee.email);
    expect(claims.role).toBe('Employee');
    expect(rows[0].verifiedAt).toBeInstanceOf(Date);
  });

  it('does not accept the same code twice', async () => {
    await expect(
      service.verifyOtp('jane.doe@example.com', sent[0].code),
    ).rejects.toMatchObject({ status: 401 });
  });

  describe('admin account', () => {
    /** One verified code, reused: the cooldown allows a single request per minute. */
    let verifiedChoice: RoleChoice | null = null;

    async function adminChoice(): Promise<RoleChoice> {
      if (verifiedChoice) return verifiedChoice;

      await service.requestOtp(admin.email);

      const mail = sent.find((entry) => entry.to === admin.email);
      const verified = await service.verifyOtp(admin.email, mail.code);

      if (!verified.needsChoice) throw new Error('expected the choice step');

      verifiedChoice = verified;

      return verified;
    }

    it('asks which view to continue as instead of signing in', async () => {
      const choice = await adminChoice();

      expect(choice.options).toEqual([
        { view: 'admin', label: 'Continue as admin', role: 'HR Admin' },
        {
          view: 'employee',
          label: 'Continue as employee',
          role: 'Employee',
        },
      ]);
      expect(choice.user.role).toBe('HR Admin');
      expect(choice.choiceToken).toEqual(expect.any(String));
      expect(choice.expiresIn).toBe(5 * 60);

      // The choice token is not a session token.
      expect(signer.verify(choice.choiceToken)).toMatchObject({
        sub: admin.id,
        scope: 'choose',
      });
    });

    it('signs in as admin when the admin view is picked', async () => {
      const choice = await adminChoice();
      const session = await service.choose(
        `Bearer ${choice.choiceToken}`,
        'admin',
      );

      expect(session.user.role).toBe('HR Admin');
      expect(signer.verify(session.accessToken)).toMatchObject({
        sub: admin.id,
        role: 'HR Admin',
        scope: 'access',
      });
    });

    it('signs in with the narrower employee view when that is picked', async () => {
      const choice = await adminChoice();
      const session = await service.choose(
        `Bearer ${choice.choiceToken}`,
        'employee',
      );

      expect(session.user.role).toBe('Employee');
      expect(signer.verify(session.accessToken)).toMatchObject({
        role: 'Employee',
        scope: 'access',
      });
    });

    it('refuses a session token where the choice token belongs', async () => {
      const choice = await adminChoice();
      const session = await service.choose(
        `Bearer ${choice.choiceToken}`,
        'admin',
      );

      await expect(
        service.choose(`Bearer ${session.accessToken}`, 'employee'),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('refuses the admin view to an account that is not an admin', async () => {
      const forged = signer.sign({ sub: employee.id, scope: 'choose' });

      await expect(
        service.choose(`Bearer ${forged}`, 'admin'),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
