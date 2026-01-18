import Razorpay from 'razorpay';
import prisma from '../db/db.js';
import crypto from "crypto";
import {assignShipment, createShipment} from "../services/shiprocket/shipment.service.js";
import {generateToken} from "../services/shiprocket/shiprocket.token.service.js";
import {publishToQueue} from '../broker/borker.js';

let razorpay=null;
if (process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET)
{
    razorpay=new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
} else
{
    console.warn("Razorpay credentials missing: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
}
async function initiatePayment(req, res)
{
    try
    {
        if (!razorpay)
        {
            return res.status(503).json({
                message: "Payment service not configured",
            });
        }

        const userId=req.user.userId||req.user.id;
        const role=req.user.role;
        const {orderId}=req.params;

        // 1️⃣ Fetch order
        const order=await prisma.order.findUnique({
            where: {id: orderId},
        });

        if (!order)
        {
            return res.status(404).json({
                message: "Order not found",
            });
        }

        // 2️⃣ User can pay only their order (admin allowed)
        if (role!=="ADMIN"&&order.userId!==userId)
        {
            return res.status(403).json({
                message: "You are not allowed to pay for this order",
            });
        }

        // 3️⃣ Only PREPAID orders can initiate payment
        if (order.paymentMethod!=="PREPAID")
        {
            return res.status(400).json({
                message: "Payment not required for COD orders",
            });
        }

        // 4️⃣ Prevent duplicate payments
        const existingPayment=await prisma.payment.findUnique({
            where: {orderId},
        });

        if (existingPayment)
        {
            return res.status(400).json({
                message: "Payment already initiated for this order",
            });
        }

        // 5️⃣ Create Razorpay order (amount must be in paise for Razorpay)
        // order.totalAmount is stored in rupees, so multiply by 100 for paise
        const amountInPaise=Math.round(order.totalAmount*100);
        const razorpayOrder=await razorpay.orders.create({
            amount: amountInPaise,
            currency: order.currency||"INR",
            receipt: `receipt_${order.orderNumber}`,
        });

        // 6️⃣ Save payment in DB (store amount in rupees for consistency)
        const payment=await prisma.payment.create({
            data: {
                orderId,
                razorpayOrderId: razorpayOrder.id,
                amount: order.totalAmount, // stored in rupees
                currency: order.currency||"INR",
                status: "CREATED",
            },
        });

        return res.status(200).json({
            message: "Payment initiated successfully",
            key: process.env.RAZORPAY_KEY_ID,
            razorpayOrder,
            payment,
        });

    } catch (error)
    {
        console.error("Error initiating payment:", error);
        return res.status(500).json({
            message: "Failed to initiate payment",
        });
    }
}


async function verifyPayment(req, res)
{
    try
    {
        /* ──────────────────────────────────────────────
           0️⃣ Auth data
        ────────────────────────────────────────────── */
        const userId=req.user.userId||req.user.id;
        const role=req.user.role;

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        }=req.body;

        /* ──────────────────────────────────────────────
           1️⃣ Validate payload
        ────────────────────────────────────────────── */
        if (!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)
        {
            return res.status(400).json({
                message: "Missing Razorpay payment details",
            });
        }

        /* ──────────────────────────────────────────────
           2️⃣ Fetch payment + order
        ────────────────────────────────────────────── */
        const payment=await prisma.payment.findUnique({
            where: {razorpayOrderId: razorpay_order_id},
            include: {
                order: true,
            },
        });

        if (!payment)
        {
            return res.status(404).json({
                message: "Payment record not found",
            });
        }

        /* ──────────────────────────────────────────────
           3️⃣ Authorization
        ────────────────────────────────────────────── */
        if (role!=="ADMIN"&&payment.order.userId!==userId)
        {
            return res.status(403).json({
                message: "Unauthorized payment verification",
            });
        }

        /* ──────────────────────────────────────────────
           4️⃣ Idempotency guard
        ────────────────────────────────────────────── */
        if (payment.status==="CAPTURED")
        {
            return res.status(200).json({
                message: "Payment already verified",
            });
        }

        /* ──────────────────────────────────────────────
           5️⃣ Order state validation
        ────────────────────────────────────────────── */
        if (payment.order.status!=="PENDING")
        {
            return res.status(400).json({
                message: "Order is not in payable state",
            });
        }

        /* ──────────────────────────────────────────────
           6️⃣ Verify Razorpay signature
        ────────────────────────────────────────────── */
        const generatedSignature=crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        /* ──────────────────────────────────────────────
           7️⃣ Signature mismatch → FAIL
        ────────────────────────────────────────────── */
        if (generatedSignature!==razorpay_signature)
        {
            await prisma.$transaction(async (tx) =>
            {
                await tx.payment.update({
                    where: {id: payment.id},
                    data: {
                        status: "PENDING",
                        razorpayPaymentId: null,
                        razorpaySignature: razorpay_signature,
                    },
                });

                await tx.order.update({
                    where: {id: payment.orderId},
                    data: {status: "PENDING"},
                });

                await tx.orderStatusHistory.create({
                    data: {
                        orderId: payment.orderId,
                        status: "PENDING",
                        note: "Razorpay signature mismatch",
                    },
                });
            });

            return res.status(400).json({
                message: "Payment verification failed",
            });
        }

        /* ──────────────────────────────────────────────
           8️⃣ CAPTURED → Update DB (ATOMIC)
        ────────────────────────────────────────────── */
        await prisma.$transaction(async (tx) =>
        {
            await tx.payment.update({
                where: {id: payment.id},
                data: {
                    status: "CAPTURED",
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature,
                },
            });

            await tx.order.update({
                where: {id: payment.orderId},
                data: {
                    status: "PAID",
                },
            });

            await tx.orderStatusHistory.create({
                data: {
                    orderId: payment.orderId,
                    status: "PAID",
                    note: "Payment successful via Razorpay",
                },
            });
        });

        await publishToQueue('ORDER_NOTIFICATION.ORDER_PAID', {
            orderId: payment.orderId,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,

        });
        let shipmentDetail;
        /* ──────────────────────────────────────────────
           9️⃣ Create Shipment (OUTSIDE transaction)
        ────────────────────────────────────────────── */
        try
        {
            const fullOrder=await prisma.order.findUnique({
                where: {id: payment.orderId},
                include: {
                    items: true,
                    user: true,
                    address: true,
                },
            });

            const token=await generateToken();
            const shipment=await createShipment(
                fullOrder,
                fullOrder.address,
                token,

            );

            shipmentDetail=await prisma.shipment.create({
                data: {
                    orderId: fullOrder.id,
                    shiprocketOrderId: shipment.order_id,
                    shipmentId: shipment.shipment_id,
                    status: "CREATED",

                    actualWeight: shipment.actualWeight||fullOrder.actualWeight||0,
                    volumetricWeight: shipment.volumetricWeight||fullOrder.volumetricWeight||0,
                    chargeableWeight: shipment.chargeableWeight||fullOrder.chargeableWeight||0,

                    deliveryFee: shipment.freight_charge||0,
                    codFee: shipment.cod_charges||0,
                    trackingUrl: shipment.tracking_url||null,
                },
            });
            await publishToQueue('SHIPMENT_NOTIFICATION.SHIPMENT_CREATED', {
                orderId: fullOrder.id,
                shipmentId: shipment.shipment_id,
                email: fullOrder.user.email,
                firstName: fullOrder.user.firstName,
                lastName: fullOrder.user.lastName,
                trackingUrl: shipment.tracking_url||null,
            });

        }
        catch (shipmentError)
        {
            console.error("Shipment creation failed:", shipmentError);
            // Order remains PAID — shipment retry can happen via cron/queue
        }
        try
        {
            const token=await generateToken();
            await assignShipment(shipmentDetail.shipmentId, token);
        }
        catch (assignError)
        {
            await publishToQueue('SHIPMENT_NOTIFICATION.SHIPMENT_ASSIGNED_FAILED', {
                orderId: payment.orderId,
                shipmentId: shipmentDetail.shipmentId,
                email: req.user.email,
                firstName: req.user.firstName,
                lastName: req.user.lastName,
            });
            console.error("Shipment assignment failed:", assignError);
            // Shipment assignment can be retried later
        }

        /* ──────────────────────────────────────────────
           🔟 Final response
        ────────────────────────────────────────────── */
        return res.status(200).json({
            message: "Payment verified and order placed successfully",
        });
    }
    catch (error)
    {
        await publishToQueue('PAYMENT_NOTIFICATION.PAYMENT_VERIFICATION_FAILED', {
            error: error.message,
            razorpay_order_id: req.body.razorpay_order_id,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            email: req.user.email,
        });
        console.error("Error verifying payment:", error);
        return res.status(500).json({
            message: "Payment verification failed",
        });
    }
}


export {initiatePayment, verifyPayment};