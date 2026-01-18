import {Router} from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import product from "../controllers/products.controller.js";
import roleMiddleware from "../middleware/role.middleware.js";
const router=Router();

// Product CRUD
router.post('/add', authMiddleware, roleMiddleware, product.createProduct);
router.get('/get/all', product.getProducts);
router.get('/get/trending', product.getTrendingProducts);
router.get('/get/best-selling', product.getBestSellingProducts);
router.get('/get/category/:categoryId', product.getProductsByCategory);
router.get('/get/category-slug/:slug', product.getProductsByCategorySlug);
router.get('/get/concern/:concernId', product.getProductsByConcern);
router.get('/get/concern-slug/:slug', product.getProductsByConcernSlug);
router.get('/get/product/:productId', product.getProductById);
router.get('/get/slug/:slug', product.getProductBySlug);
router.put('/update/:productId', authMiddleware, roleMiddleware, product.updateProduct);
router.delete('/delete/:productId', authMiddleware, roleMiddleware, product.deleteProduct);
router.patch('/toggle-trending/:productId', authMiddleware, roleMiddleware, product.toggleTrending);

// FAQ Routes
router.get('/:productId/faqs', product.getProductFAQs);
router.post('/:productId/faqs', authMiddleware, roleMiddleware, product.addProductFAQ);
router.put('/faqs/:faqId', authMiddleware, roleMiddleware, product.updateProductFAQ);
router.delete('/faqs/:faqId', authMiddleware, roleMiddleware, product.deleteProductFAQ);

// Direction (How to Use) Routes
router.get('/:productId/directions', product.getProductDirections);
router.post('/:productId/directions', authMiddleware, roleMiddleware, product.addProductDirection);
router.put('/directions/:directionId', authMiddleware, roleMiddleware, product.updateProductDirection);
router.delete('/directions/:directionId', authMiddleware, roleMiddleware, product.deleteProductDirection);

export default router;