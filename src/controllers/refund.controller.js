import
{
    cancelOrderBeforeShipment,
    processRTORefund,
    processCustomerReturnRefund,
    processAdminRefund,
    getRefundByOrderId,
    retryFailedRefund,
    getAllRefunds,
} from "../services/refund/refund.service.js";
import prisma from "../db/db.js";
import {publishToQueue} from "../broker/borker.js";

/* ══════════════════════════════════════════════════════════════════
   1️⃣ CANCEL ORDER (CUSTOMER/ADMIN)
   POST /api/refund/cancel/:orderId
══════════════════════════════════════════════════════════════════ */
export async function cancelOrderController(req, res)
{
    try
    {
        const {orderId}=req.params;
        const userId=req.user.userId||req.user.id;
        const role=req.user.role;

        const result=await cancelOrderBeforeShipment(orderId, userId, role);
        console.log(result);
        await publishToQueue('ORDER_NOTIFICATION.ORDER_CANCELLED', {
            orderId: orderId,
            userId: userId,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            email: req.user.email
        });

        return res.status(200).json({
            success: true,
            message: result.message,
            refundId: result.refundId,
            razorpayRefundId: result.razorpayRefundId,
            amount: result.amount,
        });
    } catch (error)
    {
        await publishToQueue('ORDER_NOTIFICATION.ORDER_CANCELLATION_FAILED', {
            orderId: req.params.orderId,
            userId: req.user.userId||req.user.id,
            error: error.message,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            email: req.user.email
        });

        // Enhanced error logging
        console.error("Cancel order error:", {
            message: error.message,
            stack: error.stack,
            orderId: req.params.orderId,
            userId: req.user.userId||req.user.id,
            timestamp: new Date().toISOString()
        });

        // Provide more specific error response for Razorpay errors
        if (error.message.includes('Razorpay'))
        {
            return res.status(400).json({
                success: false,
                message: error.message,
                type: 'RAZORPAY_ERROR',
                orderId: req.params.orderId
            });
        }

        return res.status(400).json({
            success: false,
            message: error.message,
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   2️⃣ PROCESS RTO REFUND (ADMIN/WEBHOOK)
   POST /api/refund/rto/:orderId
══════════════════════════════════════════════════════════════════ */
export async function processRTORefundController(req, res)
{
    try
    {
        const {orderId}=req.params;

        const result=await processRTORefund(orderId);
        await publishToQueue('REFUND_NOTIFICATION.RTO_REFUND', {
            orderId: orderId,
            userId: result.userId,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,



        });

        return res.status(200).json({
            success: true,
            message: "RTO refund processed",
            ...result,
        });
    } catch (error)
    {
        await publishToQueue('REFUND_NOTIFICATION.RTO_REFUND_FAILED', {
            orderId: req.params.orderId,
            error: error.message,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
        });
        return res.status(400).json({
            success: false,
            message: error.message,
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   3️⃣ PROCESS CUSTOMER RETURN REFUND (ADMIN)
   POST /api/refund/return/:returnId
══════════════════════════════════════════════════════════════════ */
export async function processReturnRefundController(req, res)
{
    try
    {
        const {returnId}=req.params;

        const result=await processCustomerReturnRefund(returnId);
        await publishToQueue('REFUND_NOTIFICATION.RETURN_REFUND', {
            returnId: returnId,
            userId: result.userId,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
        });
        return res.status(200).json({
            success: true,
            message: "Return refund processed",
            ...result,
        });
    } catch (error)
    {
        await publishToQueue('REFUND_NOTIFICATION.RETURN_REFUND_FAILED', {
            returnId: req.params.returnId,
            error: error.message,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
        });
        return res.status(400).json({
            success: false,
            message: error.message,
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   4️⃣ ADMIN REFUND (DAMAGED/WRONG/OTHER)
   POST /api/refund/admin/:orderId
══════════════════════════════════════════════════════════════════ */
export async function adminRefundController(req, res)
{
    try
    {
        const {orderId}=req.params;
        const {reason}=req.body;
        const adminId=req.user.userId||req.user.id;

        if (!reason)
        {
            return res.status(400).json({
                success: false,
                message: "Reason is required",
            });
        }

        const result=await processAdminRefund(orderId, reason, adminId);
        await publishToQueue('REFUND_NOTIFICATION.ADMIN_REFUND', {
            orderId: orderId,
            userId: result.userId,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
        });

        return res.status(200).json({
            success: true,
            message: "Admin refund processed",
            ...result,
        });
    } catch (error)
    {
        console.error("Admin refund error:", error);
        await publishToQueue('REFUND_NOTIFICATION.ADMIN_REFUND_FAILED', {
            orderId: req.params.orderId,
            error: error.message,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
        });
        return res.status(400).json({
            success: false,
            message: error.message,
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   5️⃣ GET REFUND STATUS FOR ORDER (CUSTOMER/ADMIN)
   GET /api/refund/order/:orderId
══════════════════════════════════════════════════════════════════ */
export async function getRefundStatusController(req, res)
{
    try
    {
        const {orderId}=req.params;
        const userId=req.user.userId||req.user.id;
        const role=req.user.role;

        const refunds=await getRefundByOrderId(orderId, userId, role);

        return res.status(200).json({
            success: true,
            refunds,
        });
    } catch (error)
    {
        console.error("Get refund error:", error);
        return res.status(400).json({
            success: false,
            message: error.message,
        });
    }
}

export async function retryRefundController(req, res)
{
    try
    {
        const {refundId}=req.params;

        const result=await retryFailedRefund(refundId);

        return res.status(200).json({
            success: true,
            message: "Refund retry initiated",
            ...result,
        });
    } catch (error)
    {
        console.error("Retry refund error:", error);
        return res.status(400).json({
            success: false,
            message: error.message,
        });
    }
}

export async function getAllRefundsController(req, res)
{
    try
    {
        const page=parseInt(req.query.page)||1;
        const limit=parseInt(req.query.limit)||20;
        const status=req.query.status||null;

        const result=await getAllRefunds(page, limit, status);

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error)
    {
        console.error("Get all refunds error:", error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}

export async function getRefundByIdController(req, res)
{
    try
    {
        const {refundId}=req.params;

        const refund=await prisma.refund.findUnique({
            where: {id: refundId},
            include: {
                payment: {
                    include: {
                        order: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        firstName: true,
                                        lastName: true,
                                        email: true,
                                        phoneNumber: true,
                                    },
                                },
                                items: true,
                                address: true,
                            },
                        },
                    },
                },
            },
        });

        if (!refund)
        {
            return res.status(404).json({
                success: false,
                message: "Refund not found",
            });
        }

        return res.status(200).json({
            success: true,
            refund,
        });
    } catch (error)
    {
        console.error("Get refund by ID error:", error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
}
