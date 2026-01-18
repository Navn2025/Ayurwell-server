import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import {addToCartController, getUsersCartController, updateCartItemController, deleteProductFromCart, clearCartController} from "../controllers/cart.controller.js";

const router=express.Router();
router.post('/add', authMiddleware, addToCartController);
router.get('/get', authMiddleware, getUsersCartController);
router.put('/update', authMiddleware, updateCartItemController);
router.delete('/delete', authMiddleware, deleteProductFromCart);
router.delete('/clear', authMiddleware, clearCartController);
export default router;