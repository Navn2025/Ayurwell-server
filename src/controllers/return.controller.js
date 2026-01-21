import {publishToQueue} from "../broker/borker.js";
import
{
    createReturnRequest,
    getReturnById,
    getReturnsByOrder,
    getAllReturns,
    updateReturnStatus,
    cancelReturnRequest,
    getReturnStatistics
} from "../services/return/return.service.js";
import {createReturnShipment} from "../services/shiprocket/shipment.service.js";
import {generateToken} from "../services/shiprocket/shiprocket.token.service.js";

/* ══════════════════════════════════════════════════════════════════
   1️⃣ CREATE RETURN REQUEST (CUSTOMER)
   POST /api/return/request/:orderId
   ══════════════════════════════════════════════════════════════════ */

export async function createReturnRequestController(req, res)
{
    try
    {
        const {orderId}=req.params;
        let {reason, isPartial=false, itemIds=[]}=req.body;
        const userId=req.user.userId||req.user.id;

        // Validate required fields
        if (!reason||reason.trim().length===0)
        {
            return res.status(400).json({
                success: false,
                message: "Return reason is required"
            });
        }
        reason=reason.trim();
        if (reason.length<10)
        {
            return res.status(400).json({
                success: false,
                message: "Return reason must be at least 10 characters long"
            });
        }
        if (reason.length>500)
        {
            return res.status(400).json({
                success: false,
                message: "Return reason cannot exceed 500 characters"
            });
        }

        // Fetch order and validate existence
        const order=await prisma.order.findUnique({
            where: {id: orderId},
            include: {items: true}
        });
        if (!order)
        {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Validate itemIds for partial/full return
        let usedItemIds;
        if (isPartial)
        {
            if (!itemIds||!Array.isArray(itemIds)||itemIds.length===0)
            {
                return res.status(400).json({
                    success: false,
                    message: "Item IDs are required for partial return"
                });
            }
            // Check if provided item IDs are valid for the order
            const validItemIds=order.items.map(item => item.id);
            for (const itemId of itemIds)
            {
                if (!validItemIds.includes(itemId))
                {
                    return res.status(400).json({
                        success: false,
                        message: `Item ID ${itemId} is not valid for this order`
                    });
                }
            }
            usedItemIds=itemIds;
        } else
        {
            // For full return, include all item IDs from the order
            usedItemIds=order.items.map(item => item.id);
        }

        const addressId=order.addressId;

        // Create return request

        const returnRequest=await createReturnRequest(
            orderId,
            userId,
            reason,
            isPartial,
            usedItemIds
        );
        if (!returnRequest)
        {
            return res.status(400).json({
                success: false,
                message: "Failed to create return request"
            });
        }

        // Create shipment for return
        await publishToQueue('RETURN_NOTIFICATION.RETURN_REQUEST_CREATED', {

            returnId: returnRequest.id,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
        });

        let shipment=null;
        try
        {
            const token=await generateToken();
            shipment=await createReturnShipment(order, addressId, token);

        } catch (shipErr)
        {
            // Log but don't block return creation
            console.error("Return shipment creation error:", shipErr);
        }

        // Update returnRequest with shipment details if shipment was created
        if (shipment)
        {
            try
            {
                await prisma.returnRequest.update({
                    where: {id: returnRequest.id},
                    data: {
                        shiprocketReturnId: shipment.id,
                        shiprocketReturnAwb: shipment.awb_code,
                        shiprocketReturnLabelUrl: shipment.label_url
                    }
                });
                await publishToQueue('RETURN_NOTIFICATION.RETURN_SHIPMENT_CREATED', {
                    returnId: returnRequest.id,
                    email: req.user.email,
                    firstName: req.user.firstName,
                    lastName: req.user.lastName,
                });
            } catch (updateErr)
            {
                await publishToQueue('RETURN_NOTIFICATION.RETURN_SHIPMENT_UPDATE_FAILED', {
                    returnId: returnRequest.id,
                    error: updateErr.message,
                    email: req.user.email,
                    firstName: req.user.firstName,
                    lastName: req.user.lastName,
                });
                console.error("Failed to update returnRequest with shipment:", updateErr);
            }
        }

        // Ensure itemIds and items are always arrays in the response
        const safeReturnRequest={
            ...returnRequest,
            itemIds: Array.isArray(returnRequest.itemIds)? returnRequest.itemIds:[],
            items: Array.isArray(returnRequest.items)? returnRequest.items:[],
        };


        return res.status(201).json({
            success: true,
            message: "Return request created successfully",
            return: safeReturnRequest
        });

    } catch (error)
    {
        await publishToQueue('RETURN_REQUEST_ERROR_QUEUE', {
            error: error.message,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
        });
        console.error("Create return request error:", error);
        return res.status(500).json({
            success: false,
            message: error.message||"Failed to create return request"
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   2️⃣ GET RETURN BY ID (CUSTOMER/ADMIN)
   GET /api/return/:returnId
   ══════════════════════════════════════════════════════════════════ */

export async function getReturnByIdController(req, res)
{
    try
    {
        const {returnId}=req.params;
        const userId=req.user.userId||req.user.id;
        const role=req.user.role;

        const returnRequest=await getReturnById(returnId, userId, role);
        // Ensure itemIds and items are always arrays in the response
        const safeReturnRequest={
            ...returnRequest,
            itemIds: Array.isArray(returnRequest?.itemIds)? returnRequest.itemIds:[],
            items: Array.isArray(returnRequest?.items)? returnRequest.items:[],
        };

        return res.status(200).json({
            success: true,
            return: safeReturnRequest
        });

    } catch (error)
    {
        console.error("Get return by ID error:", error);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   3️⃣ GET RETURNS BY ORDER (CUSTOMER/ADMIN)
   GET /api/return/order/:orderId
   ══════════════════════════════════════════════════════════════════ */

export async function getReturnsByOrderController(req, res)
{
    try
    {
        const {orderId}=req.params;
        const userId=req.user.userId||req.user.id;
        const role=req.user.role;

        const returns=await getReturnsByOrder(orderId, userId, role);

        return res.status(200).json({
            success: true,
            returns
        });

    } catch (error)
    {
        console.error("Get returns by order error:", error);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   4️⃣ GET ALL RETURNS (ADMIN ONLY)
   GET /api/return/all
   ══════════════════════════════════════════════════════════════════ */

export async function getAllReturnsController(req, res)
{
    try
    {
        const page=parseInt(req.query.page)||1;
        const limit=parseInt(req.query.limit)||20;
        const status=req.query.status||null;

        const result=await getAllReturns(page, limit, status);

        return res.status(200).json({
            success: true,
            ...result
        });

    } catch (error)
    {
        console.error("Get all returns error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   5️⃣ UPDATE RETURN STATUS (ADMIN ONLY)
   PUT /api/return/:returnId/status
   ══════════════════════════════════════════════════════════════════ */

export async function updateReturnStatusController(req, res)
{
    try
    {
        const {returnId}=req.params;
        const {status, notes}=req.body;
        const adminId=req.user.userId||req.user.id;

        // Validate required fields
        if (!status)
        {
            return res.status(400).json({
                success: false,
                message: "Status is required"
            });
        }

        // Validate status values
        const validStatuses=['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED'];
        if (!validStatuses.includes(status))
        {
            return res.status(400).json({
                success: false,
                message: "Invalid status value"
            });
        }

        const updatedReturn=await updateReturnStatus(returnId, status, adminId, notes);

        return res.status(200).json({
            success: true,
            message: "Return status updated successfully",
            return: updatedReturn
        });

    } catch (error)
    {
        console.error("Update return status error:", error);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   6️⃣ CANCEL RETURN REQUEST (CUSTOMER)
   PUT /api/return/:returnId/cancel
   ══════════════════════════════════════════════════════════════════ */

export async function cancelReturnRequestController(req, res)
{
    try
    {
        const {returnId}=req.params;
        const userId=req.user.userId||req.user.id;

        const cancelledReturn=await cancelReturnRequest(returnId, userId);
        await publishToQueue('RETURN_REQUEST_CANCELLED_QUEUE', {
            returnId: returnId,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
        });

        return res.status(200).json({
            success: true,
            message: "Return request cancelled successfully",
            return: cancelledReturn
        });

    } catch (error)
    {
        console.error("Cancel return request error:", error);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   7️⃣ GET RETURN STATISTICS (ADMIN ONLY)
   GET /api/return/statistics
   ══════════════════════════════════════════════════════════════════ */

export async function getReturnStatisticsController(req, res)
{
    try
    {
        const statistics=await getReturnStatistics();

        return res.status(200).json({
            success: true,
            statistics
        });

    } catch (error)
    {
        console.error("Get return statistics error:", error);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

/* ══════════════════════════════════════════════════════════════════
   8️⃣ SCHEDULE RETURN PICKUP (ADMIN ONLY)
   POST /api/return/:returnId/pickup
   ══════════════════════════════════════════════════════════════════ */

export async function scheduleReturnPickupController(req, res)
{
    try
    {
        const {returnId}=req.params;
        const {pickupDate, pickupAddress, notes}=req.body;
        const adminId=req.user.userId||req.user.id;

        // Validate required fields
        if (!pickupDate)
        {
            return res.status(400).json({
                success: false,
                message: "Pickup date is required"
            });
        }

        // Update return status to PICKUP_SCHEDULED
        const updatedReturn=await updateReturnStatus(
            returnId,
            'PICKUP_SCHEDULED',
            adminId,
            `Pickup scheduled for ${pickupDate}. ${notes||''}`
        );

        // TODO: Integrate with Shiprocket for return pickup creation
        // This would involve creating a return shipment in Shiprocket

        return res.status(200).json({
            success: true,
            message: "Return pickup scheduled successfully",
            return: updatedReturn
        });

    } catch (error)
    {
        console.error("Schedule return pickup error:", error);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}