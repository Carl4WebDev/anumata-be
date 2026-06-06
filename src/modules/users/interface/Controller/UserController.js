import { sendSuccess } from "../../../../core/http/apiResponse.js";
import { asyncHandler } from "../../../../core/middleware/asyncHandler.js";
import UserRepo from "../../infrastructure/UserRepo.js";
import AuthService from "../../application/AuthService.js";
import AuthTokenService from "../../../../core/middleware/AuthTokenService.js";

const userRepository = new UserRepo();
const tokenService = new AuthTokenService();
const authService = new AuthService(userRepository, tokenService);

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Therapist registered",
    data: result,
  });
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);

  return sendSuccess(res, {
    statusCode: 200,
    message: "Login successful",
    data: { token: result.token, user: result.user },
  });
});

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "Logged out",
  });
});

export const getProfile = asyncHandler(async (req, res) => {
  const result = await authService.getProfile(req.user.id);

  return sendSuccess(res, {
    statusCode: 200,
    message: "Profile fetched",
    data: result,
  });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const result = await authService.updateProfile(
    req.user.id,
    req.body.full_name,
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: "Profile updated",
    data: result,
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(
    req.user.id,
    req.body.current_password,
    req.body.new_password,
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: "Password changed",
    data: result,
  });
});
