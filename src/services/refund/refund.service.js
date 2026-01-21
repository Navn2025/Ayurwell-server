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

export const REFUND_TYPES={
    CANCELLATION: "CANCELLATION",
    RTO: "RTO",
    CUSTOMER_RETURN: "CUSTOMER_RETURN",
    DAMAGED: "DAMAGED",
    WRONG_PRODUCT: "WRONG_PRODUCT",
    ADMIN_INITIATED: "ADMIN_INITIATED",
};

/* ══════════════════════════════════════════════════════════════════
   HELPER: Validate Razorpay Payment and Get Refundable Amount
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
            amount_refunded: payment.amount_refunded,
            currency: payment.currency,
            captured: payment.captured,
        });

        if (payment.status!=='captured')
        {
            throw new Error(`Payment not captured. Current status: ${payment.status}`);
        }

        // Calculate refundable amount (in paise)
        const refundableAmount=payment.amount-(payment.amount_refunded||0);

        if (refundableAmount<=0)
        {
            throw new Error(`Payment already fully refunded. Original: ₹${payment.amount/100}, Refunded: ₹${payment.amount_refunded/100}`);
        }

        return {
            payment,
            refundableAmount, // in paise
            originalAmount: payment.amount, // in paise
            alreadyRefunded: payment.amount_refunded||0 // in paise
        };
    } catch (error)
    {
        console.error("Payment validation failed:", error);
        throw new Error(`Invalid Razorpay payment: ${error.message}`);
    }
}

/* ══════════════════════════════════════════════════════════════════
   1️⃣ CANCEL ORDER BEFORE SHIPMENT (PREPAID + COD)
   FULL REFUND - Refunds entire order amount in one transaction
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
       PREPAID ORDER - Full Refund (No Partial Refunds)
    ────────────────────────────── */
    if (order.paymentMethod==="PREPAID")
    {
        if (order.payment&&order.payment.status==="CAPTURED")
        {
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

// Validate payment and get refundable amount
            const {payment: razorpayPayment, refundableAmount, originalAmount, alreadyRefunded}=
                await validateRazorpayPayment(order.payment.razorpayPaymentId);

            // Additional validation for payment method
            console.log("Payment method details:", {
                method: razorpayPayment.method,
                bank: razorpayPayment.bank,
                captured: razorpayPayment.captured,
                refund_status: razorpayPayment.refund_status,
                created_at: razorpayPayment.created_at
            });

            // Check if payment is eligible for refund based on method
            if (razorpayPayment.method === 'netbanking' && !razorpayPayment.refund_status) {
                console.log("Netbanking payment detected, checking refund eligibility...");
            }

            // CHANGED: Always refund the full order amount (no partial refunds)
            const orderAmountInPaise=Math.round(order.totalAmount*100);

            console.log("Full refund calculation:", {
                orderTotalInRupees: order.totalAmount,
                orderTotalInPaise: orderAmountInPaise,
                razorpayOriginalAmount: originalAmount,
                razorpayRefundableAmount: refundableAmount,
                razorpayAlreadyRefunded: alreadyRefunded,
                razorpayPayment
            });

            // Verify the full amount is available for refund
            if (refundableAmount<orderAmountInPaise)
            {
                throw new Error(
                    `Cannot refund full amount. Order total: ₹${order.totalAmount}, `+
                    `Available for refund: ₹${refundableAmount/100}. `+
                    `Already refunded: ₹${alreadyRefunded/100}`
                );
            }

            // Validation before proceeding
            if (!orderAmountInPaise||orderAmountInPaise<=0||!Number.isInteger(orderAmountInPaise))
            {
                throw new Error(`Invalid refund amount: ${orderAmountInPaise}. Must be a positive integer in paise.`);
            }

            if (orderAmountInPaise<100)
            {
                throw new Error(`Refund amount too small: ₹${orderAmountInPaise/100}. Minimum is ₹1.00`);
            }

            // Create refund record for FULL amount
            const refundRecord=await prisma.refund.create({
                data: {
                    paymentId: order.payment.id,
                    amount: order.totalAmount, // Store full amount in rupees
                    type: REFUND_TYPES.CANCELLATION,
                    reason: "Order cancelled before shipment - Full refund",
                    mode: "ORIGINAL",
                    status: "INITIATED",
                },
            });

try
            {
                console.log("Initiating FULL Razorpay refund:", {
                    paymentId: order.payment.razorpayPaymentId,
                    amount: orderAmountInPaise,
                    amountInRupees: order.totalAmount,
                    amountType: typeof orderAmountInPaise,
                    orderId: order.orderNumber,
                    note: "FULL REFUND - No partial refund"
                });

                // Try alternative API call - refund without amount (full refund)
                let razorpayRefund;
                try {
                    console.log("Trying refund without amount parameter (full refund)...");
                    const refundData = {
                        paymentId: order.payment.razorpayPaymentId,
                        timestamp: new Date().toISOString()
                    };
                    console.log("Refund request data (no amount):", refundData);
                    razorpayRefund = await razorpay.payments.refund(order.payment.razorpayPaymentId);
                    console.log("Full refund successful:", razorpayRefund);
                } catch (fullRefundError) {
                    console.log("Full refund failed, trying with amount parameter:", fullRefundError.message);
                    console.log("Full refund error details:", {
                        statusCode: fullRefundError.statusCode,
                        error: fullRefundError.error,
                        message: fullRefundError.message
                    });
                    
                    // Call Razorpay refund API for FULL amount
                    const refundRequest = {
                        amount: parseInt(orderAmountInPaise),
                        speed: "normal",
                        notes: {
                            order_id: order.id,
                            order_number: order.orderNumber,
                            reason: "Order cancelled before shipment",
                            refund_type: "FULL_REFUND"
                        },
                    };
                    console.log("Refund request data (with amount):", {
                        paymentId: order.payment.razorpayPaymentId,
                        ...refundRequest,
                        timestamp: new Date().toISOString()
                    });
                    
                    razorpayRefund = await razorpay.payments.refund(order.payment.razorpayPaymentId, refundRequest);
                    console.log("Amount refund successful:", razorpayRefund);
                }

                console.log("Razorpay refund response:", {
                    id: razorpayRefund.id,
                    status: razorpayRefund.status,
                    amount: razorpayRefund.amount,
                    amountInRupees: razorpayRefund.amount/100
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
                            refundedAmount: order.totalAmount, // Full amount in rupees
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
                            note: `Full cancellation refund of ₹${order.totalAmount} initiated`,
                        },
                    });
                });

                try
                {
                    await publishToQueue("REFUND.INITIATED", {
                        email: order.user.email,
                        firstName: order.user.firstName,
                        id: order.id,
                        amount: order.totalAmount,
                        reason: "Order cancelled before shipment - Full refund",
                    });
                } catch (emailError)
                {
                    console.error("Email notification failed:", emailError);
                }

                return {
                    success: true,
                    message: "Full refund initiated successfully",
                    refundId: refundRecord.id,
                    razorpayRefundId: razorpayRefund.id,
                    amount: order.totalAmount,
                    refundType: "FULL"
                };
            } catch (error)
            {
                // Mark refund as failed
                await prisma.refund.update({
                    where: {id: refundRecord.id},
                    data: {status: "FAILED"},
                });

                // FIXED: Properly extract error message
                let errorMessage="Unknown refund error";

                if (error?.error?.description)
                {
                    errorMessage=error.error.description;
                } else if (error?.error?.message)
                {
                    errorMessage=error.error.message;
                } else if (error?.message)
                {
                    errorMessage=error.message;
                }

                console.error("Razorpay FULL refund error:", {
                    fullError: error,
                    errorStructure: JSON.stringify(error, null, 2),
                    extractedMessage: errorMessage,
                    paymentId: order.payment.razorpayPaymentId,
                    attemptedAmount: orderAmountInPaise,
                    attemptedAmountInRupees: order.totalAmount,
                    orderNumber: order.orderNumber
                });

                throw new Error(`Full cancellation refund failed: ${errorMessage}`);
            }
        } else
        {
            // Payment not captured - just cancel the order
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
                        note: "Order cancelled (payment not captured)",
                    },
                });
            });

            return {
                success: true,
                message: "Order cancelled successfully (no payment to refund)",
            };
        }
    }
}

