import Razorpay from "razorpay";
import prisma from "../../db/db.js";
import {publishToQueue} from "../../broker/borker.js";

let razorpay=null;
if (process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET)
{
    razorpay=new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
}

/* ══════════════════════════════════════════════════════════════════
   REFUND TYPE CONSTANTS
══════════════════════════════════════════════════════════════════ */
export const REFUND_TYPES={
    CANCELLATION: "CANCELLATION",
    RTO: "RTO",
    CUSTOMER_RETURN: "CUSTOMER_RETURN",
    DAMAGED: "DAMAGED",
    WRONG_PRODUCT: "WRONG_PRODUCT",
    ADMIN_INITIATED: "ADMIN_INITIATED",
};

/* ══════════════════════════════════════════════════════════════════
   HELPER FUNCTION: Validate Razorpay Payment
   ══════════════════════════════════════════════════════════════════ */
async function validateRazorpayPayment(razorpayPaymentId)
{
    try
    {
        const payment=await razorpay.payments.fetch(razorpayPaymentId);
        console.log("Razorpay payment validation:", {
            id: payment.id,
            status: payment.status,
            amount: payment.amount,
            currency: payment.currency,
            captured: payment.captured,
            refunded: payment.refunded,
            refund_amount: payment.refund_amount
        });

        if (payment.status!=='captured')
        {
            throw new Error(`Payment not captured. Current status: ${payment.status}`);
        }

        if (payment.refunded)
        {
            throw new Error(`Payment already refunded. Refund amount: ${payment.refund_amount}`);
        }

        return payment;
    } catch (error)
    {
        console.error("Payment validation failed:", error);
        throw new Error(`Invalid Razorpay payment: ${error.message}`);
    }
}

/* ══════════════════════════════════════════════════════════════════
   1️⃣ CANCEL ORDER BEFORE SHIPMENT (PREPAID + COD)
   - Full refund for prepaid orders
   - No refund needed for COD
   ══════════════════════════════════════════════════════════════════ */
