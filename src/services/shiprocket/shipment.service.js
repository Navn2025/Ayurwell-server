import axios from "../../config/axios.config.js";
import prisma from "../../db/db.js";
import {calculatePackageDimensions} from "../../utils/calculation.logic.js";

const STATE_MAP={
    mp: "Madhya Pradesh",
    mh: "Maharashtra",
    dl: "Delhi",
    up: "Uttar Pradesh",
};



function normalizeState(state)
{
    return STATE_MAP[state?.toLowerCase()]||state;
}
export async function createReturnShipment(order, address, token)
{
    const {length, breadth, height}=await calculatePackageDimensions(order);

    const user=await prisma.user.findUnique({
        where: {id: order.userId},
    });

    if (!user) throw new Error("User not found");

    // 🔁 Do NOT block if forward shipment exists
    const existingReturnShipment=await prisma.shipment.findFirst({
        where: {
            orderId: order.id,
            type: "RETURN",   // assuming you store shipment type
        },
    });

    if (existingReturnShipment)
    {
        throw new Error("Return shipment already created");
    }

    const payload={
        order_id: `${order.orderNumber}-R`,
        order_date: new Date().toISOString(),
        pickup_location: "Home",

        billing_customer_name: user.firstName||"Customer",
        billing_last_name: user.lastName||"NA",
        billing_address: address.addressLine1,
        billing_address_2: address.addressLine2||"NA",
        billing_city: address.city,
        billing_pincode: Number(address.postalCode),
        billing_state: normalizeState(address.state),
        billing_country: "India",
        billing_email: user.email,
        billing_phone: address.phoneNumber,

        shipping_is_billing: true,
        shipping_customer_name: user.firstName||"Customer",
        shipping_last_name: user.lastName||"NA",
        shipping_address: address.addressLine1,
        shipping_address_2: address.addressLine2||"NA",
        shipping_city: address.city,
        shipping_pincode: Number(address.postalCode),
        shipping_state: normalizeState(address.state),
        shipping_country: "India",
        shipping_phone: address.phoneNumber,

        order_items: order.items.map(item => ({
            name: item.productName,
            sku: item.sku,
            units: item.quantity,
            selling_price: Math.max(item.price/100, 500),
            discount: 0,
            tax: 0,
            hsn: "3004",
        })),

        payment_method: order.paymentMethod==="COD"? "COD":"Prepaid",
        sub_total: Math.max(order.totalAmount/100, 500),

        length,
        breadth,
        height,
        weight: Math.max(order.actualWeight||0.5, 0.5),

        cod: order.paymentMethod==="COD"? 1:0,
        cod_amount:
            order.paymentMethod==="COD"
                ? Math.max(order.totalAmount/100, 500)
                :0,
    };

    const response=await axios.post(
        "/v1/external/orders/create/return",
        payload,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        }
    );

    return response.data;
}

