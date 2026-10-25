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

  async updateProfile(userId, body) {
    const { f_name, m_name, l_name, profile_image, phone, specialization, license_number, affiliation } = body;
    const errors = {};
    const data = {};

    if (f_name !== undefined) {
      const normalized = f_name?.trim().toUpperCase();
      if (!normalized) {
        errors.f_name = "First name cannot be empty";
      } else if (normalized.length > 50) {
        errors.f_name = "First name must not exceed 50 characters";
      } else {
        data.f_name = normalized;
      }
    }

    if (l_name !== undefined) {
      const normalized = l_name?.trim().toUpperCase();
      if (!normalized) {
        errors.l_name = "Last name cannot be empty";
      } else if (normalized.length > 50) {
        errors.l_name = "Last name must not exceed 50 characters";
      } else {
        data.l_name = normalized;
      }
    }

    if (m_name !== undefined) {
      data.m_name = m_name?.trim()?.toUpperCase() || null;
    }

    if ((data.f_name || data.m_name !== undefined || data.l_name) && !errors.f_name && !errors.l_name) {
      const current = await this.userRepository.findById(userId);
      if (!current) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }
      data.full_name = [
        data.f_name ?? current.f_name,
        data.m_name !== undefined ? data.m_name : current.m_name,
        data.l_name ?? current.l_name,
      ].filter(Boolean).join(" ");
    }

    if (profile_image !== undefined) {
      if (profile_image === null) {
        data.profile_image = null;
      } else if (typeof profile_image !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(profile_image)) {
        errors.profile_image = "Profile image must be a base64 image data URL";
      } else if (profile_image.length > 1_500_000) {
        errors.profile_image = "Profile image must be under 1.5MB";
      } else {
        data.profile_image = profile_image;
      }
    }

    const textFields = [
      ["phone", phone, 30],
      ["specialization", specialization, 120],
      ["license_number", license_number, 60],
      ["affiliation", affiliation, 120],
    ];
    for (const [key, value, max] of textFields) {
      if (value === undefined) continue;
      const normalized = value?.trim() || null;
      if (normalized && normalized.length > max) {
        errors[key] = `${key} must not exceed ${max} characters`;
      } else {
        data[key] = normalized;
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError("Validation failed", errors);
    }

    if (Object.keys(data).length === 0) {
      throw new AppError("No fields to update", 400, "NO_FIELDS");
    }

    const updated = await this.userRepository.updateProfile(userId, data);

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
