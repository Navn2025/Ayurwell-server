import express from "express";
import {shiprocketWebhook} from "../controllers/shiprocket.webhook.controller.js";
import {razorpayWebhook} from "../hook/razorpay.webhook.js";

const router=express.Router();

// Shiprocket shipment status webhook
router.post("/shipment", shiprocketWebhook);

// Razorpay refund webhook (needs raw body)
router.post(
    "/razorpay",
    express.raw({type: "application/json"}),
    razorpayWebhook
);

export default router;