export async function createShipment(order, address, token)
{
    const {length, breadth, height}=await calculatePackageDimensions(order);

    const user=await prisma.user.findUnique({
        where: {id: order.userId},
    });

    if (!user) throw new Error("User not found");
    const existingShipment=await prisma.shipment.findFirst({
        where: {orderId: order.id},
    });
    if (existingShipment)
    {
        throw new Error("Shipment already created");
    }


    const payload={
        order_id: order.orderNumber,
        order_date: new Date().toISOString(),

        pickup_location: "Home",

        billing_customer_name: user.firstName||"Customer",
        billing_last_name: user.lastName||"NA",
        billing_address: address.addressLine1,
        billing_address_2: address.addressLine2||"NA",
        billing_city: address.city,
        billing_pincode: Number(address.postalCode),
        billing_state: normalizeState(address.state),
        billing_country: "India",
        billing_email: user.email,
        billing_phone: address.phoneNumber,

        shipping_is_billing: true,
        shipping_customer_name: user.firstName||"Customer",
        shipping_last_name: user.lastName||"NA",
        shipping_address: address.addressLine1,
        shipping_address_2: address.addressLine2||"NA",
        shipping_city: address.city,
        shipping_pincode: Number(address.postalCode),
        shipping_state: normalizeState(address.state),
        shipping_country: "India",
        shipping_phone: address.phoneNumber,

        order_items: order.items.map(item => ({
            name: item.productName,
            sku: item.sku,
            units: item.quantity,

            // 🔥 ENSURE ₹ VALUE, NOT PAISE
            selling_price: Math.max(item.price/100, 500),

            discount: 0,
            tax: 0,
            hsn: "3004", // laptop/computer category
        })),

        payment_method: order.paymentMethod==="COD"? "COD":"Prepaid",

        sub_total: Math.max(order.totalAmount/100, 500),

        length,
        breadth,
        height,
        weight: order.actualWeight||0.5,

        cod: order.paymentMethod==="COD"? 1:0,
        cod_amount:
            order.paymentMethod==="COD"
                ? Math.max(order.totalAmount/100, 500)
                :0,
    };

    console.log("📦 Shiprocket Payload:", payload);

    try
    {
        const response=await axios.post(
            "/orders/create/adhoc",
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("🚀 Shiprocket Response:", response.data);

        return response.data;
    } catch (error)
    {
        console.error(
            "❌ Shiprocket Error:",
            error?.response?.data||error.message
        );
        throw error;
    }
}


export async function assignShipment(shiprocketShipmentId, token)
{
    try
    {
        /* ──────────────────────────────
           1️⃣ Fetch shipment + order
        ────────────────────────────── */
        const shipment=await prisma.shipment.findFirst({
            where: {shipmentId: shiprocketShipmentId},
            include: {
                order: true
            }
        });

        if (!shipment)
        {
            throw new Error(`Shipment ${shiprocketShipmentId} not found`);
        }

        /* ──────────────────────────────
           2️⃣ Idempotency guard
        ────────────────────────────── */
        if (shipment.awb)
        {
            console.log(
                `Shipment ${shiprocketShipmentId} already has AWB: ${shipment.awb}`
            );
            return shipment;
        }

        /* ──────────────────────────────
           3️⃣ Read selected courier (AUTO)
        ────────────────────────────── */
        const courierId=shipment.order?.selectedCourierId;

        /* ──────────────────────────────
           4️⃣ Build payload
           - If courierId exists → use it
           - Else → let Shiprocket auto-assign
        ────────────────────────────── */
        const payload={
            shipment_id: shiprocketShipmentId,
            ...(courierId&&{courier_id: courierId})
        };

        let response;

        /* ──────────────────────────────
           5️⃣ Try preferred courier
        ────────────────────────────── */
        try
        {
            response=await axios.post(
                "/courier/assign/awb",
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    }
                }
            );
        } catch (err)
        {
            console.warn(
                "Preferred courier failed, retrying with auto-assignment"
            );

            // 🔁 Fallback → Shiprocket auto assigns courier
            response=await axios.post(
                "/courier/assign/awb",
                {shipment_id: shiprocketShipmentId},
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        console.log("🚚 Assign Shipment Response:", response.data);

        /* ──────────────────────────────
           6️⃣ Extract AWB safely
        ────────────────────────────── */
        const awb=
            response.data?.data?.awb_number||
            response.data?.response?.data?.awb_number||
            null;

        // ❌ AWB NOT GENERATED (wallet / KYC / balance)
        if (!awb)
        {
            console.warn(
                `⚠️ AWB not generated for shipment ${shiprocketShipmentId}`,
                response.data?.message
            );
            return shipment;
        }

        /* ──────────────────────────────
           7️⃣ Update shipment in DB
        ────────────────────────────── */
        const updatedShipment=await prisma.shipment.update({
            where: {id: shipment.id},
            data: {
                awb,
                courierId:
                    response.data?.response?.data?.courier_id??
                    response.data?.courier_company_id??
                    courierId??
                    null,
                courierName:
                    response.data?.response?.data?.courier_name??
                    response.data?.courier_name??
                    shipment.order?.selectedCourierName??
                    "Unknown",
                status: "AWB_ASSIGNED"
            }
        });

        console.log(
            `✅ Shipment ${shiprocketShipmentId} assigned AWB: ${updatedShipment.awb}`
        );

        return updatedShipment;

    } catch (error)
    {
        console.error(
            "❌ Assign Shipment Error:",
            error?.response?.data||error.message
        );
        throw error;
    }
}



