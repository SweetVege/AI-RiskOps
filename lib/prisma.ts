import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Configure a Postgres connection string before starting AI RiskOps.");
}

const poolMax = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  ...(poolMax > 0 ? { max: poolMax } : {}),
});

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