/* ══════════════════════════════════════════════════════════════════
   2️⃣ RTO REFUND
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

    // Validate and get refundable amount
    const {refundableAmount}=await validateRazorpayPayment(order.payment.razorpayPaymentId);

    const orderAmountInPaise=Math.round(order.totalAmount*100);
    const actualRefundAmount=Math.min(refundableAmount, orderAmountInPaise);

    const refundRecord=await prisma.refund.create({
        data: {
            paymentId: order.payment.id,
            amount: actualRefundAmount/100,
            type: REFUND_TYPES.RTO,
            reason: "RTO - Product returned to warehouse",
            mode: "ORIGINAL",
            status: "INITIATED",
        },
    });

    try
    {
        const razorpayRefund=await razorpay.payments.refund(order.payment.razorpayPaymentId, {
            amount: actualRefundAmount,
            speed: "normal",
            notes: {
                order_id: order.id,
                reason: "RTO - Product returned to warehouse",
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
                    refundedAmount: actualRefundAmount/100,
                    status: "REFUNDED",
                },
            });

            await tx.order.update({
                where: {id: order.id},
                data: {status: "REFUNDED"},
            });

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
                    note: `RTO refund of ₹${actualRefundAmount/100} initiated`,
                },
            });
        });

        try
        {
            await publishToQueue("REFUND.INITIATED", {
                email: order.user.email,
                firstName: order.user.firstName,
                id: order.id,
                amount: actualRefundAmount/100,
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
            amount: actualRefundAmount/100,
            userId: order.userId,
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

// Export remaining functions with same fixes applied...
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

    if (order.paymentMethod==="COD")
    {
        throw new Error("COD refund requires bank details - contact support");
    }

    if (!order.payment||order.payment.status!=="CAPTURED")
    {
        throw new Error("Payment not captured");
    }

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

    const {refundableAmount}=await validateRazorpayPayment(order.payment.razorpayPaymentId);
    const orderAmountInPaise=Math.round(order.totalAmount*100);
    const actualRefundAmount=Math.min(refundableAmount, orderAmountInPaise);

    const refundRecord=await prisma.refund.create({
        data: {
            paymentId: order.payment.id,
            returnId: returnRecord.id,
            amount: actualRefundAmount/100,
            type: REFUND_TYPES.CUSTOMER_RETURN,
            reason: returnRecord.reason,
            mode: "ORIGINAL",
            status: "INITIATED",
        },
    });

    try
    {
        const razorpayRefund=await razorpay.payments.refund(order.payment.razorpayPaymentId, {
            amount: parseInt(actualRefundAmount),
            notes: {
                order_id: order.id,
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
                    refundedAmount: actualRefundAmount/100,
                    status: "REFUNDED",
                },
            });

            await tx.order.update({
                where: {id: order.id},
                data: {status: "REFUNDED"},
            });

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
                    note: `Customer return refund of ₹${actualRefundAmount/100} initiated`,
                },
            });
        });

        try
        {
            await publishToQueue("REFUND.INITIATED", {
                email: order.user.email,
                firstName: order.user.firstName,
                id: order.id,
                amount: actualRefundAmount/100,
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
            amount: actualRefundAmount/100,
            userId: order.userId,
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

    if (order.payment.status==="REFUNDED")
    {
        throw new Error("Order already refunded");
    }

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

    let refundType=REFUND_TYPES.ADMIN_INITIATED;
    if (reason.toLowerCase().includes("damage"))
    {
        refundType=REFUND_TYPES.DAMAGED;
    } else if (reason.toLowerCase().includes("wrong"))
    {
        refundType=REFUND_TYPES.WRONG_PRODUCT;
    }

    const {refundableAmount}=await validateRazorpayPayment(order.payment.razorpayPaymentId);
    const orderAmountInPaise=Math.round(order.totalAmount*100);
    const actualRefundAmount=Math.min(refundableAmount, orderAmountInPaise);

    const refundRecord=await prisma.refund.create({
        data: {
            paymentId: order.payment.id,
            amount: actualRefundAmount/100,
            type: refundType,
            reason: `Admin Refund: ${reason}`,
            mode: "ORIGINAL",
            status: "INITIATED",
        },
    });

    try
    {
        const razorpayRefund=await razorpay.payments.refund(order.payment.razorpayPaymentId, {
            amount: parseInt(actualRefundAmount),
            notes: {
                order_id: order.id,
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
                    refundedAmount: actualRefundAmount/100,
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
                    note: `Admin refund: ${reason}. Amount: ₹${actualRefundAmount/100}`,
                },
            });
        });

        try
        {
            await publishToQueue("REFUND.INITIATED", {
                email: order.user.email,
                firstName: order.user.firstName,
                id: order.id,
                amount: actualRefundAmount/100,
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
            amount: actualRefundAmount/100,
            userId: order.userId,
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

    if (!payment.razorpayPaymentId)
    {
        throw new Error("Cannot retry refund: Razorpay payment ID not found");
    }

    try
    {
        const {refundableAmount}=await validateRazorpayPayment(payment.razorpayPaymentId);
        const requestedAmountInPaise=Math.round(refund.amount*100);
        const actualRefundAmount=Math.min(refundableAmount, requestedAmountInPaise);

        const razorpayRefund=await razorpay.payments.refund(payment.razorpayPaymentId, {
            amount: parseInt(actualRefundAmount),
            notes: {
                order_id: order.id,
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
                    amount: actualRefundAmount/100,
                },
            });

            await tx.payment.update({
                where: {id: payment.id},
                data: {
                    refundedAmount: actualRefundAmount/100,
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

        try
        {
            await publishToQueue("REFUND.SUCCESS", {
                email: refund.payment.order.user.email,
                firstName: refund.payment.order.user.firstName,
                id: refund.payment.order.id,
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

        try
        {
            await publishToQueue("REFUND.FAILED", {
                email: refund.payment.order.user.email,
                firstName: refund.payment.order.user.firstName,
                id: refund.payment.order.id,
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