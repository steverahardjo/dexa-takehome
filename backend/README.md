<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Seed data

`seed.json` holds the divisions and the employees the stack starts with, and
`scripts/seed.ts` is the runner that ingests it. It compiles with the repo's own
`tsc` (no extra dependency) and writes through the same entities the services
own; it never synchronizes the schema, so start the services first and let them
create the tables.

```bash
$ npm run seed                      # build the runner, then ingest ./seed.json
$ npm run seed -- --dry-run         # validate the file, print the plan, no writes
$ npm run seed -- --file other.json # ingest another file
$ npm run seed -- --no-avatars      # skip the generated sample avatars
$ npm run seed -- --force-avatars   # regenerate every avatar
$ npm run seed -- --no-proofs       # skip the sample check-in proof photos
$ npm run seed -- --backfill-proofs # photograph check-ins that have none
$ npm run seed:docker               # same, inside the compose network (DB_HOST=db)
```

Connection settings come from the usual `DB_*` variables (defaults match
docker-compose: `127.0.0.1:3306`, `attendance`/`attend1234`, database
`absences`). Avatars and proof photos go straight to object storage, so the
runner also needs the storage service's `MINIO_*` variables
(`MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` are required; the rest default to
`127.0.0.1:9000`/`absences`/`us-east-1`). In compose that means running it in
the storage container, which is what `seed:docker` does. Every write is an
upsert keyed by `employee_number`, `email` and the division `name`, so
re-running converges instead of duplicating; a run is one transaction, and a
conflicting file is rejected with every problem listed at once.

An entry creates its identity too, so the file is also where the first admin
comes from:

```json
{
  "employeeNumber": "EMP-0001",
  "fullName": "Steve Jevon",
  "email": "steve.jevon.r@gmail.com",
  "joinedAt": "2024-01-02",
  "divisions": ["Engineering"],
  "identity": { "role": "MASTER_ADMIN", "status": "ACTIVE" }
}
```

`identity` is optional and defaults to `EMPLOYEE`/`ACTIVE`. Signing in needs no
mailbox: the auth service issues the OTP and returns it in the
`POST /auth/otp/request` response, and the sign-in screen displays it. The
`EMAIL_*` variables are not read by any running service; `EmailService` and
`npm run email:smoke` are kept in the repo for when delivery is turned back on.

### Sample avatars

The optional `avatars` block gives every seeded employee a demo profile
picture without anyone uploading one:

```json
"avatars": {
  "enabled": true,
  "size": 512
}
```

| field | default | meaning |
| --- | --- | --- |
| `enabled` | `true` | generate and upload pictures; `--no-avatars` overrides it |
| `size` | `512` | square edge in pixels, between 64 and 1024 |
| `overwrite` | `false` | also replace employees that already have a picture |

The runner draws the employee's initials on a colour picked from a fixed
palette by hashing the full name, encodes a real PNG locally (no image
dependency), and uploads it as `avatars/<year>/<month>/<uuid>.png` — the key
shape the storage service hands out, so presigned downloads and
`confirmUpload` accept it. Like attendance history this is additive: an
employee that already has an `avatar_key` is left alone, so a rerun resumes a
partially failed upload and never replaces a picture someone uploaded. Only
`--force-avatars` (or `"overwrite": true`) replaces existing pictures, and the
previous object is removed after the new one is stored. The upload happens
after the database transaction commits, so a storage outage cannot roll back
the employees that were seeded successfully.

### Attendance history

The shipped `seed.json` is a full demo company: 12 divisions and 50 people
(active, inactive and terminated, one disabled identity, several multi-division
assignments). Its optional `history` block backfills weekday attendance for
every seeded `ACTIVE` employee, and for terminated staff up to `terminatedAt`,
from January 1st of the current year through **today** (inclusive), so the
admin dashboard and the yearly summary have data the day you seed:

