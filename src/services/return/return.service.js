import prisma from "../../db/db.js";

/* ══════════════════════════════════════════════════════════════════
   🔄 RETURN VALIDATION HELPERS
   ══════════════════════════════════════════════════════════════════ */

const validateReturnEligibility=async (orderId, userId=null, role=null) =>
{
    const order=await prisma.order.findUnique({
        where: {id: orderId},
        include: {
            user: true,
            items: true,
            payment: true,
            shipment: true,
            returns: true,
            statusHistory: true
        }
    });

    if (!order)
    {
        throw new Error("Order not found");
    }

    // Check user authorization (for customer requests)
    if (userId&&role==='CUSTOMER'&&order.userId!==userId)
    {
        throw new Error("Unauthorized: You can only request returns for your own orders");
    }

    // Check if order is eligible for return
    const ineligibleStatuses=['PENDING', 'CANCELLED', 'REFUNDED', 'FAILED'];
    if (ineligibleStatuses.includes(order.status))
    {
        throw new Error(`Order is ${order.status.toLowerCase()} and not eligible for returns`);
    }

    // Check if order is delivered (required for customer returns)
    if (order.status!=='DELIVERED')
    {
        throw new Error("Order must be delivered before requesting a return");
    }

    // Check return window (30 days from delivery)
    console.log(order);
    const deliveryDate=order.statusHistory
        .filter(h => h.status==='DELIVERED')
        .sort((a, b) => new Date(b.createdAt)-new Date(a.createdAt))[0];

    if (!deliveryDate)
    {
        throw new Error("Delivery date not found");
    }

    const returnWindow=7; // days
    const daysSinceDelivery=Math.floor(
        (new Date()-new Date(deliveryDate.createdAt))/(1000*60*60*24)
    );

    if (daysSinceDelivery>returnWindow)
    {
        throw new Error(`Return window expired. Returns must be requested within ${returnWindow} days of delivery`);
    }

    // Check if return already exists for this order
    if (order.returns.length>0)
    {
        const activeReturn=order.returns.find(r =>
            !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(r.status)
        );

        if (activeReturn)
        {
            throw new Error(`Return already in progress: ${activeReturn.status.toLowerCase()}`);
        }
    }

    return order;
};

/* ══════════════════════════════════════════════════════════════════
   1️⃣ CREATE RETURN REQUEST (CUSTOMER)
   ══════════════════════════════════════════════════════════════════ */

export const createReturnRequest=async (orderId, userId, reason, isPartial=false, itemIds=[]) =>
{
    try
    {
        // Validate eligibility
        const order=await validateReturnEligibility(orderId, userId, 'CUSTOMER');

        // Validate partial return items
        if (isPartial)
        {
            if (!itemIds||itemIds.length===0)
            {
                throw new Error("Item IDs are required for partial returns");
            }

            const validItemIds=order.items.map(item => item.id);
            const invalidItems=itemIds.filter(id => !validItemIds.includes(id));

            if (invalidItems.length>0)
            {
                throw new Error("Invalid item IDs provided");
            }
        }

        // Create return request
        const returnRequest=await prisma.return.create({
            data: {
                orderId,
                reason,
                status: 'REQUESTED',
                isPartial,
                shipmentId: order.shipment?.id||null
            },
            include: {
                order: {
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
                        items: true,
                        payment: true,
                        shipment: true
                    }
                }
            }
        });

        // Create order status history
        await prisma.orderStatusHistory.create({
            data: {
                orderId,
                status: order.status,
                note: `Return requested: ${reason}`
            }
        });


        return returnRequest;

    } catch (error)
    {
        console.error("Create return request error:", error);
        throw error;
    }
};

/* ══════════════════════════════════════════════════════════════════
   2️⃣ GET RETURN BY ID
   ══════════════════════════════════════════════════════════════════ */

export const getReturnById=async (returnId, userId=null, role=null) =>
{
    try
    {
        const returnRequest=await prisma.return.findUnique({
            where: {id: returnId},
            include: {
                order: {
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
                        items: true,
                        payment: true,
                        shipment: true,
                        address: true
                    }
                },
                refunds: true
            }
        });

        if (!returnRequest)
        {
            throw new Error("Return request not found");
        }

        // Check authorization for customer access
        if (userId&&role==='CUSTOMER'&&returnRequest.order.userId!==userId)
        {
            throw new Error("Unauthorized: You can only view your own returns");
        }

        return returnRequest;

    } catch (error)
    {
        console.error("Get return by ID error:", error);
        throw error;
    }
};

/* ══════════════════════════════════════════════════════════════════
   3️⃣ GET RETURNS BY ORDER
   ══════════════════════════════════════════════════════════════════ */

export const getReturnsByOrder=async (orderId, userId=null, role=null) =>
{
    try
    {
        const returns=await prisma.return.findMany({
            where: {orderId},
            include: {
                order: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true
                            }
                        }
                    }
                },
                refunds: true
            },
            orderBy: {createdAt: 'desc'}
        });

        // Check authorization for customer access
        if (userId&&role==='CUSTOMER')
        {
            const order=await prisma.order.findUnique({
                where: {id: orderId},
                select: {userId: true}
            });

            if (!order||order.userId!==userId)
            {
                throw new Error("Unauthorized: You can only view returns for your own orders");
            }
        }

        return returns;

    } catch (error)
    {
        console.error("Get returns by order error:", error);
        throw error;
    }
};

