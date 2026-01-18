import {Router} from "express";
import {getAllPayments,getUserPayments,getPaymentById,getPaymentByStatus,getPaymentsByMethod,updatePaymentController,userGetPaymentById,userGetPaymentByStatus,userGetPaymentsByMethod } from "../controllers/payment.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
const router=Router();
router.get("/",authMiddleware,getAllPayments);
router.get("/:paymentId",authMiddleware,getPaymentById);
router.get("status/:status",authMiddleware,getPaymentByStatus);
router.get("method/:method", authMiddleware, getPaymentsByMethod);
router.get("/", authMiddleware, getUserPayments);
router.put("/:paymentId", authMiddleware, updatePaymentController);
router.get("/user/:paymentId", authMiddleware, userGetPaymentById);
router.get("/user/status/:status", authMiddleware, userGetPaymentByStatus);
router.get("/user/method/:method", authMiddleware, userGetPaymentsByMethod);
export default router;

