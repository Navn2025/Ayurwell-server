import {Router} from "express";
import {searchSuggestions, globalSearch, searchProducts} from "../controllers/search.controller.js";

const router=Router();
router.get("/suggestions", searchSuggestions);
router.get("/global", globalSearch);
router.get("/products", searchProducts);
export default router;