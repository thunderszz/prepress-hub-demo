import { describe, expect, it } from "vitest";
import { invalidEmails, isValidEmail, parseEmailList } from "./emailValidation";

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("customer@example.com")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.domain.example")).toBe(true);
    expect(isValidEmail("  spaces@outside.example  ")).toBe(true);
  });

  it("rejects typical typos", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign.example")).toBe(false);
    expect(isValidEmail("name@domain")).toBe(false); // missing TLD
    expect(isValidEmail("name@domain.i")).toBe(false); // 1-character TLD
    expect(isValidEmail("name @domain.example")).toBe(false); // inner space
    expect(isValidEmail("name@@domain.example")).toBe(false);
  });
});

describe("invalidEmails", () => {
  it("returns only the invalid addresses of the list", () => {
    expect(invalidEmails(["ok@domain.example", "broken@domain", "  ", "other@ok.example"])).toEqual([
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
    expect(parseEmailList("a@one.example, b@two.example; c@three.example\nd@four.example e@five.example").emails).toEqual([
      "a@one.example",
      "b@two.example",
      "c@three.example",
      "d@four.example",
      "e@five.example",
    ]);
  });

  it("extracts addresses pasted from Outlook/Gmail with the name in front", () => {
    expect(
      parseEmailList(
        'John Smith <john@customer.example>; "Brown, Luke" <luke@customer.example>, \'anna@customer.example\' <anna@customer.example>',
      ),
    ).toEqual({ emails: ["john@customer.example", "luke@customer.example", "anna@customer.example"], invalid: [] });
  });

  it("removes duplicates case-insensitively", () => {
    expect(parseEmailList("John@Customer.example, john@customer.example").emails).toEqual(["John@Customer.example"]);
  });

  it("flags typos and names without an address, keeping the good ones", () => {
    expect(parseEmailList("john@customer, luke@customer.example; Anna Green")).toEqual({
      emails: ["luke@customer.example"],
      invalid: ["john@customer", "Anna Green"],
    });
  });
});
