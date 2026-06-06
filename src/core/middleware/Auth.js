import AuthTokenService from "./AuthTokenService.js";

const tokenService = new AuthTokenService();

export default function authMiddleware(req, res, next) {
  // Read token from httpOnly cookie first, then fall back to Authorization header
  const cookieToken = req.cookies?.token;
  const headerToken = req.headers.authorization?.split(" ")[1];
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const decoded = tokenService.verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.user = {
    id: decoded.userId ?? decoded.adminId,
    role: decoded.role,
    email: decoded.email,
  };

  next();
}