export async function cancelOrderBeforeShipment(orderId, userId, role)
{
    const order=await prisma.order.findUnique({
        where: {id: orderId},
        include: {
            payment: true,
            shipment: true,
            user: true,
        },
    });

    if (!order)
    {
        throw new Error("Order not found");
    }

    // Authorization check
    if (order.userId!==userId&&role!=="ADMIN")
    {
        throw new Error("Unauthorized");
    }

    // Already cancelled or refunded
    if (order.status==="CANCELLED"||order.status==="REFUNDED")
    {
        throw new Error("Order already cancelled or refunded");
    }

    // Cannot cancel after pickup
    if (
        order.shipment&&
        ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(
            order.shipment.status
        )
    )
    {
        throw new Error("Order cannot be cancelled after pickup");
    }

    /* ──────────────────────────────
       COD ORDER - Just Cancel (No Refund Needed)
    ────────────────────────────── */
    if (order.paymentMethod==="COD")
    {
        await prisma.$transaction(async (tx) =>
        {
            await tx.order.update({
                where: {id: order.id},
                data: {status: "CANCELLED"},
            });

            // Restore stock
            const orderItems=await tx.orderItem.findMany({
                where: {orderId: order.id},
            });

            for (const item of orderItems)
            {
                await tx.product.update({
                    where: {id: item.productId},
                    data: {
                        stockQuantity: {increment: item.quantity},
                    },
                });
            }

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: "CANCELLED",
                    note: "Order cancelled before shipment (COD)",
                },
            });
        });

        // Email notification
        try
        {
            await publishToQueue("ORDER.CANCELLED", {
                email: order.user.email,
                firstName: order.user.firstName,
                orderNumber: order.orderNumber,
            });
        } catch (emailError)
        {
            console.error("Email notification failed:", emailError);
        }

        return {
            success: true,
            message: "COD order cancelled successfully",
        };
    }

    /* ──────────────────────────────
       PREPAID ORDER - Full Refund (if payment captured) or Cancel (if not paid)
    ────────────────────────────── */
    if (order.paymentMethod==="PREPAID")
    {
        // If payment exists and is CAPTURED, process refund
        if (order.payment&&order.payment.status==="CAPTURED")
        {
            // Verify razorpayPaymentId exists
            if (!order.payment.razorpayPaymentId)
            {
                throw new Error("Cannot process refund: Razorpay payment ID not found");
            }

            // Check for existing refund
            const existingRefund=await prisma.refund.findFirst({
                where: {
                    paymentId: order.payment.id,
                    status: {in: ["INITIATED", "PROCESSING", "SUCCESS"]},
                },
            });

            if (existingRefund)
            {
                throw new Error("Refund already initiated for this order");
            }

            // Create refund record first
            const refundRecord=await prisma.refund.create({
                data: {
                    paymentId: order.payment.id,
                    amount: order.totalAmount, // Full refund (in rupees)
                    type: REFUND_TYPES.CANCELLATION,
                    reason: "Order cancelled before shipment",
                    mode: "ORIGINAL",
                    status: "INITIATED",
                },
            });

            try
            {
                // Convert amount from rupees to paise for Razorpay
                // order.totalAmount is in rupees, payment.amount is also in rupees
                const amountInPaise=Math.round(order.totalAmount*100);

                // Log request details for debugging
                console.log("Razorpay refund request:", {
                    paymentId: order.payment.razorpayPaymentId,
                    amount: amountInPaise,
                    orderId: order.orderNumber,
                    paymentStatus: order.payment.status,
                    originalAmount: order.totalAmount,
                    timestamp: new Date().toISOString(),
                    userId: userId
                });

                // Validate request parameters
                if (!order.payment.razorpayPaymentId||order.payment.razorpayPaymentId.trim()==='')
                {
                    throw new Error("Razorpay payment ID is missing or empty");
                }

                if (amountInPaise<=0)
                {
                    throw new Error(`Invalid refund amount: ${amountInPaise} paise`);
                }

                // Validate payment with Razorpay and check amount
                const originalPayment=await validateRazorpayPayment(order.payment.razorpayPaymentId);
                if (amountInPaise>originalPayment.amount)
                {
                    throw new Error(`Refund amount (${amountInPaise} paise) exceeds original payment amount (${originalPayment.amount} paise)`);
                }

                // Call Razorpay refund API
                const razorpayRefund=await razorpay.payments.refund(order.payment.razorpayPaymentId, {
                    amount: amountInPaise.toString(), // Full amount in paise as string
                    speed: "normal",
                    notes: {
                        order_id: order.orderNumber,
                        reason: "Order cancelled before shipment",
                    },
                });

                // Update in transaction
                await prisma.$transaction(async (tx) =>
                {
                    await tx.refund.update({
                        where: {id: refundRecord.id},
                        data: {
                            razorpayRefundId: razorpayRefund.id,
                            status: "PROCESSING",
                        },
                    });

                    await tx.payment.update({
                        where: {id: order.payment.id},
                        data: {
                            refundedAmount: order.totalAmount,
                            status: "REFUNDED",
                        },
                    });

                    await tx.order.update({
                        where: {id: order.id},
                        data: {status: "REFUNDED"},
                    });

                    // Restore stock
                    const orderItems=await tx.orderItem.findMany({
                        where: {orderId: order.id},
                    });

                    for (const item of orderItems)
                    {
                        await tx.product.update({
                            where: {id: item.productId},
                            data: {
                                stockQuantity: {increment: item.quantity},
                            },
                        });
                    }

                    await tx.orderStatusHistory.create({
                        data: {
                            orderId: order.id,
                            status: "REFUNDED",
                            note: `Cancellation refund of ₹${order.totalAmount} initiated`,
                        },
                    });
                });

                // Email notification
                try
                {
                    await publishToQueue("REFUND.INITIATED", {
                        email: order.user.email,
                        firstName: order.user.firstName,
                        orderNumber: order.orderNumber,
                        amount: order.totalAmount,
                        reason: "Order cancelled before shipment",
                    });
                } catch (emailError)
                {
                    console.error("Email notification failed:", emailError);
                }

                return {
                    success: true,
                    refundId: refundRecord.id,
                    razorpayRefundId: razorpayRefund.id,
                    amount: order.totalAmount,
                };
            } catch (error)
            {
                await prisma.refund.update({
                    where: {id: refundRecord.id},
                    data: {status: "FAILED"},
                });

                throw new Error(`Cancellation refund failed: ${error.message}`);
            }
        }
    }
}

