Employee work-absence system (work-from-home attendance + monitoring). Two independent apps:

```
absences/
├── frontend/          Next.js app (App Router, React 19, Tailwind 4)
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── public/
│   ├── node_modules/  (local install)
│   └── package.json
├── backend/           NestJS API (TypeScript)
│   ├── src/
│   ├── test/
│   ├── node_modules/  (local install)
│   └── package.json
├── docker-compose.yml MySQL service
└── README.md
```

## Getting Started

Each app manages its own dependencies. Install and run them independently.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Backend

```bash
cd backend
npm install
npm run start:dev
```

### Database

Start the MySQL database with:

```bash
docker compose up -d
```

## Learn More

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

To learn more about NestJS, see the [NestJS Documentation](https://docs.nestjs.com).
