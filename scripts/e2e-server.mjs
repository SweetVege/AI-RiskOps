// Boots everything the Playwright suite needs: an in-memory Postgres with the demo seed, a production
// build, and two app instances sharing that database (signed-in mode and read-only demo mode).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

export const e2e = {
  databasePort: 54333,
  authPort: 3200,
  demoPort: 3201,
  authSecret: "e2e-only-secret",
};

const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${e2e.databasePort}/postgres?sslmode=disable`;
const baseEnv = { ...process.env, DATABASE_URL: databaseUrl };
const children = [];

function run(command, args, env = baseEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))));
  });
}

function serve(port, env) {
  const child = spawn("node_modules/.bin/next", ["start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...baseEnv, ...env },
    stdio: "inherit",
  });
  children.push(child);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const db = await PGlite.create();
  const migrationsDir = path.join(process.cwd(), "prisma/migrations");

  for (const entry of fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await db.exec(fs.readFileSync(path.join(migrationsDir, entry.name, "migration.sql"), "utf8"));
  }

  const server = new PGLiteSocketServer({ db, port: e2e.databasePort, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  await run("node", ["prisma/seed.mjs"]);

  if (!process.env.E2E_SKIP_BUILD) {
    await run("node_modules/.bin/next", ["build"]);
  }

  serve(e2e.demoPort, { DEMO_MODE: "true" });
  serve(e2e.authPort, {
    AUTH_SECRET: e2e.authSecret,
    AUTH_GITHUB_ID: "e2e",
    AUTH_GITHUB_SECRET: "e2e",
    AUTH_ADMIN_EMAILS: "",
  });

  const shutdown = async () => {
    for (const child of children) child.kill();
    await server.stop();
    await db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
