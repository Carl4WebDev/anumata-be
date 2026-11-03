/**
 * Patient validator — profile image + archive field tests.
 * Covers validateUpdatePatient additions only.
 */
import { describe, it, test, expect } from "vitest";
import { validateCreatePatient, validateUpdatePatient } from "../application/validators/patientValidator.js";

describe("validateUpdatePatient — profile_image", () => {
  it("accepts a base64 image data URL", () => {
    const result = validateUpdatePatient({ profile_image: "data:image/png;base64,AAAA" });
    expect(result.ok).toBe(true);
    expect(result.data.profile_image).toBe("data:image/png;base64,AAAA");
  });

  it("accepts null to remove the image", () => {
    const result = validateUpdatePatient({ profile_image: null });
    expect(result.ok).toBe(true);
    expect(result.data.profile_image).toBeNull();
  });

  it("rejects a non-data-URL string", () => {
    const result = validateUpdatePatient({ profile_image: "https://example.com/x.png" });
    expect(result.ok).toBe(false);
    expect(result.errors.profile_image).toBeDefined();
  });

  it("rejects svg/text data URLs", () => {
    const result = validateUpdatePatient({ profile_image: "data:image/svg+xml;base64,AAAA" });
    expect(result.ok).toBe(false);
    expect(result.errors.profile_image).toBeDefined();
  });

  it("rejects an oversized image", () => {
    const big = "data:image/png;base64," + "A".repeat(1_500_001);
    const result = validateUpdatePatient({ profile_image: big });
    expect(result.ok).toBe(false);
    expect(result.errors.profile_image).toBeDefined();
  });

  it("omits profile_image when not provided", () => {
    const result = validateUpdatePatient({ age: 30 });
    expect(result.ok).toBe(true);
    expect("profile_image" in result.data).toBe(false);
  });
});

describe("validateUpdatePatient — is_archived", () => {
  it("archives with timestamp when true", () => {
    const result = validateUpdatePatient({ is_archived: true });
    expect(result.ok).toBe(true);
    expect(result.data.is_archived).toBe(true);
    expect(result.data.archived_at).toBeTruthy();
  });

  it("clears timestamp when restored (false)", () => {
    const result = validateUpdatePatient({ is_archived: false });
    expect(result.ok).toBe(true);
    expect(result.data.is_archived).toBe(false);
    expect(result.data.archived_at).toBeNull();
  });

  it("rejects non-boolean", () => {
    const result = validateUpdatePatient({ is_archived: "yes" });
    expect(result.ok).toBe(false);
    expect(result.errors.is_archived).toBeDefined();
  });

  it("leaves name untouched when only archiving", () => {
    const result = validateUpdatePatient({ is_archived: true });
    expect(result.ok).toBe(true);
    expect("f_name" in result.data).toBe(false);
  });
});

describe("patient contact details", () => {
  const patient = { f_name: "Ana", l_name: "Cruz", age: 30, gender: "female", primary_concern: "Anxiety" };

  test("both are optional", () => {
    const { data } = validateCreatePatient(patient);
    expect(data).toMatchObject({ contact_number: null, email: null });
  });

  test("a Philippine mobile number is stored as +63…, and the email in lowercase", () => {
    for (const typed of ["0917 123 4567", "09171234567", "+63 917-123-4567", "639171234567"]) {
      expect(validateCreatePatient({ ...patient, contact_number: typed }).data.contact_number).toBe("+639171234567");
    }
    expect(validateCreatePatient({ ...patient, email: " Ana.Cruz@Gmail.com " }).data.email).toBe("ana.cruz@gmail.com");
  });

  test("other numbers are kept as typed; nonsense is refused with a clear message", () => {
    expect(validateCreatePatient({ ...patient, contact_number: "(082) 222-1234" }).data.contact_number).toBe("(082) 222-1234");
    expect(validateCreatePatient({ ...patient, contact_number: "call me" }).errors.contact_number).toMatch(/only contain digits/);
    expect(validateCreatePatient({ ...patient, contact_number: "123" }).errors.contact_number).toMatch(/valid mobile number/);
    expect(validateCreatePatient({ ...patient, email: "ana@" }).errors.email).toMatch(/valid email/);
  });

  test("editing: only the fields sent change, and an empty value clears it", () => {
    expect(validateUpdatePatient({ email: "a@b.co" }).data).toEqual({ email: "a@b.co" });
    expect(validateUpdatePatient({ contact_number: "" }).data).toEqual({ contact_number: null });
    expect(validateUpdatePatient({ age: 31 }).data).toEqual({ age: 31 });
  });
});

describe("reminder consent", () => {
  const patient = { f_name: "Ana", l_name: "Cruz", age: 30, gender: "female", primary_concern: "Anxiety" };

  test("only counts when there is an email to send to", () => {
    expect(validateCreatePatient({ ...patient, email: "a@b.co", reminder_consent: true }).data.reminder_consent).toBe(true);
    expect(validateCreatePatient({ ...patient, reminder_consent: true }).data.reminder_consent).toBe(false);
    expect(validateCreatePatient(patient).data.reminder_consent).toBe(false);
  });

  test("editing: can be switched; clearing the email turns it off", () => {
    expect(validateUpdatePatient({ reminder_consent: false }).data).toEqual({ reminder_consent: false });
    expect(validateUpdatePatient({ email: "" }).data).toEqual({ email: null, reminder_consent: false });
    expect(validateUpdatePatient({ reminder_consent: "yes" }).ok).toBe(false);
  });
});
