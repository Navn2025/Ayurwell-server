import express from "express";

import {getDashboardStats, settleCODOrder, retryAWB, getAllUsers, getCODOrders, getUserById} from "../controllers/admin.controller.js";
import {getPaymentById, getAllPayments} from "../controllers/payment.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";

const router=express.Router();

// 🔥 Dashboard stats
router.get("/dashboard", authMiddleware, roleMiddleware, getDashboardStats);

// 🔥 Manual trigger for testing
router.post("/retry-awb", authMiddleware, roleMiddleware, retryAWB);
router.post("/settle-cod/:orderId", authMiddleware, roleMiddleware, settleCODOrder);
router.get("/users", authMiddleware, roleMiddleware, getAllUsers);
router.get("/users/:userId", authMiddleware, roleMiddleware, getUserById);
router.get("/cod-orders", authMiddleware, roleMiddleware, getCODOrders);
router.get("/payments", authMiddleware, roleMiddleware, getAllPayments);
router.get("/payments/:paymentId", authMiddleware, roleMiddleware, getPaymentById);


export default router;
