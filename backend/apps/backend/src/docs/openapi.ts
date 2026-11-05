import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * OpenAPI 3 document for the public HTTP surface.
 *
 * Only this process is documented: the auth, employee, attendance and storage
 * services speak TCP to each other and are not reachable from a browser. The
 * gateway does not expose a database, so everything here is derived from the
 * controllers' decorators and the models in ./models.ts.
 */

export const OPENAPI_PATH = 'docs';
export const OPENAPI_JSON_PATH = 'docs-json';
export const OPENAPI_YAML_PATH = 'docs-yaml';
export const OPENAPI_SECURITY = 'access-token';

const DESCRIPTION = `
Everything the browser can do: log in with a one-time code, manage the employee
directory, check in with a proof photo, and read attendance.

### Authentication
\`POST /auth/otp/request\` mails (or, in development, logs) a 6-digit code;
\`POST /auth/otp/verify\` exchanges it for a short-lived access token. Send that
token as \`Authorization: Bearer <token>\`. The token carries the caller's
\`employeeId\` and \`role\`; endpoints that need a specific employee take it from
there, never from the request body.

### Errors
Errors are always \`{ "statusCode": number, "message": string }\`. The mapping is
deliberate:

| Status | Meaning |
| --- | --- |
| 400 | Body or query did not validate |
| 401 | No token, expired token, or a wrong/expired one-time code |
| 403 | Authenticated but not allowed (role, someone else's data, weekend or holiday check-in) |
| 404 | Not found |
| 409 | Already checked in today |
| 413 | Uploaded proof is too large |
| 429 | Too many one-time code requests |
| 503 | A downstream service or the holiday calendar is unavailable |

### Uploads
Photos never pass through this API. Ask for a presigned URL, PUT the bytes to
storage yourself, then send the returned key back.
`;

export function buildOpenApiDocument(
  app: INestApplication,
): ReturnType<typeof SwaggerModule.createDocument> {
  const config = new DocumentBuilder()
    .setTitle('Absences API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addServer('http://localhost:3003', 'Local gateway')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token from POST /auth/otp/verify',
      },
      OPENAPI_SECURITY,
    )
    .addTag('Auth', "One-time-code login and the caller's own claims.")
    .addTag('Employee', 'The signed-in employee, for the phone screen.')
    .addTag(
      'Admin: employees',
      'Employee directory. Admin and master admin only.',
    )
    .addTag(
      'Admin: divisions',
      'Divisions an employee can belong to. Admin and master admin only.',
    )
    .addTag('Attendance', 'Check-in and attendance reporting.')
    .addTag('Health', 'Liveness probe.')
    .build();

  return SwaggerModule.createDocument(app, config, {
    // "CheckIn" reads better than "AttendanceControllerCheckIn" in generated
    // clients, and stable operation ids keep diffs small.
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

/** Mounts the UI and the raw documents. Returns false when disabled. */
export function setupOpenApi(app: INestApplication): boolean {
  if ((process.env.OPENAPI_ENABLED ?? 'true').toLowerCase() === 'false') {
    return false;
  }

  const document = buildOpenApiDocument(app);

  SwaggerModule.setup(OPENAPI_PATH, app, document, {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    yamlDocumentUrl: OPENAPI_YAML_PATH,
    customSiteTitle: 'Absences API',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
      displayRequestDuration: true,
    },
  });

  return true;
}

export function logOpenApi(port: number): void {
  Logger.log(
    `OpenAPI: http://localhost:${port}/${OPENAPI_PATH} (json: /${OPENAPI_JSON_PATH})`,
    'Bootstrap',
  );
}
