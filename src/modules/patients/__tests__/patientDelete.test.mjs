import { describe, test, expect, vi } from "vitest";
import PatientService from "../application/PatientService.js";

const patient = { patient_id: 9, therapist_id: 1 };
const repo = (hasRecords) => ({
  findById: vi.fn().mockResolvedValue(patient),
  hasRecords: vi.fn().mockResolvedValue(hasRecords),
  remove: vi.fn().mockResolvedValue({ deleted: true }),
});

describe("deleting a patient", () => {
  test("a patient with appointments, interviews or follow-ups is not deleted — archive instead", async () => {
    const r = repo(true);
    await expect(new PatientService(r).remove(1, 9)).rejects.toMatchObject({ statusCode: 409, code: "PATIENT_HAS_RECORDS" });
    expect(r.remove).not.toHaveBeenCalled();
  });

  test("a patient added by mistake, with no records, can still be deleted", async () => {
    const r = repo(false);
    await expect(new PatientService(r).remove(1, 9)).resolves.toEqual({ deleted: true });
    expect(r.hasRecords).toHaveBeenCalledWith(9);
  });

  test("another therapist's patient is refused before anything is checked", async () => {
    const r = repo(false);
    await expect(new PatientService(r).remove(2, 9)).rejects.toMatchObject({ statusCode: 403 });
    expect(r.hasRecords).not.toHaveBeenCalled();
  });
});
