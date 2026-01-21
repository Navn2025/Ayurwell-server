import prisma from "../db/db.js";


async function getAllPayments(req, res)
{
    try
    {
        if (req.user.role!=="ADMIN")
        {
            return res.status(403).json({message: "Access denied"});
        }

        const payments=await prisma.payment.findMany({
            include: {
                order: {
                    include: {
                        user: true,
                        items: true,
                        address: true,
                    },
                },
            },
            orderBy: {createdAt: "desc"},
        });

        res.status(200).json(payments);
    } catch (error)
    {
        console.error("Error fetching payments:", error);
        res.status(500).json({message: "Internal server error"});
    }
}

async function getUserPayments(req, res)
{
    try
    {
        const userId=req.user.userId;

        const payments=await prisma.payment.findMany({
            where: {
                order: {
                    userId: userId,
                },
            },
            include: {
                order: {
                    include: {
                        items: true,
                    },
                },
            },
            orderBy: {createdAt: "desc"},
        });

        res.status(200).json(payments);
    } catch (error)
    {
        console.error("Error fetching user payments:", error);
        res.status(500).json({message: "Internal server error"});
    }
}

async function getPaymentById(req, res)
{
    try
    {
        const {paymentId}=req.params;
        const userId=req.user.userId;
        const role=req.user.role;

        const payment=await prisma.payment.findUnique({
            where: {id: paymentId},
            include: {
                order: true,
            },
        });

        if (!payment)
        {
            return res.status(404).json({message: "Payment not found"});
        }

        if (role!=="ADMIN"&&payment.order.userId!==userId)
        {
            return res.status(403).json({message: "Unauthorized access"});
        }

        res.status(200).json(payment);
    } catch (error)
    {
        console.error("Error fetching payment by ID:", error);
        res.status(500).json({message: "Internal server error"});
    }
}

async function getPaymentByStatus(req, res)
{
    try
    {
        if (req.user.role!=="ADMIN")
        {
            return res.status(403).json({message: "Access denied"});
        }

        const {status}=req.params;

        const payments=await prisma.payment.findMany({
            where: {status},
            include: {order: true},
        });

        res.status(200).json(payments);
    } catch (error)
    {
        console.error("Error fetching payments by status:", error);
        res.status(500).json({message: "Internal server error"});
    }
}

async function getPaymentsByMethod(req, res)
{
    try
    {
        if (req.user.role!=="ADMIN")
        {
            return res.status(403).json({message: "Access denied"});
        }

        const {method}=req.params;

        const payments=await prisma.payment.findMany({
            where: {
                order: {
                    paymentMethod: method,
                },
            },
            include: {order: true},
        });

        res.status(200).json(payments);
    } catch (error)
    {
        console.error("Error fetching payments by method:", error);
        res.status(500).json({message: "Internal server error"});
    }
}
async function updatePaymentController(req, res)
{
    try
    {
        if (req.user.role!=="ADMIN")
        {
            return res.status(403).json({message: "Access denied"});
        }

        const {paymentId}=req.params;
        const {
            status,
            razorpayPaymentId,
            razorpaySignature,
        }=req.body;

        const payment=await prisma.payment.findUnique({
            where: {id: paymentId},
        });

        if (!payment)
        {
            return res.status(404).json({message: "Payment not found"});
        }

        const updatedPayment=await prisma.payment.update({
            where: {id: paymentId},
            data: {
                status,
                razorpayPaymentId,
                razorpaySignature,
            },
        });

        // Optional: sync order status
        if (status==="SUCCESS")
        {
            await prisma.order.update({
                where: {id: payment.orderId},
                data: {status: "PAID"},
            });
        }

        res.status(200).json(updatedPayment);
    } catch (error)
    {
        console.error("Admin update payment error:", error);
        res.status(500).json({message: "Internal server error"});
    }
}
async function userGetPaymentById(req, res)
{
    try
    {
        const {paymentId}=req.params;
        const userId=req.user.userId;

        const payment=await prisma.payment.findUnique({
            where: {id: paymentId},
            include: {order: true},
        });

        if (!payment)
        {
            return res.status(404).json({message: "Payment not found"});
        }

        if (payment.order.userId!==userId)
        {
            return res.status(403).json({message: "Unauthorized access"});
        }

        res.status(200).json(payment);
    } catch (error)
    {
        console.error("User get payment by id error:", error);
        res.status(500).json({message: "Internal server error"});
    }
}
async function userGetPaymentByStatus(req, res)
{
    try
    {
        const userId=req.user.userId;
        const {status}=req.params;

        const payments=await prisma.payment.findMany({
            where: {
                status,
                order: {
                    userId,
                },
            },
            include: {order: true},
            orderBy: {createdAt: "desc"},
        });

        res.status(200).json(payments);
    } catch (error)
    {
        console.error("User get payments by status error:", error);
        res.status(500).json({message: "Internal server error"});
    }
}
async function userGetPaymentsByMethod(req, res)
{
    try
    {
        const userId=req.user.userId;
        const {method}=req.params;

        const payments=await prisma.payment.findMany({
            where: {
                order: {
                    userId,
                    paymentMethod: method,
                },
            },
            include: {order: true},
            orderBy: {createdAt: "desc"},
        });

        res.status(200).json(payments);
    } catch (error)
    {
        console.error("User get payments by method error:", error);
        res.status(500).json({message: "Internal server error"});
    }
}


export {getAllPayments, getUserPayments, getPaymentById, getPaymentByStatus, getPaymentsByMethod, userGetPaymentById, userGetPaymentByStatus, userGetPaymentsByMethod, updatePaymentController};