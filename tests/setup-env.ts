import "dotenv/config";

// Tests always run against the dedicated test database, never DATABASE_URL.
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must be set to run tests");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
