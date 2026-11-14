import { describe, test, expect, vi } from "vitest";
import bcrypt from "bcrypt";
import AuthService from "../../users/application/AuthService.js";
import { validateLicenseFields } from "../../users/application/licenseFields.js";
import { TERMS_VERSION } from "../../users/application/termsVersion.js";
import AdminService from "../application/AdminService.js";

const REGISTER = {
  email: "ana@clinic.ph",
  password: "Kalamansi#Tree8",
  f_name: "Ana",
  l_name: "Reyes",
  accepted_terms: true,
  terms_version: TERMS_VERSION,
  profession: "psychologist",
  license_number: "0012 345",
  license_name: " ana  m. reyes ",
};

describe("PRC license fields", () => {
  test("all three are required at registration", () => {
    const { errors } = validateLicenseFields({}, { required: true });
    expect(Object.keys(errors).sort()).toEqual(["license_name", "license_number", "profession"]);
  });

  test("numbers are digits only; spaces and dashes are removed; the name is upper-cased", () => {
    const { data, errors } = validateLicenseFields({ profession: "guidance_counselor", license_number: "0012-345", license_name: "ana  reyes" });
    expect(errors).toEqual({});
    expect(data).toEqual({ profession: "guidance_counselor", license_number: "0012345", license_name: "ANA REYES" });
    expect(validateLicenseFields({ license_number: "ABC123" }).errors.license_number).toMatch(/digits only/);
    expect(validateLicenseFields({ profession: "life_coach" }).errors.profession).toBeDefined();
  });

  test("when editing, only the fields sent are checked", () => {
    expect(validateLicenseFields({ license_name: "Ana Reyes" })).toEqual({ data: { license_name: "ANA REYES" }, errors: {} });
  });
});

describe("Registration with a PRC license", () => {
  const repoFor = (overrides = {}) => ({
    findByEmail: vi.fn().mockResolvedValue(null),
    findByLicense: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (u) => ({ user_id: 5, ...u, license_status: "pending" })),
    ...overrides,
  });

  test("the license is saved, cleaned up, and starts as pending", async () => {
    const repo = repoFor();
    const user = await new AuthService(repo, {}).register(REGISTER);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ profession: "psychologist", license_number: "0012345", license_name: "ANA M. REYES" }),
    );
    expect(user.license_status).toBe("pending");
  });

  test("a missing license blocks registration", async () => {
    const repo = repoFor();
    await expect(new AuthService(repo, {}).register({ ...REGISTER, license_number: "" })).rejects.toMatchObject({ statusCode: 422 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  test("a license number already on another account is refused", async () => {
    const repo = repoFor({ findByLicense: vi.fn().mockResolvedValue({ user_id: 2 }) });
    await expect(new AuthService(repo, {}).register(REGISTER)).rejects.toMatchObject({ statusCode: 409, code: "LICENSE_EXISTS" });
  });
});

describe("Login and deactivated accounts", () => {
  async function serviceWith(user) {
    const repo = { findByEmail: vi.fn().mockResolvedValue({ ...user, password_hash: await bcrypt.hash("Kalamansi#Tree8", 4) }) };
    const tokens = { generateToken: vi.fn().mockReturnValue("token") };
    return { service: new AuthService(repo, tokens), tokens };
  }

  test("a deactivated account can't log in", async () => {
    const { service } = await serviceWith({ user_id: 1, email: "a@b.co", is_active: false, role: "THERAPIST" });
    await expect(service.login({ email: "a@b.co", password: "Kalamansi#Tree8" })).rejects.toMatchObject({
      statusCode: 403,
      code: "ACCOUNT_DEACTIVATED",
    });
  });

  test("the token carries the account's real role", async () => {
    const { service, tokens } = await serviceWith({ user_id: 1, email: "a@b.co", is_active: true, role: "ADMIN" });
    const result = await service.login({ email: "a@b.co", password: "Kalamansi#Tree8" });
    expect(tokens.generateToken).toHaveBeenCalledWith(expect.objectContaining({ role: "ADMIN" }));
    expect(result.user.role).toBe("ADMIN");
  });
});

describe("Editing the license in Settings", () => {
  const current = { user_id: 5, profession: "psychologist", license_number: "0012345", license_name: "ANA REYES" };
  const repoFor = () => ({
    findById: vi.fn().mockResolvedValue(current),
    findByLicense: vi.fn().mockResolvedValue(null),
    updateProfile: vi.fn().mockImplementation(async (_id, data) => ({ ...current, ...data })),
  });

  test("a changed license number goes back to pending", async () => {
    const repo = repoFor();
    await new AuthService(repo, {}).updateProfile(5, { license_number: "0099999" });
    expect(repo.updateProfile).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ license_number: "0099999", license_status: "pending", license_checked_at: null }),
    );
  });

  test("re-saving the same details keeps the verification", async () => {
    const repo = repoFor();
    await new AuthService(repo, {}).updateProfile(5, { license_number: "0012345", phone: "0917" });
    expect(repo.updateProfile).toHaveBeenCalledWith(5, { phone: "0917" });
  });
});

