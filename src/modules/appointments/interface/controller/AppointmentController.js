import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import AppointmentRepo from "../../infrastructure/AppointmentRepo.js";
import AppointmentService from "../../application/AppointmentService.js";
import { parseAppointmentId, assertValid } from "../../application/validators/appointmentValidator.js";

const appointmentRepo = new AppointmentRepo();
const appointmentService = new AppointmentService(appointmentRepo);

const parseId = (value) => assertValid(parseAppointmentId(value));

// ---------- appointments ----------

export const listAppointments = asyncHandler(async (req, res) => {
  const result = await appointmentService.listAppointments(req.user.id, req.query);
  return sendSuccess(res, { statusCode: 200, message: "Appointments fetched", data: result });
});

export const getAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.getAppointment(req.user.id, parseId(req.params.id));
  return sendSuccess(res, { statusCode: 200, message: "Appointment fetched", data: result });
});

export const bookAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.book(req.user.id, req.body);
  return sendSuccess(res, { statusCode: 201, message: "Appointment booked", data: result });
});

export const updateAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.update(req.user.id, parseId(req.params.id), req.body);
  return sendSuccess(res, { statusCode: 200, message: "Appointment updated", data: result });
});

export const cancelAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.cancel(req.user.id, parseId(req.params.id), req.body);
  return sendSuccess(res, { statusCode: 200, message: "Appointment cancelled", data: result });
});

export const completeAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.recordOutcome(req.user.id, parseId(req.params.id), "completed");
  return sendSuccess(res, { statusCode: 200, message: "Appointment completed", data: result });
});

export const markNoShow = asyncHandler(async (req, res) => {
  const result = await appointmentService.recordOutcome(req.user.id, parseId(req.params.id), "no_show");
  return sendSuccess(res, { statusCode: 200, message: "Appointment recorded as no-show", data: result });
});

export const undoOutcome = asyncHandler(async (req, res) => {
  const result = await appointmentService.undoOutcome(req.user.id, parseId(req.params.id));
  return sendSuccess(res, { statusCode: 200, message: "Appointment back to scheduled", data: result });
});

export const getFreeSlots = asyncHandler(async (req, res) => {
  const result = await appointmentService.getFreeSlots(req.user.id, req.query);
  return sendSuccess(res, { statusCode: 200, message: "Free slots fetched", data: result });
});

// ---------- schedule ----------

export const getSchedule = asyncHandler(async (req, res) => {
  const result = await appointmentService.getSchedule(req.user.id);
  return sendSuccess(res, { statusCode: 200, message: "Schedule fetched", data: result });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const result = await appointmentService.updateSettings(req.user.id, req.body);
  return sendSuccess(res, { statusCode: 200, message: "Settings updated", data: result });
});

export const setAvailability = asyncHandler(async (req, res) => {
  const result = await appointmentService.setAvailability(req.user.id, req.body?.windows, {
    confirm: req.body?.confirm === true,
  });
  return sendSuccess(res, { statusCode: 200, message: "Working hours updated", data: result });
});

export const addUnavailable = asyncHandler(async (req, res) => {
  const result = await appointmentService.addUnavailable(req.user.id, req.body);
  return sendSuccess(res, { statusCode: 201, message: "Blocked period added", data: result });
});

export const removeUnavailable = asyncHandler(async (req, res) => {
  const result = await appointmentService.removeUnavailable(req.user.id, parseId(req.params.id));
  return sendSuccess(res, { statusCode: 200, message: "Blocked period removed", data: result });
});

export const createSessionType = asyncHandler(async (req, res) => {
  const result = await appointmentService.createSessionType(req.user.id, req.body);
  return sendSuccess(res, { statusCode: 201, message: "Session type added", data: result });
});

export const updateSessionType = asyncHandler(async (req, res) => {
  const result = await appointmentService.updateSessionType(req.user.id, parseId(req.params.id), req.body);
  return sendSuccess(res, { statusCode: 200, message: "Session type updated", data: result });
});

export const removeSessionType = asyncHandler(async (req, res) => {
  const result = await appointmentService.removeSessionType(req.user.id, parseId(req.params.id));
  return sendSuccess(res, { statusCode: 200, message: "Session type removed", data: result });
});
