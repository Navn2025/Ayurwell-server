import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";
import
    {
        createReturnRequestController,
        getReturnByIdController,
        getReturnsByOrderController,
        getAllReturnsController,
        updateReturnStatusController,
        cancelReturnRequestController,
        getReturnStatisticsController,
        scheduleReturnPickupController
    } from "../controllers/return.controller.js";

const router=express.Router();

/* ══════════════════════════════════════════════════════════════════
   CUSTOMER ROUTES
   ══════════════════════════════════════════════════════════════════ */

/* CUSTOMER ROUTES */

// Create return request
router.post("/request/:orderId", authMiddleware, createReturnRequestController);

// Get returns by order (must be before :returnId)
router.get("/order/:orderId", authMiddleware, getReturnsByOrderController);

// Cancel return
router.put("/:returnId/cancel", authMiddleware, cancelReturnRequestController);

/* ADMIN ROUTES */

// Get all returns
router.get("/all", authMiddleware, roleMiddleware, getAllReturnsController);

// Get return statistics
router.get("/statistics", authMiddleware, roleMiddleware, getReturnStatisticsController);

// Update return status
router.put("/:returnId/status", authMiddleware, roleMiddleware, updateReturnStatusController);

// Schedule pickup
router.post("/:returnId/pickup", authMiddleware, roleMiddleware, scheduleReturnPickupController);

// ⚠️ ALWAYS LAST
router.get("/:returnId", authMiddleware, getReturnByIdController);

export default router;