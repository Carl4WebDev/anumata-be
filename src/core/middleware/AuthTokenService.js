import jwt from "jsonwebtoken";

export default class AuthTokenService {
  generateToken(payload) {
    return jwt.sign(
      {
        userId: payload.userId,
        adminId: payload.adminId,
        email: payload.email,
        role: payload.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return null;
    }
  }

  isExpired(token) {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    return decoded.exp * 1000 < Date.now();
  }
}
