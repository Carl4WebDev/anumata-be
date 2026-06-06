import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import PatientRepo from "../../infrastructure/PatientRepo.js";
import PatientService from "../../application/PatientService.js";

const patientRepository = new PatientRepo();
const patientService = new PatientService(patientRepository);

export const createPatient = asyncHandler(async (req, res) => {
  const result = await patientService.create(req.user.id, req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Patient added",
    data: result,
  });
});

export const getPatients = asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;
  const result = await patientService.getAll(req.user.id, {
    search,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 20,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: "Patients fetched",
    data: result.patients,
    meta: { total: result.total, page: result.page, limit: result.limit },
  });
});

export const getPatient = asyncHandler(async (req, res) => {
  const result = await patientService.getById(req.user.id, req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Patient fetched",
    data: result,
  });
});

export const updatePatient = asyncHandler(async (req, res) => {
  const result = await patientService.update(req.user.id, req.params.id, req.body);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Patient updated",
    data: result,
  });
});

export const deletePatient = asyncHandler(async (req, res) => {
  await patientService.remove(req.user.id, req.params.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: "Patient removed",
  });
});
