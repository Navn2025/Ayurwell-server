import express from 'express';
import {initiatePayment, verifyPayment} from '../controllers/razorpay.payment.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
const router=express.Router();
router.post('/initiate/:orderId', authMiddleware, initiatePayment);
router.post('/verify', authMiddleware, verifyPayment);
export default router;

