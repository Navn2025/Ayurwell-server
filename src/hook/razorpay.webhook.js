import crypto from "crypto";
import {handleRefundWebhook} from "../services/refund/refund.service.js";

export async function razorpayWebhook(req, res)
{
    try
    {
        /* ──────────────────────────────────────────────
           1️⃣ Verify Razorpay Webhook Signature
        ────────────────────────────────────────────── */
        const webhookSecret=process.env.RAZORPAY_WEBHOOK_SECRET;
        const razorpaySignature=req.headers["x-razorpay-signature"];

        const body=req.body.toString(); // RAW BODY REQUIRED

        const expectedSignature=crypto
            .createHmac("sha256", webhookSecret)
            .update(body)
            .digest("hex");

        if (razorpaySignature!==expectedSignature)
        {
            return res.status(400).json({message: "Invalid webhook signature"});
        }

        /* ──────────────────────────────────────────────
           2️⃣ Parse Event
        ────────────────────────────────────────────── */
        const eventData=JSON.parse(body);
        const event=eventData.event;
        const refund=eventData.payload?.refund?.entity;

        if (!refund)
        {
            return res.json({ok: true});
        }

        /* ──────────────────────────────────────────────
           3️⃣ Handle Refund Events via Service
        ────────────────────────────────────────────── */
        if (event==="refund.processed"||event==="refund.failed")
        {
            const result=await handleRefundWebhook(event, refund);
            return res.json({ok: true, ...result});
        }

        return res.json({ok: true});
    } catch (error)
    {
        console.error("Razorpay webhook error:", error);
        return res.status(500).json({message: "Webhook processing failed"});
    }
}
