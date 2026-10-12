import { describe, expect, it } from "vitest";
import { invalidEmails, isValidEmail, parseEmailList } from "./emailValidation";

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("customer@example.com")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.domain.co.uk")).toBe(true);
    expect(isValidEmail("  spaces@outside.com  ")).toBe(true);
  });

  it("rejects typical typos", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign.com")).toBe(false);
    expect(isValidEmail("name@domain")).toBe(false); // missing TLD
    expect(isValidEmail("name@domain.i")).toBe(false); // 1-character TLD
    expect(isValidEmail("name @domain.it")).toBe(false); // inner space
    expect(isValidEmail("name@@domain.it")).toBe(false);
  });
});

describe("invalidEmails", () => {
  it("returns only the invalid addresses of the list", () => {
    expect(invalidEmails(["ok@domain.com", "broken@domain", "  ", "other@ok.com"])).toEqual([
      "broken@domain",
    ]);
  });
});

describe("parseEmailList", () => {
  it("empty or whitespace list: no addresses and no errors", () => {
    expect(parseEmailList("")).toEqual({ emails: [], invalid: [] });
    expect(parseEmailList("  \n ; , ")).toEqual({ emails: [], invalid: [] });
  });

  it("splits on comma, semicolon, newline and spaces", () => {
    expect(parseEmailList("a@uno.it, b@due.it; c@tre.it\nd@quattro.it e@cinque.it").emails).toEqual([
      "a@uno.it",
      "b@due.it",
      "c@tre.it",
      "d@quattro.it",
      "e@cinque.it",
    ]);
  });

  it("extracts addresses pasted from Outlook/Gmail with the name in front", () => {
    expect(
      parseEmailList(
        'John Smith <john@customer.com>; "Brown, Luke" <luke@customer.com>, \'anna@customer.com\' <anna@customer.com>',
      ),
    ).toEqual({ emails: ["john@customer.com", "luke@customer.com", "anna@customer.com"], invalid: [] });
  });

  it("removes duplicates case-insensitively", () => {
    expect(parseEmailList("John@Customer.com, john@customer.com").emails).toEqual(["John@Customer.com"]);
  });

  it("flags typos and names without an address, keeping the good ones", () => {
    expect(parseEmailList("john@customer, luke@customer.com; Anna Green")).toEqual({
      emails: ["luke@customer.com"],
      invalid: ["john@customer", "Anna Green"],
    });
  });
});
