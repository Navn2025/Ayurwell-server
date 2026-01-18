import {Router} from "express";
import passport from "../passport/google.js";
import {registerUser, loginUser, googleAuth, completeProfile, getCurrentUser, logoutUser, deleteUser, updateUser, forgotPassword, resetPassword, changePassword} from "../controllers/auth.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router=Router();
router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/google/auth", passport.authenticate("google", {scope: ["profile", "email"]}));
router.get(
    "/google/callback",
    passport.authenticate("google", {
        session: false,
        failureRedirect: process.env.GOOGLE_FAILURE_REDIRECT||`${process.env.FRONTEND_URL||"http://localhost:5173"}/login?error=google_auth_failed`
    }),
    googleAuth
);
router.post("/complete/profile", authMiddleware, completeProfile);
router.get("/current/user", authMiddleware, getCurrentUser);
router.post("/logout", authMiddleware, logoutUser);
router.delete("/delete", authMiddleware, deleteUser);
router.put("/update-user", authMiddleware, updateUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", authMiddleware, changePassword);

export default router;