/* ══════════════════════════════════════════════════════════════════
   2️⃣ RTO REFUND
   - Return To Origin refund when shipment is returned
   - Full refund for prepaid orders
══════════════════════════════════════════════════════════════════ */
export async function processRTORefund(orderId)
{
    const order=await prisma.order.findUnique({
        where: {id: orderId},
        include: {
            payment: true,
            shipment: true,
            user: true,
        },
    });

    if (!order)
    {
        throw new Error("Order not found");
    }

    if (!order.shipment||order.shipment.status!=="RTO")
    {
        throw new Error("Order must be in RTO status");
    }

    if (order.paymentMethod==="COD")
    {
        throw new Error("RTO refund not applicable for COD orders");
    }

    if (!order.payment||order.payment.status!=="CAPTURED")
    {
        throw new Error("Payment not captured");
    }

    // Check for existing refund
    const existingRefund=await prisma.refund.findFirst({
        where: {
            paymentId: order.payment.id,
            status: {in: ["INITIATED", "PROCESSING", "SUCCESS"]},
        },
    });

    if (existingRefund)
    {
        throw new Error("Refund already initiated for this order");
    }

    // Create refund record first
    const refundRecord=await prisma.refund.create({
        data: {
            paymentId: order.payment.id,
            amount: order.totalAmount,
            type: REFUND_TYPES.RTO,
            reason: "RTO - Product returned to warehouse",
            mode: "ORIGINAL",
            status: "INITIATED",
        },
    });

    try
    {
        // Convert amount from rupees to paise for Razorpay
        const amountInPaise=Math.round(order.totalAmount*100);

        // Validate payment with Razorpay and check amount
        const originalPayment=await validateRazorpayPayment(order.payment.razorpayPaymentId);
        if (amountInPaise>originalPayment.amount)
        {
            throw new Error(`Refund amount (${amountInPaise} paise) exceeds original payment amount (${originalPayment.amount} paise)`);
        }

        // Call Razorpay refund API
        const razorpayRefund=await razorpay.payments.refund(order.payment.razorpayPaymentId, {
            amount: amountInPaise.toString(),
            speed: "normal",
            notes: {
                order_id: order.orderNumber,
                reason: "RTO - Product returned to warehouse",
            },
        });

        // Update in transaction
        await prisma.$transaction(async (tx) =>
        {
            await tx.refund.update({
                where: {id: refundRecord.id},
                data: {
                    razorpayRefundId: razorpayRefund.id,
                    status: "PROCESSING",
                },
            });

            await tx.payment.update({
                where: {id: order.payment.id},
                data: {
                    refundedAmount: order.totalAmount,
                    status: "REFUNDED",
                },
            });

            await tx.order.update({
                where: {id: order.id},
                data: {status: "REFUNDED"},
            });

            // Restore stock
            const orderItems=await tx.orderItem.findMany({
                where: {orderId: order.id},
            });

            for (const item of orderItems)
            {
                await tx.product.update({
                    where: {id: item.productId},
                    data: {
                        stockQuantity: {increment: item.quantity},
                    },
                });
            }

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: "REFUNDED",
                    note: `RTO refund of ₹${order.totalAmount} initiated`,
                },
            });
        });

        // Email notification
        try
        {
            await publishToQueue("REFUND.INITIATED", {
                email: order.user.email,
                firstName: order.user.firstName,
                orderNumber: order.orderNumber,
                amount: order.totalAmount,
                reason: "RTO - Product returned to warehouse",
            });
        } catch (emailError)
        {
            console.error("Email notification failed:", emailError);
        }

        return {
            success: true,
            refundId: refundRecord.id,
            razorpayRefundId: razorpayRefund.id,
            amount: order.totalAmount,
        };
    } catch (error)
    {
        await prisma.refund.update({
            where: {id: refundRecord.id},
            data: {status: "FAILED"},
        });

        throw new Error(`RTO refund failed: ${error.message}`);
    }
}

