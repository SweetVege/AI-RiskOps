// Starts an in-memory Postgres (PGlite) with all migrations applied, for local development without
// installing Postgres. Data is lost when the process exits.
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54331/postgres?sslmode=disable"
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number.parseInt(process.env.DEV_DB_PORT ?? "54331", 10);
const migrationsDir = path.join(process.cwd(), "prisma/migrations");
const db = await PGlite.create();

for (const entry of fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  await db.exec(fs.readFileSync(path.join(migrationsDir, entry.name, "migration.sql"), "utf8"));
}

const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log(`Dev database ready: postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`);

process.on("SIGINT", async () => {
  await server.stop();
  await db.close();
  process.exit(0);
});
