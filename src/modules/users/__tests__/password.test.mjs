import { describe, test, expect, vi } from "vitest";
import bcrypt from "bcrypt";
import { checkPasswordStrength } from "../application/passwordPolicy.js";
import AuthService from "../application/AuthService.js";
import { TERMS_VERSION } from "../application/termsVersion.js";

describe("checkPasswordStrength", () => {
  test("accepts a strong password", () => {
    expect(checkPasswordStrength("Kalamansi#Tree8")).toEqual([]);
  });

  test("requires length and all character classes", () => {
    const problems = checkPasswordStrength("short");
    expect(problems).toEqual(
      expect.arrayContaining([
        "Use at least 8 characters.",
        "Add an uppercase letter.",
        "Add a number.",
        "Add a symbol (e.g. ! @ # $).",
      ]),
    );
    expect(checkPasswordStrength("")).toEqual(["Password is required."]);
    expect(checkPasswordStrength(undefined)).toEqual(["Password is required."]);
  });

  test("rejects common passwords, even dressed up", () => {
    expect(checkPasswordStrength("Password123!")).toContain("This password is too common.");
    expect(checkPasswordStrength("P@ssw0rd")).toContain("This password is too common.");
    expect(checkPasswordStrength("Welcome2026!")).toContain("This password is too common.");
  });

  test("rejects sequences and repeats", () => {
    expect(checkPasswordStrength("Xy!1234Lmn")).toContain("Avoid sequences like 1234, abcd or qwer.");
    expect(checkPasswordStrength("Xy!9Qwerz7")).toContain("Avoid sequences like 1234, abcd or qwer.");
    expect(checkPasswordStrength("Xy!9aaaaZ7")).toContain("Don't repeat the same character 4 or more times.");
  });

  test("rejects personal info", () => {
    const ctx = { email: "maria.santos@clinic.ph", names: ["MARIA", null, "SANTOS"] };
    expect(checkPasswordStrength("Santos#Rule8", ctx)).toContain("Don't use your name or email in your password.");
    expect(checkPasswordStrength("Kalamansi#Tree8", ctx)).toEqual([]);
  });

  test("caps length at bcrypt's limit", () => {
    expect(checkPasswordStrength(`Aa1!${"xy".repeat(40)}`)).toContain("Use at most 72 characters.");
  });
});

describe("AuthService.changePassword", () => {
  const CURRENT = "Old#Secret9x";

  async function setup() {
    const user = {
      user_id: 1,
      email: "maria.santos@clinic.ph",
      f_name: "MARIA",
      m_name: null,
      l_name: "SANTOS",
      password_hash: await bcrypt.hash(CURRENT, 4),
    };
    const repo = {
      findByIdWithPassword: vi.fn().mockResolvedValue(user),
      updatePassword: vi.fn().mockResolvedValue(undefined),
    };
    return { repo, service: new AuthService(repo, {}) };
  }

  test("changes the password when current is right and new is strong", async () => {
    const { repo, service } = await setup();
    await service.changePassword(1, CURRENT, "Kalamansi#Tree8");
    expect(repo.updatePassword).toHaveBeenCalledTimes(1);
    const [, hash] = repo.updatePassword.mock.calls[0];
    expect(await bcrypt.compare("Kalamansi#Tree8", hash)).toBe(true);
  });

  test("wrong current password is rejected with 400 (not a logout)", async () => {
    const { repo, service } = await setup();
    await expect(service.changePassword(1, "nope", "Kalamansi#Tree8")).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_PASSWORD",
    });
    expect(repo.updatePassword).not.toHaveBeenCalled();
  });

  test("weak new password is rejected with the reasons", async () => {
    const { repo, service } = await setup();
    await expect(service.changePassword(1, CURRENT, "password1")).rejects.toMatchObject({
      statusCode: 422,
      code: "WEAK_PASSWORD",
      message: expect.stringContaining("too common"),
    });
    await expect(service.changePassword(1, CURRENT, "Maria#Clinic9")).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    expect(repo.updatePassword).not.toHaveBeenCalled();
  });

  test("new password must differ from the current one", async () => {
    const { service } = await setup();
    await expect(service.changePassword(1, CURRENT, CURRENT)).rejects.toMatchObject({ code: "SAME_PASSWORD" });
  });

  test("current password is required", async () => {
    const { service } = await setup();
    await expect(service.changePassword(1, "", "Kalamansi#Tree8")).rejects.toMatchObject({ statusCode: 422 });
  });
});

const CONSENT = { accepted_terms: true, terms_version: TERMS_VERSION };
const LICENSE = { profession: "psychologist", license_number: "0012345", license_name: "Ana Reyes" };
const VALID = { email: "ana@clinic.ph", password: "Kalamansi#Tree8", f_name: "Ana", l_name: "Reyes", ...CONSENT, ...LICENSE };

describe("AuthService register password rules", () => {
  test("registration rejects weak passwords with a readable message", () => {
    const service = new AuthService({}, {});
    expect(() => service.validateRegisterInput({ ...VALID, password: "12345678" })).toThrow(/Add an uppercase letter/);
  });

  test("registration accepts a strong password", () => {
    const service = new AuthService({}, {});
    const data = service.validateRegisterInput(VALID);
    expect(data.email).toBe("ana@clinic.ph");
  });
});

describe("User Consent and Agreement Validation", () => {
  test("an account can't be created without agreeing", async () => {
    const repo = { findByEmail: vi.fn().mockResolvedValue(null), create: vi.fn() };
    const service = new AuthService(repo, {});
    for (const consent of [{}, { accepted_terms: false }, { accepted_terms: "true" }]) {
      await expect(service.register({ ...VALID, accepted_terms: undefined, terms_version: undefined, ...consent })).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringContaining("You must agree"),
      });
    }
    expect(repo.create).not.toHaveBeenCalled();
  });

  test("agreeing to an outdated version is rejected", () => {
    const service = new AuthService({}, {});
    expect(() => service.validateRegisterInput({ ...VALID, terms_version: "2020-01-01" })).toThrow(/agreement has been updated/);
  });

  test("the accepted agreement version is stored with the account", async () => {
    const repo = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByLicense: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ user_id: 1 }),
    };
    const service = new AuthService(repo, {});
    await service.register(VALID);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ email: "ana@clinic.ph", terms_version: TERMS_VERSION }));
  });
});
