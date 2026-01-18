import prisma from "../../db/db.js";

export async function markShipmentRTO(orderId)
{
    const shipment=await prisma.shipment.findUnique({
        where: {orderId}
    });

    if (!shipment) throw new Error("Shipment not found");

    await prisma.$transaction(async (tx) =>
    {
        await tx.shipment.update({
            where: {id: shipment.id},
            data: {status: "RTO_INITIATED"}
        });

        await tx.order.update({
            where: {id: orderId},
            data: {status: "RTO"}
        });

        await tx.orderStatusHistory.create({
            data: {
                orderId,
                status: "RTO",
                note: "Return to origin initiated"
            }
        });
    });

    return {success: true};
}
