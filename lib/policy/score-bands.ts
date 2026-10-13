// Score bands turn a call's total risk score into a minimum response, per policy template.
// They can only raise the response that the matched rules already call for.
export type ScoreBands = {
  // Calls scoring at least this much get human review.
  reviewAt: number | null;
  // Calls scoring at least this much are blocked.
  blockAt: number | null;
  // Risk events scoring at least this much are created already escalated.
  escalateAt: number | null;
};

// Used when an application has no template, or its template sets no band.
export const defaultScoreBands: ScoreBands = { reviewAt: 80, blockAt: null, escalateAt: null };

export const minBandScore = 1;
export const maxBandScore = 100;

type TemplateBandColumns = {
  reviewAtScore: number | null;
  blockAtScore: number | null;
  escalateAtScore: number | null;
};

function validBand(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value >= minBandScore && value <= maxBandScore
    ? value
    : null;
}

export function hasScoreBands(template: TemplateBandColumns) {
  return [template.reviewAtScore, template.blockAtScore, template.escalateAtScore].some((value) => validBand(value) !== null);
}

export function scoreBandsForTemplate(template: TemplateBandColumns | null): ScoreBands {
  if (!template || !hasScoreBands(template)) {
    return defaultScoreBands;
  }

  return {
    reviewAt: validBand(template.reviewAtScore),
    blockAt: validBand(template.blockAtScore),
    escalateAt: validBand(template.escalateAtScore),
  };
}

// The text shown for a template is generated from the bands that are enforced, so it cannot drift.
export function scoreBandLabel(bands: ScoreBands) {
  const parts = [
    bands.reviewAt !== null ? `${bands.reviewAt}+ review` : null,
    bands.blockAt !== null ? `${bands.blockAt}+ block` : null,
    bands.escalateAt !== null ? `${bands.escalateAt}+ escalate` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "None";
}

export function scoreBandError(bands: ScoreBands) {
  if (bands.reviewAt !== null && bands.blockAt !== null && bands.reviewAt >= bands.blockAt) {
    return "Review must start at a lower score than block.";
  }

  return null;
}
