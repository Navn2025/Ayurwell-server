import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";
import
{
    cancelOrderController,
    processRTORefundController,
    processReturnRefundController,
    adminRefundController,
    getRefundStatusController,
    retryRefundController,
    getAllRefundsController,
    getRefundByIdController,
} from "../controllers/refund.controller.js";

const router=express.Router();

/* ══════════════════════════════════════════════════════════════════
   CUSTOMER ROUTES
══════════════════════════════════════════════════════════════════ */

// Cancel order before shipment (creates refund for prepaid)
router.post("/cancel/:orderId", authMiddleware, cancelOrderController);

// Get refund status for an order
router.get("/order/:orderId", authMiddleware, getRefundStatusController);

/* ══════════════════════════════════════════════════════════════════
   ADMIN ROUTES
══════════════════════════════════════════════════════════════════ */

// Get all refunds with pagination
router.get(
    "/all",
    authMiddleware,
    roleMiddleware,
    getAllRefundsController
);

// Get refund by ID
router.get(
    "/:refundId",
    authMiddleware,
    roleMiddleware,
    getRefundByIdController
);

// Process RTO refund
router.post(
    "/rto/:orderId",
    authMiddleware,
    roleMiddleware,
    processRTORefundController
);

// Process customer return refund
router.post(
    "/return/:returnId",
    authMiddleware,
    roleMiddleware,
    processReturnRefundController
);

// Admin initiated refund (damaged/wrong/other)
router.post(
    "/admin/:orderId",
    authMiddleware,
    roleMiddleware,
    adminRefundController
);

// Retry failed refund
router.post(
    "/retry/:refundId",
    authMiddleware,
    roleMiddleware,
    retryRefundController
);

export default router;
