import axios from "../../config/axios.config.js";
import prisma from "../../db/db.js";

export async function cancelShipment(orderId, token)
{
    const shipment=await prisma.shipment.findUnique({
        where: {orderId}
    });

    if (!shipment) throw new Error("Shipment not found");
    const nonCancelableStatuses=[
        "PICKED_UP",
        "IN_TRANSIT",
        "OUT_FOR_DELIVERY",
        "DELIVERED"
    ];

    if (nonCancelableStatuses.includes(shipment.status))
    {
        throw new Error("Shipment already picked up. RTO required.");
    }

    // 🚚 Shiprocket cancel
    await axios.post(
        "/orders/cancel",
        {ids: [shipment.shipmentId]},
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        }
    );

    // 🗄 Update DB
    await prisma.$transaction(async (tx) =>
    {
        await tx.shipment.update({
            where: {id: shipment.id},
            data: {status: "CANCELLED"}
        });

        await tx.order.update({
            where: {id: orderId},
            data: {status: "CANCELLED"}
        });

        await tx.orderStatusHistory.create({
            data: {
                orderId,
                status: "CANCELLED",
                note: "Shipment cancelled before pickup"
            }
        });
    });

    return {success: true};
}
