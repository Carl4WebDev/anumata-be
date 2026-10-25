/**
 * Patient validator — profile image + archive field tests.
 * Covers validateUpdatePatient additions only.
 */
import { describe, it, expect } from "vitest";
import { validateUpdatePatient } from "../application/validators/patientValidator.js";

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
