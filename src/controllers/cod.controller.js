import prisma from "../db/db.js";
import {assignShipment, createShipment} from "../services/shiprocket/shipment.service.js";
import {generateToken} from "../services/shiprocket/shiprocket.token.service.js";

async function createCODShipment(req, res)
{
    try
    {
        const userId=req.user.userId||req.user.id;
        const role=req.user.role;
        const {orderId}=req.params;
        const order=await prisma.order.findUnique({
            where: {id: orderId},
            include: {
                address: true,
                items: true
            }
        });

        if (!order)
        {
            return res.status(404).json({message: "Order not found"});
        }

        if (order.userId!==userId&&role!=="ADMIN")
        {
            return res.status(403).json({message: "Unauthorized"});
        }

        if (order.paymentMethod!=="COD")
        {
            return res.status(400).json({message: "Order is not COD"});
        }

        if (
            !order.actualWeight||
            !order.volumetricWeight||
            !order.chargeableWeight
        )
        {
            return res.status(400).json({
                message: "Order shipping weights not finalized"
            });
        }

        const existingShipment=await prisma.shipment.findUnique({
            where: {orderId}
        });

        if (existingShipment)
        {
            return res.status(400).json({
                message: "Shipment already exists for this order"
            });
        }

        const token=await generateToken();

        const shipmentResponse=await createShipment(
            order,
            order.address,
            token
        );

        /* ──────────────────────────────
           4️⃣ Save shipment (NO COD FIELDS)
        ────────────────────────────── */
        const shipment=await prisma.shipment.create({
            data: {
                orderId: order.id,
                shiprocketOrderId: shipmentResponse.order_id,
                shipmentId: shipmentResponse.shipment_id,

                status: "CREATED",
                trackingUrl: shipmentResponse.tracking_url||null,

                actualWeight: order.actualWeight,
                volumetricWeight: order.volumetricWeight,
                chargeableWeight: order.chargeableWeight,

                deliveryFee: order.deliveryFee||0,
                codFee: shipmentResponse.cod_charges||0
            }
        });

        /* ──────────────────────────────
           5️⃣ Assign courier + AWB
        ────────────────────────────── */
        try
        {
            await assignShipment(shipment.shipmentId, token);
        } catch (err)
        {
            console.error("AWB assignment failed:", err.message);
            // Retry via cron
        }
        await publishToQueue('COD_NOTIFICATION.SHIPMENT_CREATED', {
            orderId: order.id,
            shipmentId: shipment.shipmentId,
            email: order.user.email,
            firstName: order.user.firstName,
            lastName: order.user.lastName,
            trackingUrl: shipment.trackingUrl,
        });

        return res.status(201).json({
            message: "COD shipment created successfully",
            shipment
        });

    } catch (error)
    {
        console.error("Create COD shipment error:", error);
        await publishToQueue('COD_SHIPMENT_ERROR_QUEUE', {
            orderId: req.params.orderId,
            error: error.message,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
        });
        return res.status(500).json({
            message: error.message||"Failed to create COD shipment"
        });
    }
}
async function refundCODOrder(req, res)
{
    try
    {
        const {orderId}=req.params;
        const role=req.user.role;

        if (role!=="ADMIN")
        {
            return res.status(403).json({message: "Admin only"});
        }

        const order=await prisma.order.findUnique({
            where: {id: orderId},
            include: {shipment: true},
        });

        if (!order)
        {
            return res.status(404).json({message: "Order not found"});
        }

        if (order.paymentMethod!=="COD")
        {
            return res.status(400).json({message: "Not COD order"});
        }

        if (!order.codCollected)
        {
            return res.status(400).json({
                message: "COD amount not collected yet",
            });
        }

        if (order.status==="REFUNDED")
        {
            return res.status(400).json({message: "Already refunded"});
        }

        await prisma.$transaction(async (tx) =>
        {
            await tx.order.update({
                where: {id: order.id},
                data: {status: "REFUNDED"},
            });

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    status: "REFUNDED",
                    note: "COD refund processed manually",
                },
            });
        });

        return res.status(200).json({
            message: "COD refund marked successfully",
            amount: order.codAmount,
        });
    } catch (error)
    {
        console.error("COD refund error:", error);
        return res.status(500).json({
            message: error.message||"COD refund failed",
        });
    }
}


export {createCODShipment, refundCODOrder};
