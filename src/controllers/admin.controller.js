import prisma from "../db/db.js";
import {retryAwbAssignment} from '../worker/shiprocket.awp.retry.worker.js';
export async function getDashboardStats(req, res)
{
    try
    {
        // Check if user is authenticated
        if (!req.user)
        {
            return res.status(401).json({message: "Unauthorized - Please login"});
        }

        const role=req.user.role;
        if (role!=="ADMIN"&&role!=="admin")
        {
            return res.status(403).json({message: "Admin access only"});
        }

        // Get all counts in parallel
        const [
            totalOrders,
            totalUsers,
            totalProducts,
            pendingOrders,
            paidOrders,
            confirmedOrders,
            shippedOrders,
            deliveredOrders,
            cancelledOrders,
            revenueResult,
            recentOrders,
            lowStockProducts
        ]=await Promise.all([
            prisma.order.count(),
            prisma.user.count({where: {role: "CUSTOMER"}}),
            prisma.product.count(),
            prisma.order.count({where: {status: "PENDING"}}),
            prisma.order.count({where: {status: "PAID"}}),
            prisma.order.count({where: {status: "CONFIRMED"}}),
            prisma.order.count({where: {status: "SHIPPED"}}),
            prisma.order.count({where: {status: "DELIVERED"}}),
            prisma.order.count({where: {status: "CANCELLED"}}),
            prisma.order.aggregate({
                where: {status: {in: ["DELIVERED", "SHIPPED", "CONFIRMED", "PAID"]}},
                _sum: {totalAmount: true}
            }),
            prisma.order.findMany({
                take: 5,
                orderBy: {createdAt: "desc"},
                include: {
                    user: {
                        select: {id: true, firstName: true, lastName: true, email: true}
                    }
                }
            }),
            prisma.product.findMany({
                where: {stockQuantity: {lte: 10}},
                take: 5,
                orderBy: {stockQuantity: "asc"},
                select: {id: true, name: true, stockQuantity: true}
            })
        ]);

        return res.status(200).json({
            stats: {
                totalOrders,
                totalUsers,
                totalProducts,
                pendingOrders,
                paidOrders,
                confirmedOrders,
                shippedOrders,
                deliveredOrders,
                cancelledOrders,
                totalRevenue: revenueResult._sum.totalAmount||0,
                recentOrders,
                lowStockProducts
            }
        });
    } catch (error)
    {
        console.error("Get dashboard stats error:", error);
        console.error("Error details:", {
            message: error.message,
            name: error.name,
            code: error.code,
            meta: error.meta
        });
        if (error instanceof Error)
        {
            res.status(500).json({
                message: "Failed to fetch dashboard stats",
                error: error.message,
                code: error.code,
                meta: error.meta
            });
        } else
        {
            res.status(500).json({
                message: "Failed to fetch dashboard stats",
                error: String(error)
            });
        }
    }
}

export async function getCODOrders(req, res)
{
    try
    {
        const role=req.user.role;
        if (role!=="ADMIN"&&role!=="admin")
        {
            return res.status(403).json({message: "Admin access only"});
        }

        const {status='all', page=1, limit=20}=req.query;
        const skip=(page-1)*limit;

        // Build where clause based on status filter
        const whereClause={
            paymentMethod: "COD"
        };

        if (status==='pending')
        {
            whereClause.codCollected=false;
            whereClause.codSettled=false;
        }
        else if (status==='collected')
        {
            whereClause.codCollected=true;
            whereClause.codSettled=false;
        }
        else if (status==='settled')
        {
            whereClause.codSettled=true;
        }

        const orders=await prisma.order.findMany({
            where: whereClause,
            skip: parseInt(skip),
            take: parseInt(limit),
            orderBy: {createdAt: "desc"},
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phoneNumber: true
                    }
                },
                address: true,
                shipment: {
                    select: {
                        id: true,
                        status: true,
                        awb: true,
                        trackingUrl: true,
                        codFee: true
                    }
                },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                images: true
                            }
                        }
                    }
                }
            }
        });

        const totalOrders=await prisma.order.count({where: whereClause});

        return res.status(200).json({
            orders,
            totalOrders,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(totalOrders/limit)
        });

    } catch (error)
    {
        console.error("Get COD orders error:", error);
        return res.status(500).json({message: "Failed to fetch COD orders"});
    }
}

