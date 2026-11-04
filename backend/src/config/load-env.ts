import { config } from 'dotenv';

// `.env` in the backend wins; the repo-root `.env` is a local fallback.
// dotenv never overrides variables that are already set.
config({ path: '.env' });
config({ path: '../.env' });
