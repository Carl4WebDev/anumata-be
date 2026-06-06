import AppError from "../errors/AppError.js";

export const requireTherapist = (req, res, next) => {
  if (req.user?.role !== "THERAPIST") {
    throw new AppError("Therapist access required", 403, "FORBIDDEN");
  }
  next();
};

// Keep backwards-compatible alias
export const requireUser = requireTherapist;
