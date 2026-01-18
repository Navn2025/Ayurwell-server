import {Router} from "express";
import
{
    createContact,
    getAllContacts,
    getContactById,
    updateContactStatus,
    addContactReply,
    deleteContact,
    sendReplyToContactEnhanced
} from "../controllers/contact.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import {optionalAuthMiddleware} from "../middleware/auth.middleware.js";

const router=Router();

// Public routes
router.post("/", optionalAuthMiddleware, createContact); // Anyone can submit a contact form

// Admin routes - require authentication
router.get("/", authMiddleware, getAllContacts);
router.get("/:contactId", authMiddleware, getContactById);
router.put("/:contactId/status", authMiddleware, updateContactStatus);
router.post("/:contactId/reply", authMiddleware, addContactReply);
router.post("/:contactId/reply-enhanced", authMiddleware, sendReplyToContactEnhanced);
router.delete("/:contactId", authMiddleware, deleteContact);

export default router;
