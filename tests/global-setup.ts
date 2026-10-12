import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { testDatabasePort } from "./test-database";

export default async function setup() {
  const db = await PGlite.create();
  const migrationsDir = path.resolve(__dirname, "../prisma/migrations");
  const migrations = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    await db.exec(fs.readFileSync(path.join(migrationsDir, migration, "migration.sql"), "utf8"));
  }

  const server = new PGLiteSocketServer({
    db,
    port: testDatabasePort,
    host: "127.0.0.1",
    maxConnections: 20,
  });
  await server.start();

  return async () => {
    await server.stop();
    await db.close();
  };
}
