import multer from "multer";
import {Router} from "express";
import authMiddleware, {optionalAuthMiddleware} from "../middleware/auth.middleware.js";
import assertAdmin from "../middleware/role.middleware.js";
import concern from "../controllers/concern.controller.js";

const router=Router();

const storage=multer.memoryStorage();
const upload=multer({storage});

// Concern CRUD routes
router.post('/', authMiddleware, assertAdmin, concern.createConcern);
router.get('/', optionalAuthMiddleware, concern.getAllConcerns);
router.get('/id/:id', concern.getConcernById);
router.get('/slug/:slug', concern.getConcernBySlug);
router.put('/:id', authMiddleware, assertAdmin, concern.updateConcern);
router.delete('/:id', authMiddleware, assertAdmin, concern.deleteConcern);

// Concern Image routes (Single image)
router.post('/:concernId/image', authMiddleware, assertAdmin, upload.single('image'), concern.uploadConcernImage);
router.delete('/:concernId/image', authMiddleware, assertAdmin, concern.deleteConcernImage);

export default router;
