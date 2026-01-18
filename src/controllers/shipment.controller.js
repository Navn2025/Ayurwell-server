import {publishToQueue} from "../broker/borker.js";
import prisma from "../db/db.js";
import {cancelShipment} from "../services/shiprocket/shipment.cancel.service.js";
import {markShipmentRTO} from "../services/shiprocket/shipment.rto.service.js";
import {selectCourier} from "../services/shiprocket/shiprocket.courier.selector.service.js";
import {generateToken} from "../services/shiprocket/shiprocket.token.service.js";
import {getCourierOptions} from "../services/shiprocket/shiprocket.transportation.service.js";

export async function getShipmentByOrder(req, res)
{
    try
    {
        const userId=req.user.userId||req.user.id;
        const {orderId}=req.params;

        const shipment=await prisma.shipment.findUnique({
            where: {orderId},
            include: {
                order: {
                    select: {userId: true}
                }
            }
        });

        if (!shipment)
        {
            return res.status(404).json({message: "Shipment not found"});
        }

        // Authorization
        if (!shipment.order||(shipment.order.userId!==userId&&req.user.role!=="ADMIN"))
        {
            return res.status(403).json({message: "Unauthorized"});
        }


        return res.status(200).json({
            orderId,
            awb: shipment.awb,
            courier: shipment.courierName,
            status: shipment.status,
            trackingUrl: shipment.trackingUrl,
            createdAt: shipment.createdAt,
            pickedUpAt: shipment.pickedUpAt,
            deliveredAt: shipment.deliveredAt
        });
    } catch (error)
    {
        console.error("Shipment fetch error:", error);
        return res.status(500).json({message: "Failed to fetch shipment"});
    }
}
export async function getShipmentById(req, res)
{
    try
    {
        const userId=req.user.userId||req.user.id;
        const {shipmentId}=req.params;

        const shipment=await prisma.shipment.findUnique({
            where: {id: shipmentId},
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
                        address: true,
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
                }
            }
        });

        if (!shipment)
        {
            return res.status(404).json({message: "Shipment not found"});
        }

        // Authorization
        if (shipment.order.userId!==userId&&req.user.role!=="ADMIN")
        {
            return res.status(403).json({message: "Unauthorized"});
        }

        return res.status(200).json({shipment});
    } catch (error)
    {
        console.error("Shipment fetch by ID error:", error);
        return res.status(500).json({message: "Failed to fetch shipment"});
    }
}

export async function getAllShipments(req, res)
{
    try
    {
        const shipments=await prisma.shipment.findMany({
            include: {
                order: {
                    select: {
                        userId: true,
                        totalAmount: true,
                        status: true
                    }
                }
            }
        });
        return res.status(200).json(shipments);
    }
    catch (error)
    {
        console.error("Shipments fetch error:", error);
        return res.status(500).json({message: "Failed to fetch shipments"});
    }
}
export async function cancelShipmentController(req, res)
{
    try
    {
        const {orderId}=req.params;
        const userId=req.user.userId||req.user.id;

        const order=await prisma.order.findUnique({
            where: {id: orderId}
        });

        if (!order)
        {
            return res.status(404).json({message: "Order not found"});
        }

        if (order.userId!==userId&&req.user.role!=="ADMIN")
        {
            return res.status(403).json({message: "Unauthorized"});
        }

        const token=await generateToken();
        await cancelShipment(orderId, token);
        await publishToQueue('SHIPMENT_NOTIFICATION.SHIPMENT_CANCELLED', {
            orderId: orderId,
            userId: order.userId,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName
        });

        return res.status(200).json({message: "Shipment cancelled successfully"});
    } catch (error)
    {
        return res.status(400).json({message: error.message});
    }
}
export async function requestRTOController(req, res)
{
    try
    {
        const {orderId}=req.params;
        const userId=req.user.userId||req.user.id;

        const order=await prisma.order.findUnique({
            where: {id: orderId}
        });

        if (!order)
        {
            return res.status(404).json({message: "Order not found"});
        }

        if (order.userId!==userId&&req.user.role!=="ADMIN")
        {
            return res.status(403).json({message: "Unauthorized"});
        }

        const shipment=await prisma.shipment.findUnique({
            where: {orderId}
        });

        if (!shipment)
        {
            return res.status(404).json({message: "Shipment not found"});
        }

        if (["RTO_INITIATED", "RTO_DELIVERED"].includes(shipment.status))
        {
            return res.status(400).json({message: "RTO already initiated"});
        }

        const eligibleStatuses=[
            "PICKED_UP",
            "IN_TRANSIT",
            "OUT_FOR_DELIVERY"
        ];

        if (!eligibleStatuses.includes(shipment.status))
        {
            return res.status(400).json({
                message: "Shipment is not eligible for RTO"
            });
        }

        const result=await markShipmentRTO(orderId);

        return res.status(200).json({
            message: "RTO initiated successfully",
            result
        });
    } catch (error)
    {
        return res.status(400).json({message: error.message});
    }
}
export async function calculateShipping(req, res)
{
    try
    {
        const {productId, quantity, pincode, strategy="CHEAPEST"}=req.body;

        /* 1️⃣ Fetch product */
        const product=await prisma.product.findUnique({
            where: {id: productId}
        });

        if (!product)
        {
            return res.status(404).json({message: "Product not found"});
        }

        if (
            !product.weight||
            !product.length||
            !product.breadth||
            !product.height
        )
        {
            return res.status(400).json({
                message: "Product shipping dimensions not set"
            });
        }

        /* 2️⃣ Calculate weights */
        const actualWeight=product.weight*quantity;
        const volumetricWeight=
            (product.length*product.breadth*product.height*quantity)/5000;

        const chargeableWeight=Math.max(actualWeight, volumetricWeight);

        /* 3️⃣ Token */
        const token=await generateToken();

        /* 4️⃣ Get couriers */
        const couriers=await getCourierOptions({
            pickupPincode: "452001",
            deliveryPincode: pincode,
            weight: chargeableWeight,
            cod: false,
            token
        });

        // Log all available courier rates for debugging
        console.log('🚚 Available courier rates:', couriers.map(c => ({
            id: c.courier_company_id,
            name: c.courier_name,
            rate: c.rate,
            estimatedDeliveryDays: c.estimated_delivery_days
        })));

        /* 5️⃣ Select courier */
        const selectedCourier=selectCourier({
            couriers,
            strategy
        });

        /* 6️⃣ RETURN ONLY (NO DB WRITE) */
        return res.status(200).json({
            chargeableWeight,
            courier: {
                id: selectedCourier.courier_company_id,
                name: selectedCourier.courier_name,
                shippingFee: Math.ceil(selectedCourier.rate),
                estimatedDeliveryDays: selectedCourier.estimated_delivery_days
            }
        });

    } catch (error)
    {
        console.error("Shipping calculation error:", error);
        return res.status(500).json({
            message: error.message
        });
    }
}