```json
"history": {
  "seed": 20260101,
  "absentRate": 0.05,
  "lateRate": 0.22,
  "locations": ["HQ Office", "HQ Office", "Remote", "Client Site"],
  "holidays": ["01-01", "08-17", "12-25"]
}
```

| field | default | meaning |
| --- | --- | --- |
| `days` | — (year to date) | optional sliding window of that many calendar days ending today |
| `seed` | `42` | PRNG seed; the same value always produces the same history |
| `absentRate` | `0.05` | share of working days written as `ABSENT` |
| `lateRate` | `0.22` | base share of check-ins after `REQUIRED_CHECK_IN` |
| `locations` | `["HQ Office", "Remote"]` | values picked for `location` |
| `holidays` | `["01-01", "08-17", "12-25"]` | `MM-DD` (yearly) or `YYYY-MM-DD` (once) days skipped |

Each employee gets an individual tempo derived from `seed ^ hash(employeeNumber)`,
so the 22% company late rate is not applied uniformly. Check-in instants are
written in UTC for the company timezone (`COMPANY_TIMEZONE`, falling back to
`TZ`, default `Asia/Jakarta`) with the same `requiredCheckIn`/`timezone` audit
columns the attendance service writes.

Today is treated as a day in progress: nobody is written as `ABSENT` (the
absent sweep has not run yet) and no check-in is later than the moment the seed
ran, so the data never claims a future arrival. Because today is included, a
seeded demo account already has a row for today and the check-in endpoint
answers `409` for it — delete that row (or add a fresh employee) if you want to
demo a live check-in after seeding.

History is an additive backfill: a rerun only inserts days that have no row, so
real check-ins and absent sweeps are never overwritten. `INACTIVE` employees get
no history, and days outside `joinedAt`..`terminatedAt` are skipped.

### Sample check-in proofs

A real check-in carries a photo. The optional `proofs` block gives the seeded
history one too, so the attendance table and the admin detail page have
something to show:

```json
"proofs": {
  "enabled": true,
  "samples": [
    { "url": "https://picsum.photos/id/0/720/960.jpg", "credit": "Alejandro Escamilla / Unsplash" },
    { "url": "https://picsum.photos/id/42/720/960.jpg", "credit": "Luke Chesser / Unsplash" },
    { "url": "https://picsum.photos/id/64/720/960.jpg", "credit": "Alexander Shustov / Unsplash" }
  ]
}
```

| field | default | meaning |
| --- | --- | --- |
| `enabled` | `true` | download and attach photos; `--no-proofs` overrides it |
| `samples` | 15 Lorem Picsum photos | URLs (or `{ url, credit }`), each fetched once per run |
| `timeoutMs` | `20000` | per-download timeout |
| `maxBytes` | `8388608` | refuse a picture bigger than this (8 MiB) |

The shipped file lists the pictures one by one, so the rotation is explicit and
editable: desks, laptops, coffee cups, a portrait and a few outdoor scenes —
different subjects rather than one photo repeated. Each entry is fetched once
per run (the seeder needs network access for this, including inside the compose
container) and then rotated over the check-ins it is about to write, so
consecutive days and colleagues get different pictures. Pictures are stored as
`proofs/<year>/<month>/<uuid>.<ext>` — the key shape the storage service hands
out, so presigned downloads accept them — and the row is updated after the
upload lands. The content type comes from the response, so a sample can be
`.jpg`, `.png`, `.webp` or `.gif`. A URL that fails to download is logged and
skipped, and the next sample in the rotation is tried instead.

This is additive like the rest of the seed: new check-ins get a picture, and
rows that already exist keep theirs. `--backfill-proofs` closes the gap left by
older runs — it picks every `ON_TIME`/`LATE` row of a seeded employee whose
`proof_key` is still `NULL` and attaches a picture. A row that already has a
proof is never replaced, so photos someone really uploaded survive a re-seed.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It installs `@nestjs/observe`, wires it into `AppModule` and `main.ts`, and writes the app key and secret into `.env`, which every `nest start` script (`start`, `start:dev`, `start:debug`) then loads. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/sdk) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
