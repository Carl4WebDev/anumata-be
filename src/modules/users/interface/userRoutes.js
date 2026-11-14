import express from "express";
import {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
} from "./Controller/UserController.js";

const router = express.Router();

import loginRateLimiter from "../../../core/middleware/LoginRateLimiter.js";
import passwordChangeRateLimiter from "../../../core/middleware/PasswordChangeRateLimiter.js";
import authMiddleware from "../../../core/middleware/Auth.js";
import { requireAccount, requireTherapist } from "../../../core/middleware/requireUser.js";

router.post("/register", register);
router.post("/login", loginRateLimiter, login);
router.post("/logout", logout);

// Admins sign in with the same page, so they can read their profile and change their password.
router.get("/profile", authMiddleware, requireAccount, getProfile);
router.patch("/profile", authMiddleware, requireTherapist, updateProfile);
router.patch("/profile/password", passwordChangeRateLimiter, authMiddleware, requireAccount, changePassword);

export default router;
