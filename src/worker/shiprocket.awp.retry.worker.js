// src/workers/shiprocketAwbRetry.worker.js
import prisma from "../db/db.js";
import {assignShipment} from "../services/shiprocket/shipment.service.js";
import {generateToken} from "../services/shiprocket/shiprocket.token.service.js";

export async function retryAwbAssignment()
{
    console.log("🔁 AWB Retry Worker started");

    const pendingShipments=await prisma.shipment.findMany({
        where: {
            status: "CREATED",
            awb: null,
        },
        take: 10, // prevent overload
    });

    if (!pendingShipments.length)
    {
        console.log("✅ No pending shipments for AWB");
        return;
    }

    const token=await generateToken();

    for (const shipment of pendingShipments)
    {
        try
        {
            console.log(`🔄 Retrying AWB for shipment ${shipment.shipmentId}`);
            await assignShipment(shipment.shipmentId, token);
        } catch (err)
        {
            console.error(
                `❌ Retry failed for shipment ${shipment.shipmentId}`,
                err?.message
            );
        }
    }
}
