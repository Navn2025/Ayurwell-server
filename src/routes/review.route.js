import {Router} from "express";
import {addReview, getProductReviews, getAverageRating, getUserReviewForProduct, deleteReview, editReview, rejectReview} from '../controllers/review.controller.js'
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";
const router=Router();
router.post('/', authMiddleware, addReview);
router.get('/product/:productId', getProductReviews);
router.get('/product/:productId/average-rating', getAverageRating);
router.get('/product/:productId/user-review', authMiddleware, getUserReviewForProduct);
router.delete('/:reviewId', authMiddleware, deleteReview);
router.put('/:reviewId', authMiddleware, editReview);
router.post('/:reviewId/reject', authMiddleware, roleMiddleware, rejectReview); // For admin to reject a review
export default router;