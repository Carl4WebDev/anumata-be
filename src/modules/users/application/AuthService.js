import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import AppError from "../../../core/errors/AppError.js";
import ValidationError from "../../../core/errors/ValidationError.js";

export default class AuthService {
  constructor(userRepository, tokenService) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
  }

  validateRegisterInput({ email, password, f_name, m_name, l_name }) {
    const errors = {};

    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedFName = f_name?.trim().toUpperCase();
    const normalizedLName = l_name?.trim().toUpperCase();
    const normalizedMName = m_name?.trim()?.toUpperCase() || null;

    if (!normalizedEmail) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      errors.email = "Invalid email format";
    }

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    if (!normalizedFName) {
      errors.f_name = "First name is required";
    } else if (normalizedFName.length > 50) {
      errors.f_name = "First name must not exceed 50 characters";
    }

    if (!normalizedLName) {
      errors.l_name = "Last name is required";
    } else if (normalizedLName.length > 50) {
      errors.l_name = "Last name must not exceed 50 characters";
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError("Validation failed", errors);
    }

    return {
      email: normalizedEmail,
      password,
      f_name: normalizedFName,
      m_name: normalizedMName,
      l_name: normalizedLName,
    };
  }

  async register(data) {
    const { email, password, f_name, m_name, l_name } = this.validateRegisterInput(data);

    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new AppError("Email already registered", 409, "EMAIL_EXISTS");
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user = await this.userRepository.create({
      email,
      password_hash,
      f_name,
      m_name,
      l_name,
    });

    return user;
  }

  validateLoginInput({ email, password }) {
    const errors = {};

    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      errors.email = "Invalid email format";
    }

    if (!password) {
      errors.password = "Password is required";
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError("Validation failed", errors);
    }

    return {
      email: normalizedEmail,
      password,
    };
  }

  async login(data) {
    const { email, password } = this.validateLoginInput(data);

    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new AppError(
        "Invalid email or password",
        401,
        "INVALID_CREDENTIALS",
      );
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      throw new AppError(
        "Invalid email or password",
        401,
        "INVALID_CREDENTIALS",
      );
    }

    const token = this.tokenService.generateToken({
      userId: user.user_id,
      email: user.email,
      role: "THERAPIST",
    });

    return {
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        f_name: user.f_name,
        m_name: user.m_name,
        l_name: user.l_name,
      },
    };
  }

  async getProfile(userId) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    return user;
  }

  async updateProfile(userId, { f_name, m_name, l_name }) {
    const errors = {};

    const normalizedFName = f_name?.trim().toUpperCase();
    const normalizedLName = l_name?.trim().toUpperCase();
    const normalizedMName = m_name?.trim()?.toUpperCase() || null;

    if (!normalizedFName) {
      errors.f_name = "First name is required";
    } else if (normalizedFName.length > 50) {
      errors.f_name = "First name must not exceed 50 characters";
    }

    if (!normalizedLName) {
      errors.l_name = "Last name is required";
    } else if (normalizedLName.length > 50) {
      errors.l_name = "Last name must not exceed 50 characters";
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError("Validation failed", errors);
    }

    const updated = await this.userRepository.updateName(userId, {
      f_name: normalizedFName,
      m_name: normalizedMName,
      l_name: normalizedLName,
    });

    if (!updated) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    return updated;
  }

  async changePassword(userId, currentPassword, newPassword) {
    const errors = {};

    if (!currentPassword) {
      errors.current_password = "Current password is required";
    }

    if (!newPassword) {
      errors.new_password = "New password is required";
    } else if (newPassword.length < 8) {
      errors.new_password = "New password must be at least 8 characters";
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError("Validation failed", errors);
    }

    const user = await this.userRepository.findByIdWithPassword(userId);

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    const match = await bcrypt.compare(currentPassword, user.password_hash);

    if (!match) {
      throw new AppError(
        "Current password is incorrect",
        401,
        "INVALID_PASSWORD",
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepository.updatePassword(userId, passwordHash);

    return { message: "Password updated successfully" };
  }
}
