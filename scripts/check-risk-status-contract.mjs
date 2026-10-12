import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function fail(message) {
  console.error(`Risk status contract failed: ${message}`);
  process.exitCode = 1;
}

function extractQuotedValues(source) {
  return [...source.matchAll(/["']([a-z_]+)["']/g)].map((match) => match[1]);
}

function unique(values) {
  return [...new Set(values)].sort();
}

function assertEveryKnown(sourceName, values, knownValues) {
  const unknown = values.filter((value) => !knownValues.has(value));
  if (unknown.length > 0) {
    fail(`${sourceName} contains unknown review status value(s): ${unique(unknown).join(", ")}`);
  }
}

const riskData = read("lib/risk-data.ts");
const riskEventRoute = read("app/api/risk-events/[id]/route.ts");
const seed = read("prisma/seed.mjs");
const page = read("app/riskops-app.tsx");

const reviewStatusUnion = riskData.match(/export type ReviewStatus =([\s\S]*?);/);
if (!reviewStatusUnion) {
  fail("ReviewStatus union was not found in lib/risk-data.ts");
}

const reviewStatuses = unique(extractQuotedValues(reviewStatusUnion?.[1] ?? ""));
const knownReviewStatuses = new Set(reviewStatuses);

const reviewStatusMetaBlock = riskData.match(/export const reviewStatusMeta:[\s\S]*?= \{([\s\S]*?)\n\};/);
if (!reviewStatusMetaBlock) {
  fail("reviewStatusMeta block was not found in lib/risk-data.ts");
}

const metaKeys = unique([...reviewStatusMetaBlock[1].matchAll(/^\s{2}([a-z_]+): \{/gm)].map((match) => match[1]));
const metaKeySet = new Set(metaKeys);
const statusesMissingMeta = reviewStatuses.filter((status) => !metaKeySet.has(status));
const extraMetaKeys = metaKeys.filter((status) => !knownReviewStatuses.has(status));

if (statusesMissingMeta.length > 0) {
  fail(`reviewStatusMeta is missing key(s): ${statusesMissingMeta.join(", ")}`);
}

if (extraMetaKeys.length > 0) {
  fail(`reviewStatusMeta contains extra key(s) outside ReviewStatus: ${extraMetaKeys.join(", ")}`);
}

const routeStatusBlock = riskEventRoute.match(/const reviewStatuses = new Set\(\[([\s\S]*?)\]\);/);
if (!routeStatusBlock) {
  fail("risk event PATCH reviewStatuses allowlist was not found");
}

const routeStatuses = unique(extractQuotedValues(routeStatusBlock[1]));
assertEveryKnown("Risk event PATCH allowlist", routeStatuses, knownReviewStatuses);

const missingRouteStatuses = reviewStatuses.filter((status) => !routeStatuses.includes(status));
if (missingRouteStatuses.length > 0) {
  fail(`Risk event PATCH allowlist is missing ReviewStatus value(s): ${missingRouteStatuses.join(", ")}`);
}

const seededInlineStatuses = [...seed.matchAll(/reviewStatus:\s*["']([a-z_]+)["']/g)].map((match) => match[1]);
const reviewStatusForFunction = seed.match(/function reviewStatusFor\([\s\S]*?\n\}/);
const seededGeneratedStatuses = reviewStatusForFunction
  ? [...reviewStatusForFunction[0].matchAll(/return\s+([^;]+);/g)].flatMap((match) => extractQuotedValues(match[1]))
  : [];
const seededStatuses = unique([...seededInlineStatuses, ...seededGeneratedStatuses]);
assertEveryKnown("Seed data", seededStatuses, knownReviewStatuses);

const reviewOptionValues = unique(
  [...page.matchAll(/<option value=["']([a-z_]+)["']/g)]
    .map((match) => match[1])
    .filter((value) => knownReviewStatuses.has(value)),
);
const missingPageOptions = reviewStatuses.filter((status) => !reviewOptionValues.includes(status));
if (missingPageOptions.length > 0) {
  fail(`Risk Events review-status selectors are missing option(s): ${missingPageOptions.join(", ")}`);
}

if (!page.includes("reviewStatusMeta[status] ??")) {
  fail("ReviewStatusPill should keep a fallback for backend statuses that are not yet mapped");
}

if (process.exitCode) {
  process.exit();
}

console.log(
  `Risk status contract passed: ${reviewStatuses.length} statuses checked across type, metadata, API allowlist, seed data, and UI options.`,
);
