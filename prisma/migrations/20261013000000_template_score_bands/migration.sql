-- AlterTable
ALTER TABLE "PolicyTemplate" ADD COLUMN "reviewAtScore" INTEGER,
ADD COLUMN "blockAtScore" INTEGER,
ADD COLUMN "escalateAtScore" INTEGER;

-- Carry the thresholds the built-in templates have always described in text into the enforced columns.
-- "flag" bands are not carried over: every matched rule already flags the call at any score.
UPDATE "PolicyTemplate" SET "reviewAtScore" = 60, "blockAtScore" = 80 WHERE "id" = 'policy-customer-support';
UPDATE "PolicyTemplate" SET "blockAtScore" = 65 WHERE "id" = 'policy-rag-kb';
UPDATE "PolicyTemplate" SET "reviewAtScore" = 45, "escalateAtScore" = 80 WHERE "id" = 'policy-finance-agent';
UPDATE "PolicyTemplate" SET "blockAtScore" = 60, "escalateAtScore" = 80 WHERE "id" = 'policy-hr-assistant';
UPDATE "PolicyTemplate" SET "reviewAtScore" = 85 WHERE "id" = 'policy-general-low-risk';