/* ══════════════════════════════════════════════════════════════════
   3️⃣ CUSTOMER RETURN REFUND
   - Customer returns product within return window
   - Full refund after product received and QC passed
══════════════════════════════════════════════════════════════════ */
export async function processCustomerReturnRefund(returnId)
{
    const returnRecord=await prisma.return.findUnique({
        where: {id: returnId},
        include: {
            order: {
                include: {
                    payment: true,
                    user: true,
                },
            },
        },
    });

    if (!returnRecord)
    {
        throw new Error("Return not found");
    }

    if (returnRecord.status!=="RECEIVED")
    {
        throw new Error("Return must be in RECEIVED status for refund");
    }

    const order=returnRecord.order;

    // For COD, we need bank details (not implemented - throw error)
    if (order.paymentMethod==="COD")
    {
        throw new Error("COD refund requires bank details - contact support");
    }

    if (!order.payment||order.payment.status!=="CAPTURED")
    {
        throw new Error("Payment not captured");
    }

    // Idempotency check
    const existingRefund=await prisma.refund.findFirst({
        where: {
            returnId: returnRecord.id,
            status: {in: ["INITIATED", "PROCESSING", "SUCCESS"]},
        },
    });

    if (existingRefund)
    {
        return existingRefund;
    }

    // Create refund
    const refundRecord=await prisma.refund.create({
        data: {
            paymentId: order.payment.id,
            returnId: returnRecord.id,
            amount: order.totalAmount, // Full refund
            type: REFUND_TYPES.CUSTOMER_RETURN,
            reason: returnRecord.reason,
            mode: "ORIGINAL",
            status: "INITIATED",
        },
    });

    try
    {
        // Convert amount from rupees to paise for Razorpay
        const amountInPaise=Math.round(order.totalAmount*100);

        const razorpayRefund=await razorpay.payments.refund(order.payment.razorpayPaymentId, {
            amount: amountInPaise.toString(),
            speed: "normal",
            notes: {
                order_id: order.orderNumber,
                return_id: returnRecord.id,
                reason: returnRecord.reason,
            },
        });

        await prisma.$transaction(async (tx) =>
        {
            await tx.refund.update({
                where: {id: refundRecord.id},
                data: {
                    razorpayRefundId: razorpayRefund.id,
                    status: "PROCESSING",
                },
            });

            await tx.return.update({
                where: {id: returnRecord.id},
                data: {status: "COMPLETED"},
            });

            await tx.payment.update({
                where: {id: order.payment.id},
                data: {
                    refundedAmount: order.totalAmount,
                    status: "REFUNDED",
                },
            });

            await tx.order.update({
                where: {id: order.id},
                data: {status: "REFUNDED"},
            });

            // Restore stock
            const orderItems=await tx.orderItem.findMany({
                where: {orderId: order.id},
            });

            for (const item of orderItems)
            {
                await tx.product.update({
                    where: {id: item.productId},
                    data: {
                        stockQuantity: {increment: item.quantity},
                    },
                });
            }

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: "REFUNDED",
                    note: `Customer return refund of ₹${order.totalAmount} initiated`,
                },
            });
        });

        try
        {
            await publishToQueue("REFUND.INITIATED", {
                email: order.user.email,
                firstName: order.user.firstName,
                orderNumber: order.orderNumber,
                amount: order.totalAmount,
                reason: `Return: ${returnRecord.reason}`,
            });
        } catch (emailError)
        {
            console.error("Email notification failed:", emailError);
        }

        return {
            success: true,
            refundId: refundRecord.id,
            razorpayRefundId: razorpayRefund.id,
            amount: order.totalAmount,
        };
    } catch (error)
    {
        await prisma.refund.update({
            where: {id: refundRecord.id},
            data: {status: "FAILED"},
        });

        throw new Error(`Customer return refund failed: ${error.message}`);
    }
}