/* ══════════════════════════════════════════════════════════════════
   4️⃣ GET ALL RETURNS (ADMIN)
   ══════════════════════════════════════════════════════════════════ */

export const getAllReturns=async (page=1, limit=20, status=null) =>
{
    try
    {
        const skip=(page-1)*limit;
        const where=status? {status}:{};

        const [returns, total]=await Promise.all([
            prisma.return.findMany({
                where,
                include: {
                    order: {
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
                            items: true,
                            payment: true,
                            shipment: true
                        }
                    },
                    refunds: true
                },
                orderBy: {createdAt: 'desc'},
                skip,
                take: limit
            }),
            prisma.return.count({where})
        ]);

        return {
            returns,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total/limit)
            }
        };

    } catch (error)
    {
        console.error("Get all returns error:", error);
        throw error;
    }
};

/* ══════════════════════════════════════════════════════════════════
   5️⃣ UPDATE RETURN STATUS (ADMIN)
   ══════════════════════════════════════════════════════════════════ */

export const updateReturnStatus=async (returnId, newStatus, adminId, notes=null) =>
{
    try
    {
        const returnRequest=await prisma.return.findUnique({
            where: {id: returnId},
            include: {
                order: {
                    include: {
                        payment: true,
                        shipment: true
                    }
                }
            }
        });

        if (!returnRequest)
        {
            throw new Error("Return request not found");
        }

        // Validate status transition
        const validTransitions={
            'REQUESTED': ['APPROVED', 'REJECTED', 'CANCELLED'],
            'APPROVED': ['PICKUP_SCHEDULED', 'CANCELLED'],
            'PICKUP_SCHEDULED': ['PICKED_UP', 'CANCELLED'],
            'PICKED_UP': ['RECEIVED', 'CANCELLED'],
            'RECEIVED': ['COMPLETED', 'REJECTED'],
            'REJECTED': [],
            'COMPLETED': [],
            'CANCELLED': []
        };

        if (!validTransitions[returnRequest.status].includes(newStatus))
        {
            throw new Error(`Invalid status transition from ${returnRequest.status} to ${newStatus}`);
        }

        // Update return status
        const updatedReturn=await prisma.return.update({
            where: {id: returnId},
            data: {
                status: newStatus,
                updatedAt: new Date()
            },
            include: {
                order: {
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
                        payment: true,
                        shipment: true
                    }
                },
                refunds: true
            }
        });

        // Create order status history entry
        await prisma.orderStatusHistory.create({
            data: {
                orderId: returnRequest.orderId,
                status: returnRequest.order.status,
                note: `Return status updated to ${newStatus}${notes? `: ${notes}`:''}`
            }
        });

        // Auto-trigger refund if return is completed
        if (newStatus==='COMPLETED'&&returnRequest.order.payment)
        {
            const {processCustomerReturnRefund}=await import('../refund/refund.service.js');
            await processCustomerReturnRefund(returnId);
        }

        return updatedReturn;

    } catch (error)
    {
        console.error("Update return status error:", error);
        throw error;
    }
};

/* ══════════════════════════════════════════════════════════════════
   6️⃣ CANCEL RETURN REQUEST (CUSTOMER)
   ══════════════════════════════════════════════════════════════════ */

export const cancelReturnRequest=async (returnId, userId) =>
{
    try
    {
        const returnRequest=await prisma.return.findUnique({
            where: {id: returnId},
            include: {
                order: {
                    select: {userId: true}
                }
            }
        });

        if (!returnRequest)
        {
            throw new Error("Return request not found");
        }

        // Check authorization
        if (returnRequest.order.userId!==userId)
        {
            throw new Error("Unauthorized: You can only cancel your own return requests");
        }

        // Check if return can be cancelled
        const cancellableStatuses=['REQUESTED', 'APPROVED'];
        if (!cancellableStatuses.includes(returnRequest.status))
        {
            throw new Error(`Return cannot be cancelled in ${returnRequest.status.toLowerCase()} status`);
        }

        // Cancel return
        const cancelledReturn=await prisma.return.update({
            where: {id: returnId},
            data: {
                status: 'CANCELLED',
                updatedAt: new Date()
            },
            include: {
                order: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true
                            }
                        }
                    }
                }
            }
        });

        return cancelledReturn;

    } catch (error)
    {
        console.error("Cancel return request error:", error);
        throw error;
    }
};

/* ══════════════════════════════════════════════════════════════════
   7️⃣ GET RETURN STATISTICS (ADMIN)
   ══════════════════════════════════════════════════════════════════ */

export const getReturnStatistics=async () =>
{
    try
    {
        const [
            totalReturns,
            pendingReturns,
            approvedReturns,
            completedReturns,
            rejectedReturns,
            cancelledReturns
        ]=await Promise.all([
            prisma.return.count(),
            prisma.return.count({where: {status: 'REQUESTED'}}),
            prisma.return.count({where: {status: 'APPROVED'}}),
            prisma.return.count({where: {status: 'COMPLETED'}}),
            prisma.return.count({where: {status: 'REJECTED'}}),
            prisma.return.count({where: {status: 'CANCELLED'}})
        ]);

        return {
            totalReturns,
            pendingReturns,
            approvedReturns,
            completedReturns,
            rejectedReturns,
            cancelledReturns
        };

    } catch (error)
    {
        console.error("Get return statistics error:", error);
        throw error;
    }
};