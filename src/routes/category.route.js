import multer from "multer";
import {Router} from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import categoryController from "../controllers/category.controller.js";
import roleMiddleware from "../middleware/role.middleware.js";

const router=Router();

const storage=multer.memoryStorage();
const upload=multer({storage});

router.post('/', authMiddleware, roleMiddleware, categoryController.addCategory);
router.get('/tree', categoryController.getCategoryTree);
router.get('/id/:id', categoryController.getCategoryById);
router.get('/slug/:slug', categoryController.getCategoryBySlug);
router.put('/id/:id', authMiddleware, roleMiddleware, categoryController.updateCategory);
router.delete('/id/:id', authMiddleware, roleMiddleware, categoryController.deleteCategory);

// Category Image routes (Single image)
router.post('/id/:id/image', authMiddleware, roleMiddleware, upload.single('image'), categoryController.uploadCategoryImage);
router.delete('/id/:id/image', authMiddleware, roleMiddleware, categoryController.deleteCategoryImage);


export default router;