/* ══════════════════════════════════════════════════════════════════
   4️⃣ ADMIN INITIATED REFUND
   - For damaged products, wrong products, or other issues
   - Full refund without requiring physical return
══════════════════════════════════════════════════════════════════ */
export async function processAdminRefund(orderId, reason, adminId)
{
    const order=await prisma.order.findUnique({
        where: {id: orderId},
        include: {
            payment: true,
            user: true,
        },
    });

    if (!order)
    {
        throw new Error("Order not found");
    }

    if (order.paymentMethod!=="PREPAID")
    {
        throw new Error("Admin refund only supported for prepaid orders");
    }

    if (!order.payment||order.payment.status!=="CAPTURED")
    {
        throw new Error("Payment not captured");
    }

    // Check if already refunded
    if (order.payment.status==="REFUNDED")
    {
        throw new Error("Order already refunded");
    }

    // Idempotency
    const existingRefund=await prisma.refund.findFirst({
        where: {
            paymentId: order.payment.id,
            status: {in: ["INITIATED", "PROCESSING", "SUCCESS"]},
        },
    });

    if (existingRefund)
    {
        throw new Error("Refund already exists for this order");
    }

    // Determine refund type
    let refundType=REFUND_TYPES.ADMIN_INITIATED;
    if (reason.toLowerCase().includes("damage"))
    {
        refundType=REFUND_TYPES.DAMAGED;
    } else if (reason.toLowerCase().includes("wrong"))
    {
        refundType=REFUND_TYPES.WRONG_PRODUCT;
    }

    const refundRecord=await prisma.refund.create({
        data: {
            paymentId: order.payment.id,
            amount: order.totalAmount,
            type: refundType,
            reason: `Admin Refund: ${reason}`,
            mode: "ORIGINAL",
            status: "INITIATED",
        },
    });

    try
    {
        // Convert amount from rupees to paise for Razorpay
        const amountInPaise=Math.round(order.totalAmount*100);

        const razorpayRefund=await razorpay.payments.refund(order.payment.razorpayPaymentId, {
            amount: amountInPaise.toString(),
            speed: "normal",
            notes: {
                order_id: order.orderNumber,
                admin_id: adminId,
                reason: reason,
            },
        });

        await prisma.$transaction(async (tx) =>
        {
            await tx.refund.update({
                where: {id: refundRecord.id},
                data: {
                    razorpayRefundId: razorpayRefund.id,
                    status: "PROCESSING",
                },
            });

            await tx.payment.update({
                where: {id: order.payment.id},
                data: {
                    refundedAmount: order.totalAmount,
                    status: "REFUNDED",
                },
            });

            await tx.order.update({
                where: {id: order.id},
                data: {status: "REFUNDED"},
            });

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: "REFUNDED",
                    note: `Admin refund: ${reason}. Amount: ₹${order.totalAmount}`,
                },
            });
        });

        try
        {
            await publishToQueue("REFUND.INITIATED", {
                email: order.user.email,
                firstName: order.user.firstName,
                orderNumber: order.orderNumber,
                amount: order.totalAmount,
                reason: reason,
            });
        } catch (emailError)
        {
            console.error("Email notification failed:", emailError);
        }

        return {
            success: true,
            refundId: refundRecord.id,
            razorpayRefundId: razorpayRefund.id,
            amount: order.totalAmount,
        };
    } catch (error)
    {
        await prisma.refund.update({
            where: {id: refundRecord.id},
            data: {status: "FAILED"},
        });

        throw new Error(`Admin refund failed: ${error.message}`);
    }
}

/* ══════════════════════════════════════════════════════════════════
   5️⃣ GET REFUND STATUS
══════════════════════════════════════════════════════════════════ */
export async function getRefundByOrderId(orderId, userId, role)
{
    const order=await prisma.order.findUnique({
        where: {id: orderId},
        include: {
            payment: {
                include: {
                    refunds: true,
                },
            },
        },
    });

    if (!order)
    {
        throw new Error("Order not found");
    }

    if (order.userId!==userId&&role!=="ADMIN")
    {
        throw new Error("Unauthorized");
    }

    if (!order.payment)
    {
        return {refunds: [], message: "No payment found for this order"};
    }

    return order.payment.refunds;
}

