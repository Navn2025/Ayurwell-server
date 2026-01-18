import {Router} from "express";
import {createCODShipment, refundCODOrder} from "../controllers/cod.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router=Router();
router.post("/:orderId", authMiddleware, createCODShipment);
router.post('/refund/:orderId', authMiddleware, refundCODOrder); // To be implemented
export default router;