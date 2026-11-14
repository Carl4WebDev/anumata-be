import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import AppError from "../../../core/errors/AppError.js";
import ValidationError from "../../../core/errors/ValidationError.js";
import { checkPasswordStrength } from "./passwordPolicy.js";
import { TERMS_VERSION } from "./termsVersion.js";
import { validateLicenseFields } from "./licenseFields.js";

export default class AuthService {
  constructor(userRepository, tokenService) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
  }

  validateRegisterInput({
    email, password, f_name, m_name, l_name, accepted_terms, terms_version, profession, license_number, license_name,
  }) {
    // PRC license details are required; an admin checks them on the PRC site afterwards.
    const license = validateLicenseFields({ profession, license_number, license_name }, { required: true });
    const errors = { ...license.errors };

    // User Consent and Agreement Validation: the account is only created when
    // the therapist accepted the CURRENT agreement (an old cached form can't).
    if (accepted_terms !== true) {
      errors.accepted_terms = "You must agree to the Terms of Use, Privacy Notice, and Responsible Use Agreement.";
    } else if (terms_version !== TERMS_VERSION) {
      errors.terms_version = "The agreement has been updated. Please reload the page and review it again.";
    }

    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedFName = f_name?.trim().toUpperCase();
    const normalizedLName = l_name?.trim().toUpperCase();
    const normalizedMName = m_name?.trim()?.toUpperCase() || null;

    if (!normalizedEmail) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      errors.email = "Invalid email format";
    }

    const passwordProblems = checkPasswordStrength(password, {
      email: normalizedEmail,
      names: [normalizedFName, normalizedMName, normalizedLName],
    });
    if (passwordProblems.length > 0) {
      errors.password = passwordProblems.join(" ");
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
      throw new ValidationError(Object.values(errors).join(" "), errors);
    }

    return {
      email: normalizedEmail,
      password,
      f_name: normalizedFName,
      m_name: normalizedMName,
      l_name: normalizedLName,
      terms_version: TERMS_VERSION,
      ...license.data,
    };
  }

  /** One account per PRC license (per profession). */
  async assertLicenseUnused(profession, licenseNumber, excludeUserId = null) {
    if (await this.userRepository.findByLicense(profession, licenseNumber, excludeUserId)) {
      throw new AppError(
        "This PRC license number is already registered to another account. Contact the administrator if this is a mistake.",
        409,
        "LICENSE_EXISTS",
      );
    }
  }

  async register(data) {
    const input = this.validateRegisterInput(data);

    const existingUser = await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      throw new AppError("Email already registered", 409, "EMAIL_EXISTS");
    }

    await this.assertLicenseUnused(input.profession, input.license_number);

    const password_hash = await bcrypt.hash(input.password, 10);

    // New accounts start as license_status 'pending' (database default) until an admin verifies them.
    const user = await this.userRepository.create({
      email: input.email,
      password_hash,
      f_name: input.f_name,
      m_name: input.m_name,
      l_name: input.l_name,
      terms_version: input.terms_version,
      profession: input.profession,
      license_number: input.license_number,
      license_name: input.license_name,
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

    // Checked after the password, so this message doesn't reveal which emails have accounts.
    if (!user.is_active) {
      throw new AppError(
        "This account has been deactivated. Contact the administrator if you think this is a mistake.",
        403,
        "ACCOUNT_DEACTIVATED",
      );
    }

    const token = this.tokenService.generateToken({
      userId: user.user_id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        f_name: user.f_name,
        m_name: user.m_name,
        l_name: user.l_name,
        role: user.role,
        license_status: user.license_status,
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
    const { f_name, m_name, l_name, profile_image, phone, specialization, affiliation } = body;
    const license = validateLicenseFields({
      profession: body.profession,
      license_number: body.license_number,
      license_name: body.license_name,
    });
    const errors = { ...license.errors };
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
      throw new ValidationError(Object.values(errors)[0] ?? "Validation failed", errors);
    }

    // Changed PRC details must be checked again by the admin.
    if (Object.keys(license.data).length > 0) {
      const current = await this.userRepository.findById(userId);
      if (!current) {
        throw new AppError("User not found", 404, "USER_NOT_FOUND");
      }
      const changed = Object.entries(license.data).some(([key, value]) => current[key] !== value);
      if (changed) {
        const profession = license.data.profession ?? current.profession;
        const licenseNumber = license.data.license_number ?? current.license_number;
        if (profession && licenseNumber) {
          await this.assertLicenseUnused(profession, licenseNumber, userId);
        }
        Object.assign(data, license.data, {
          license_status: "pending",
          license_note: null,
          license_checked_at: null,
          license_checked_by: null,
        });
      }
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
    if (typeof currentPassword !== "string" || !currentPassword) {
      throw new ValidationError("Current password is required.", { current_password: "Current password is required" });
    }

    const user = await this.userRepository.findByIdWithPassword(userId);

    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    const match = await bcrypt.compare(currentPassword, user.password_hash);

    // 400, not 401: the session is valid, only the confirmation is wrong.
    if (!match) {
      throw new AppError("Current password is incorrect.", 400, "INVALID_PASSWORD");
    }

    const problems = checkPasswordStrength(newPassword, {
      email: user.email,
      names: [user.f_name, user.m_name, user.l_name],
    });
    if (problems.length > 0) {
      throw new ValidationError(problems.join(" "), { new_password: problems }, "WEAK_PASSWORD");
    }

    if (await bcrypt.compare(newPassword, user.password_hash)) {
      throw new ValidationError("New password must be different from your current password.", null, "SAME_PASSWORD");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepository.updatePassword(userId, passwordHash);

    return { message: "Password updated successfully" };
  }
}