describe("AdminService", () => {
  const THERAPIST = { user_id: 5, email: "ana@clinic.ph", license_status: "pending", is_active: true };
  const setup = () => {
    const repo = {
      findTherapist: vi.fn().mockResolvedValue(THERAPIST),
      listActions: vi.fn().mockResolvedValue([]),
      setLicenseStatus: vi.fn(),
      setActive: vi.fn(),
      logAction: vi.fn(),
      summary: vi.fn().mockResolvedValue({ therapists: 1, pending: 1 }),
      listTherapists: vi.fn().mockResolvedValue([THERAPIST]),
    };
    const notifications = { notifyAccount: vi.fn() };
    const forget = vi.fn();
    return { repo, notifications, forget, service: new AdminService(repo, notifications, forget) };
  };

  test("verifying saves the result, logs it, and tells the therapist", async () => {
    const { repo, notifications, service } = setup();
    await service.setLicense(1, 5, { status: "verified" });
    expect(repo.setLicenseStatus).toHaveBeenCalledWith(5, "verified", null, 1);
    expect(repo.logAction).toHaveBeenCalledWith(1, 5, "license_verified", null);
    expect(notifications.notifyAccount).toHaveBeenCalledWith(5, expect.objectContaining({ type: "license_verified" }));
  });

  test("'not matched' needs a reason, which the therapist sees", async () => {
    const { notifications, service } = setup();
    await expect(service.setLicense(1, 5, { status: "not_matched" })).rejects.toMatchObject({ statusCode: 422 });
    await service.setLicense(1, 5, { status: "not_matched", note: "No PRC record under this name." });
    expect(notifications.notifyAccount).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ message: expect.stringContaining("No PRC record under this name.") }),
    );
  });

  test("deactivation can be undone, both are logged, and apply at once", async () => {
    const { repo, forget, service } = setup();
    await service.setActive(1, 5, { active: false, note: "Duplicate account" });
    await service.setActive(1, 5, { active: true });
    expect(repo.setActive.mock.calls).toEqual([[5, false], [5, true]]);
    expect(repo.logAction.mock.calls.map((c) => c[2])).toEqual(["deactivated", "reactivated"]);
    expect(forget).toHaveBeenCalledTimes(2);
  });

  test("an admin can't deactivate their own account", async () => {
    const { service } = setup();
    await expect(service.setActive(5, 5, { active: false })).rejects.toMatchObject({ code: "SELF_DEACTIVATE" });
  });

  test("unknown filters are refused", async () => {
    const { service } = setup();
    await expect(service.overview({ status: "everyone" })).rejects.toMatchObject({ statusCode: 422 });
    expect((await service.overview({ status: "pending" })).therapists).toHaveLength(1);
  });
});
