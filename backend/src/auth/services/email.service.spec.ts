import { vi } from 'vitest';

const brevoSend = vi.hoisted(() => vi.fn());
const brevoClients = vi.hoisted(() => [] as { apiKey: string }[]);
const mailTransport = vi.hoisted(() => ({ sendMail: vi.fn() }));
const createTransport = vi.hoisted(() => vi.fn(() => mailTransport));

vi.mock('@getbrevo/brevo', () => ({
  BrevoClient: class {
    readonly transactionalEmails = { sendTransacEmail: brevoSend };

    constructor(options: { apiKey: string }) {
      brevoClients.push(options);
    }
  },
}));

vi.mock('nodemailer', () => ({
  default: { createTransport },
  createTransport,
}));

import { EmailService } from './email.service.js';

const mail = {
  to: 'jane@company.test',
  name: 'Jane Doe',
  code: '123456',
  ttlMinutes: 10,
};

const KEYS = ['BREVO_API_KEY', 'SMTP_HOST', 'MAIL_FROM', 'NODE_ENV'] as const;
const saved = new Map<string, string | undefined>();

beforeAll(() => {
  KEYS.forEach((key) => saved.set(key, process.env[key]));
});

afterAll(() => {
  KEYS.forEach((key) => {
    const value = saved.get(key);

    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
});

beforeEach(() => {
  brevoSend.mockReset();
  brevoClients.length = 0;
  createTransport.mockClear();
  mailTransport.sendMail.mockReset();

  KEYS.forEach((key) => delete process.env[key]);

  process.env.NODE_ENV = 'test';
});

describe('EmailService', () => {
  it('sends through Brevo when BREVO_API_KEY is set', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.MAIL_FROM = 'Absences <no-reply@absences.test>';
    // Configured SMTP must lose to Brevo.
    process.env.SMTP_HOST = 'smtp.example.test';

    await new EmailService().sendOtp(mail);

    expect(createTransport).not.toHaveBeenCalled();
    expect(brevoClients).toEqual([{ apiKey: 'xkeysib-test' }]);
    expect(brevoSend).toHaveBeenCalledTimes(1);
    expect(brevoSend).toHaveBeenCalledWith({
      sender: { name: 'Absences', email: 'no-reply@absences.test' },
      to: [{ email: 'jane@company.test' }],
      subject: 'Your sign-in code',
      textContent: expect.stringContaining('123456'),
      htmlContent: expect.stringContaining('123456'),
    });
  });

  it('accepts a bare MAIL_FROM address as the Brevo sender', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.MAIL_FROM = 'no-reply@absences.test';

    await new EmailService().sendOtp(mail);

    expect(brevoSend).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: { email: 'no-reply@absences.test' },
      }),
    );
  });

  it('reuses one Brevo client for every code of a service instance', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';

    const service = new EmailService();

    await service.sendOtp(mail);
    await service.sendOtp({ ...mail, code: '654321' });

    expect(brevoClients).toHaveLength(1);
    expect(brevoSend).toHaveBeenCalledTimes(2);
  });

  it('falls back to SMTP without a Brevo key', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';

    await new EmailService().sendOtp(mail);

    expect(brevoSend).not.toHaveBeenCalled();
    expect(mailTransport.sendMail).toHaveBeenCalledWith({
      from: 'Absence Management <absences@example.com>',
      to: 'jane@company.test',
      subject: 'Your sign-in code',
      text: expect.stringContaining('123456'),
      html: expect.stringContaining('123456'),
    });
  });

  it('keeps the code in dev when Brevo rejects the send', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    brevoSend.mockRejectedValue(
      Object.assign(new Error('Sender not valid'), { statusCode: 400 }),
    );

    await expect(new EmailService().sendOtp(mail)).resolves.toBeUndefined();
  });

  it('rethrows a failed Brevo send in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.BREVO_API_KEY = 'xkeysib-test';
    brevoSend.mockRejectedValue(
      Object.assign(new Error('Sender not valid'), { statusCode: 400 }),
    );

    await expect(new EmailService().sendOtp(mail)).rejects.toThrow(
      'Sender not valid',
    );
  });
});
