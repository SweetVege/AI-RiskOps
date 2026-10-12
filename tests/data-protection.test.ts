import { describe, expect, it } from "vitest";
import { protectCapturedFields, protectCapturedText } from "@/lib/api/data-protection";
import { paginationFromSearchParams, paginationResponse } from "@/lib/api/pagination";

describe("protectCapturedText", () => {
  it("returns an empty value for missing input", () => {
    expect(protectCapturedText(null)).toEqual({ value: "", findings: [] });
  });

  it("masks emails, bearer tokens, and API keys", () => {
    const result = protectCapturedText(
      "Mail jane.doe@example.com with Authorization: Bearer abcdefghijklmnop and key airk_live_abcdefghijklmnop.",
    );

    expect(result.value).not.toContain("jane.doe@example.com");
    expect(result.value).not.toContain("abcdefghijklmnop");
    expect(result.findings).toEqual(expect.arrayContaining(["Email", "Bearer Token", "API Key"]));
  });

  it("keeps only the last four digits of payment cards", () => {
    const result = protectCapturedText("Card 4111 1111 1111 1234 was charged.");

    expect(result.value).toContain("[REDACTED_CARD_1234]");
    expect(result.value).not.toContain("4111");
  });

  it("masks private key blocks", () => {
    const result = protectCapturedText("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----");

    expect(result.value).toBe("[REDACTED_PRIVATE_KEY]");
  });

  it("leaves ordinary text unchanged", () => {
    const text = "Summarize the vendor contract clauses.";

    expect(protectCapturedText(text)).toEqual({ value: text, findings: [] });
  });
});

describe("protectCapturedFields", () => {
  it("merges findings across fields and preserves a null tool call", () => {
    const result = protectCapturedFields({
      prompt: "Email a@example.com",
      output: "Card 4111 1111 1111 1234",
      ragContext: "",
      toolCall: null,
    });

    expect(result.toolCall).toBeNull();
    expect(result.mode).toBe("masked");
    expect(result.findings).toEqual(expect.arrayContaining(["Email", "Payment Card"]));
  });
});

describe("pagination", () => {
  it("defaults, clamps page size, and computes skip", () => {
    expect(paginationFromSearchParams(new URLSearchParams())).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 });
    expect(paginationFromSearchParams(new URLSearchParams("page_number=3&page_size=500"))).toEqual({
      page: 3,
      pageSize: 100,
      skip: 200,
      take: 100,
    });
    expect(paginationFromSearchParams(new URLSearchParams("page_number=-1&page_size=abc")).page).toBe(1);
  });

  it("reports page boundaries", () => {
    expect(paginationResponse({ page: 2, pageSize: 10, totalItems: 25 })).toMatchObject({
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(paginationResponse({ page: 1, pageSize: 10, totalItems: 0 }).totalPages).toBe(1);
  });
});
