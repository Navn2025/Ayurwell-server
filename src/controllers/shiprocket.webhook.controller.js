import prisma from "../db/db.js";
import {SHIPROCKET_STATUS_MAP} from "../utils/shiprocket.status.map.js";
import {processRTORefund} from "../services/refund/refund.service.js";

export async function shiprocketWebhook(req, res)
{
    try
    {
        /* ───── Security ───── */
        const token=req.headers["x-api-key"];
        if (token!==process.env.SHIPROCKET_WEBHOOK_TOKEN)
        {
            console.warn("🚫 Invalid webhook token");
            return res.status(200).json({success: false});
        }

        const payload=req.body;
        console.log("📦 Shiprocket Webhook:", payload);

        const {
            sr_order_id,
            shipment_status,
            shipment_status_id,
            is_return,
            awb,
            courier_name,
        }=payload;

        /* ───── Find shipment ───── */
        const shipment=await prisma.shipment.findFirst({
            where: {shiprocketOrderId: Number(sr_order_id)},
            include: {order: true},
        });

        if (!shipment)
        {
            console.warn("⚠️ Shipment not found:", sr_order_id);
            return res.status(200).json({success: true});
        }

        const order=shipment.order;

        /* ──────────────────────────────
           1️⃣ RTO INITIATED
        ────────────────────────────── */
        if (is_return===1&&shipment.status!=="RTO_INITIATED")
        {
            await prisma.$transaction(async (tx) =>
            {
                await tx.shipment.update({
                    where: {id: shipment.id},
                    data: {status: "RTO_INITIATED"},
                });

                await tx.order.update({
                    where: {id: order.id},
                    data: {status: "RTO_INITIATED"},
                });

                await tx.orderStatusHistory.create({
                    data: {
                        orderId: order.id,
                        status: "RTO_INITIATED",
                        note: "RTO initiated by Shiprocket",
                    },
                });
            });

            return res.status(200).json({success: true});
        }

        /* ──────────────────────────────
           2️⃣ RTO DELIVERED → REFUND POINT
        ────────────────────────────── */
        if (
            is_return===1&&
            shipment_status?.toUpperCase().includes("RTO")&&
            shipment_status?.toUpperCase().includes("DELIVERED")&&
            shipment.status!=="RTO_DELIVERED"
        )
        {
            await prisma.$transaction(async (tx) =>
            {
                await tx.shipment.update({
                    where: {id: shipment.id},
                    data: {
                        status: "RTO_DELIVERED",
                        awb: awb||shipment.awb,
                        courierName: courier_name||shipment.courierName,
                    },
                });

                await tx.order.update({
                    where: {id: order.id},
                    data: {status: "RTO_DELIVERED"},
                });

                await tx.orderStatusHistory.create({
                    data: {
                        orderId: order.id,
                        status: "RTO_DELIVERED",
                        note: "Return received back to warehouse",
                    },
                });
            });

            /* 🔥 AUTO REFUND FOR PREPAID RTO */
            if (order.paymentMethod==="PREPAID")
            {
                try
                {
                    await processRTORefund(order.id);
                    console.log(`✅ Auto-refund initiated for RTO order: ${order.orderNumber}`);
                } catch (refundError)
                {
                    console.error(`❌ Auto-refund failed for order ${order.orderNumber}:`, refundError.message);
                    // Don't fail webhook - refund can be retried manually
                }
            }

            return res.status(200).json({success: true});
        }

        /* ──────────────────────────────
           3️⃣ DELIVERED
        ────────────────────────────── */
        if (shipment_status_id===7&&order.status!=="DELIVERED")
        {
            await prisma.$transaction(async (tx) =>
            {
                await tx.shipment.update({
                    where: {id: shipment.id},
                    data: {
                        status: "DELIVERED",
                        awb: awb||shipment.awb,
                        courierName: courier_name||shipment.courierName,
                        deliveredAt: new Date(),
                    },
                });

                await tx.order.update({
                    where: {id: order.id},
                    data: {
                        status: "DELIVERED",
                        codCollected:
                            order.paymentMethod==="COD"? true:order.codCollected,
                    },
                });

                await tx.orderStatusHistory.create({
                    data: {
                        orderId: order.id,
                        status: "DELIVERED",
                        note:
                            order.paymentMethod==="COD"
                                ? "COD collected successfully"
                                :"Order delivered",
                    },
                });
            });

            return res.status(200).json({success: true});
        }

        /* ──────────────────────────────
           4️⃣ Other status updates
        ────────────────────────────── */
        const mappedStatus=
            SHIPROCKET_STATUS_MAP[shipment_status?.toUpperCase()]||
            shipment.status;

        if (mappedStatus!==shipment.status)
        {
            await prisma.shipment.update({
                where: {id: shipment.id},
                data: {
                    status: mappedStatus,
                    awb: awb||shipment.awb,
                    courierName: courier_name||shipment.courierName,
                },
            });
        }

        return res.status(200).json({success: true});
    } catch (error)
    {
        console.error("❌ Webhook processing error:", error);
        return res.status(200).json({success: false});
    }
}