export async function calculateCartShipping(req, res)
{
    try
    {
        const userId=req.user.userId||req.user.id;
        const {pincode, strategy="CHEAPEST"}=req.body;

        if (!pincode)
        {
            return res.status(400).json({message: "Pincode is required"});
        }

        /* 1️⃣ Fetch cart with products */
        const cart=await prisma.cart.findUnique({
            where: {userId},
            include: {
                items: {
                    include: {
                        product: true
                    }
                }
            }
        });

        if (!cart||!cart.items.length)
        {
            return res.status(400).json({message: "Cart is empty"});
        }

        /* 2️⃣ Calculate totals and weights */
        let itemTotal=0; // Product prices are in RUPEES
        let totalActualWeight=0;
        let totalVolumetricWeight=0;

        for (const item of cart.items)
        {
            const price=item.priceAtAdd||item.product.discountPrice||item.product.price;
            itemTotal+=item.quantity*price; // in rupees

            if (!item.product.weight||!item.product.length||!item.product.breadth||!item.product.height)
            {
                return res.status(400).json({
                    message: `Shipping dimensions missing for ${item.product.name}`
                });
            }

            totalActualWeight+=item.product.weight*item.quantity;
            totalVolumetricWeight+=(item.product.length*item.product.breadth*item.product.height*item.quantity)/5000;
        }

        const chargeableWeight=Math.max(totalActualWeight, totalVolumetricWeight);

        /* 3️⃣ Get courier options */
        const token=await generateToken();
        const couriers=await getCourierOptions({
            pickupPincode: "452001",
            deliveryPincode: pincode,
            weight: chargeableWeight,
            cod: false,
            token
        });

        /* 4️⃣ Select courier */
        const selectedCourier=selectCourier({
            couriers,
            strategy
        });

        /* 5️⃣ Calculate shipping with free delivery threshold */
        // Threshold is ₹699 in rupees, shipping rate from Shiprocket is in rupees
        const FREE_DELIVERY_THRESHOLD=699; // ₹699 in rupees
        const originalShippingFee=Math.ceil(selectedCourier.rate); // already in rupees
        const isFreeDelivery=itemTotal>=FREE_DELIVERY_THRESHOLD;
        const shippingFee=isFreeDelivery? 0:originalShippingFee;

        // Return all values in RUPEES for consistency
        return res.status(200).json({
            subtotal: itemTotal, // in rupees
            chargeableWeight,
            courier: {
                id: selectedCourier.courier_company_id,
                name: selectedCourier.courier_name,
                estimatedDeliveryDays: selectedCourier.estimated_delivery_days
            },
            originalShippingFee, // in rupees
            shippingFee, // in rupees
            isFreeDelivery,
            freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD, // in rupees
            amountForFreeDelivery: isFreeDelivery? 0:FREE_DELIVERY_THRESHOLD-itemTotal, // in rupees
            total: itemTotal+shippingFee // in rupees
        });

    } catch (error)
    {
        console.error("Cart shipping calculation error:", error);
        return res.status(500).json({
            message: error.message||"Failed to calculate shipping"
        });
    }
}