import "@testing-library/jest-dom/vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/home_dashboard?schema=public";
process.env.APP_TIMEZONE ??= "America/Toronto";
process.env.SESSION_SECRET ??= "test-session-secret-value";
process.env.HOUSEHOLD_ACCOUNT_1_USERNAME ??= "Gabe";
process.env.HOUSEHOLD_ACCOUNT_1_PASSWORD ??= "test-password-1";
process.env.HOUSEHOLD_ACCOUNT_2_USERNAME ??= "Ale";
process.env.HOUSEHOLD_ACCOUNT_2_PASSWORD ??= "test-password-2";