/* ══════════════════════════════════════════════════════════════════
   6️⃣ RETRY FAILED REFUND (ADMIN ONLY)
══════════════════════════════════════════════════════════════════ */
export async function retryFailedRefund(refundId)
{
    const refund=await prisma.refund.findUnique({
        where: {id: refundId},
        include: {
            payment: {
                include: {
                    order: {
                        include: {user: true},
                    },
                },
            },
        },
    });

    if (!refund)
    {
        throw new Error("Refund not found");
    }

    if (refund.status!=="FAILED")
    {
        throw new Error("Only failed refunds can be retried");
    }

    const payment=refund.payment;
    const order=payment.order;

    // Verify razorpayPaymentId exists
    if (!payment.razorpayPaymentId)
    {
        throw new Error("Cannot retry refund: Razorpay payment ID not found");
    }

    try
    {
        const razorpayRefund=await razorpay.payments.refund(payment.razorpayPaymentId, {
            amount: Math.round(refund.amount*100).toString(), // Convert to paise and string
            speed: "normal",
            notes: {
                order_id: order.orderNumber,
                retry: "true",
            },
        });

        await prisma.$transaction(async (tx) =>
        {
            await tx.refund.update({
                where: {id: refund.id},
                data: {
                    razorpayRefundId: razorpayRefund.id,
                    status: "PROCESSING",
                },
            });

            await tx.payment.update({
                where: {id: payment.id},
                data: {
                    refundedAmount: refund.amount,
                    status: "REFUNDED",
                },
            });

            await tx.order.update({
                where: {id: order.id},
                data: {status: "REFUNDED"},
            });
        });

        return {
            success: true,
            refundId: refund.id,
            razorpayRefundId: razorpayRefund.id,
        };
    } catch (error)
    {
        throw new Error(`Retry failed: ${error.message}`);
    }
}

/* ══════════════════════════════════════════════════════════════════
   7️⃣ HANDLE RAZORPAY WEBHOOK
══════════════════════════════════════════════════════════════════ */
export async function handleRefundWebhook(event, refundEntity)
{
    if (!refundEntity||!refundEntity.id)
    {
        return {success: false, message: "Invalid refund entity"};
    }

    const refund=await prisma.refund.findUnique({
        where: {razorpayRefundId: refundEntity.id},
        include: {
            payment: {
                include: {
                    order: {include: {user: true}},
                },
            },
        },
    });

    if (!refund)
    {
        console.warn(`Refund not found for Razorpay ID: ${refundEntity.id}`);
        return {success: true, message: "Refund not found in DB"};
    }

    if (event==="refund.processed")
    {
        await prisma.$transaction(async (tx) =>
        {
            await tx.refund.update({
                where: {id: refund.id},
                data: {status: "SUCCESS"},
            });

            await tx.orderStatusHistory.create({
                data: {
                    orderId: refund.payment.orderId,
                    status: "REFUNDED",
                    note: `Refund of ₹${refund.amount} completed successfully`,
                },
            });
        });

        // Send success email
        try
        {
            await publishToQueue("REFUND.SUCCESS", {
                email: refund.payment.order.user.email,
                firstName: refund.payment.order.user.firstName,
                orderNumber: refund.payment.order.user.orderNumber,
                amount: refund.amount,
            });
        } catch (emailError)
        {
            console.error("Email notification failed:", emailError);
        }

        return {success: true, status: "SUCCESS"};
    }

    if (event==="refund.failed")
    {
        await prisma.refund.update({
            where: {id: refund.id},
            data: {status: "FAILED"},
        });

        // Send failure email
        try
        {
            await publishToQueue("REFUND.FAILED", {
                email: refund.payment.order.user.email,
                firstName: refund.payment.order.user.firstName,
                orderNumber: refund.payment.order.orderNumber,
                amount: refund.amount,
            });
        } catch (emailError)
        {
            console.error("Email notification failed:", emailError);
        }

        return {success: true, status: "FAILED"};
    }

    return {success: true, message: "Event not handled"};
}

/* ══════════════════════════════════════════════════════════════════
   8️⃣ GET ALL REFUNDS (ADMIN)
══════════════════════════════════════════════════════════════════ */
export async function getAllRefunds(page=1, limit=20, status=null)
{
    const where=status? {status}:{};

    const [refunds, total]=await Promise.all([
        prisma.refund.findMany({
            where,
            include: {
                payment: {
                    include: {
                        order: {
                            select: {
                                id: true,
                                orderNumber: true,
                                user: {
                                    select: {
                                        id: true,
                                        firstName: true,
                                        lastName: true,
                                        email: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: {createdAt: "desc"},
            skip: (page-1)*limit,
            take: limit,
        }),
        prisma.refund.count({where}),
    ]);

    return {
        refunds,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total/limit),
        },
    };
}