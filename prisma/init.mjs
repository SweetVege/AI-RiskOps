import "dotenv/config";
import prismaPkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ensureReferenceData } from "./reference-data.mjs";

const { PrismaClient } = prismaPkg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  const counts = await ensureReferenceData(prisma);
  console.log(`Reference data ready: ${counts.riskRules} rules, ${counts.policyTemplates} policy templates, ${counts.permissionSets} permission sets.`);
} finally {
  await prisma.$disconnect();
}