export async function retryAWB(req, res)
{
    await retryAwbAssignment();
    res.json({message: "AWB retry executed manually"});
}

export async function getAllUsers(req, res)
{
    try
    {
        const role=req.user.role;
        if (role!=="ADMIN")
        {
            return res.status(403).json({message: "Admin access only"});
        }
        const {page=1, limit=20}=req.query;
        const skip=(page-1)*limit;
        const users=await prisma.user.findMany({
            skip: parseInt(skip),
            take: parseInt(limit),
            orderBy: {createdAt: "desc"},
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                role: true,
                createdAt: true,
                googleId: true,
                _count: {
                    select: {
                        orders: true
                    }
                }
            }
        });
        const totalUsers=await prisma.user.count();
        return res.status(200).json({
            users,
            totalUsers,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error)
    {
        console.error("Get all users error:", error);
        return res.status(500).json({message: "Failed to get users"});
    }
}

export async function getUserById(req, res)
{
    try
    {
        const role=req.user.role;
        if (role!=="ADMIN")
        {
            return res.status(403).json({message: "Admin access only"});
        }

        const {userId}=req.params;

        const user=await prisma.user.findUnique({
            where: {id: userId},
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                role: true,
                googleId: true,
                isActive: true,
                isEmailVerified: true,
                isProfileComplete: true,
                createdAt: true,
                updatedAt: true,
                addresses: true,
                cart: {
                    include: {
                        items: true
                    }
                },
                orders: {
                    orderBy: {createdAt: "desc"},
                    take: 10,
                    include: {
                        items: true,
                        payment: true
                    }
                },
                reviews: {
                    orderBy: {createdAt: "desc"},
                    take: 5,
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                _count: {
                    select: {
                        orders: true,
                        reviews: true
                    }
                }
            }
        });

        if (!user)
        {
            return res.status(404).json({message: "User not found"});
        }

        return res.status(200).json({user});
    } catch (error)
    {
        console.error("Get user by ID error:", error);
        return res.status(500).json({message: "Failed to get user"});
    }
}

export async function settleCODOrder(req, res)
{
    try
    {
        const {orderId}=req.params;
        const role=req.user.role;

        if (role!=="ADMIN")
        {
            return res.status(403).json({message: "Admin access only"});
        }

        const order=await prisma.order.findUnique({
            where: {id: orderId},
            include: {
                shipment: true
            }
        });

        if (!order)
        {
            return res.status(404).json({message: "Order not found"});
        }

        if (order.paymentMethod!=="COD")
        {
            return res.status(400).json({message: "Not a COD order"});
        }

        if (!order.codCollected)
        {
            return res.status(400).json({
                message: "COD not yet collected by courier"
            });
        }

        if (order.codSettled)
        {
            return res.status(400).json({
                message: "COD already settled"
            });
        }

        /* ──────────────────────────────
           Settle COD (ATOMIC)
        ────────────────────────────── */
        await prisma.$transaction(async (tx) =>
        {
            await tx.order.update({
                where: {id: order.id},
                data: {
                    codSettled: true
                }
            });

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: "COD_SETTLED",
                    note: "COD amount settled by admin"
                }
            });
        });

        return res.status(200).json({
            message: "COD settled successfully",
            orderId: order.id,
            amount: order.codAmount
        });

    } catch (error)
    {
        console.error("COD settlement error:", error);
        return res.status(500).json({
            message: error.message||"Failed to settle COD"
        });
    }
}


