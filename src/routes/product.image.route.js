import multer from "multer";
import {Router} from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import {addImageToProduct, deleteAllImagesFromProduct, deleteImageFromProduct, getImageById, getImagesForProduct, setPrimaryImage} from "../controllers/product.image.controller.js";
import assertAdmin from "../middleware/role.middleware.js";

const router=Router();

const storage=multer.memoryStorage();
const upload=multer({storage});
// Accept multiple images at once (max 10 for example)
router.post('/:productId/images', authMiddleware, assertAdmin, upload.array('images', 10), addImageToProduct);
router.get('/:productId/images', getImagesForProduct);
router.get('/:imageId', getImageById);
router.patch('/:productId/images/:imageId/primary', authMiddleware, assertAdmin, setPrimaryImage);
router.delete('/all/:productId', authMiddleware, assertAdmin, deleteAllImagesFromProduct);
router.delete('/:imageId', authMiddleware, assertAdmin, deleteImageFromProduct);

export default router;