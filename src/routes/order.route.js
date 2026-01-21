import {Router} from "express";
import {createOrderForAllCartProducts, createOrderForProduct, getAllOrders, getAllOrdersByCategory, getOrderById, getOrderByStatus, updateOrderStatus, cancelOrder} from '../controllers/order.controller.js';
import authMiddleware from "../middleware/auth.middleware.js";
import assertAdmin from "../middleware/role.middleware.js";
const router=Router()
router.post('/create/cart/orders', authMiddleware, createOrderForAllCartProducts);
router.post('/create/product/order', authMiddleware, createOrderForProduct);
router.get('/all', authMiddleware, getAllOrders);
router.get('/category/:categoryId', authMiddleware, getAllOrdersByCategory);
router.get('/:orderId', authMiddleware, getOrderById);
router.get('/status/:status', authMiddleware, getOrderByStatus);
router.put('/update/status/:orderId', authMiddleware, assertAdmin, updateOrderStatus);
router.put('/cancel/:orderId', authMiddleware, cancelOrder);

export default router

