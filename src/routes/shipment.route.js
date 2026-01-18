import {Router} from "express";
import {getShipmentByOrder, getShipmentById, getAllShipments, cancelShipmentController, requestRTOController, calculateShipping, calculateCartShipping} from "../controllers/shipment.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";

const router=Router();
router.get("/order/:orderId", authMiddleware, getShipmentByOrder);
router.get("/:shipmentId", authMiddleware, getShipmentById);
router.get("/", authMiddleware, roleMiddleware, getAllShipments);
router.post("/order/:orderId/cancel", authMiddleware, cancelShipmentController);
router.post("/order/:orderId/request-rto", authMiddleware, requestRTOController);
router.post("/calculate-shipping", authMiddleware, calculateShipping);
router.post("/calculate-cart-shipping", authMiddleware, calculateCartShipping);

export default router;