import prisma from "../db/db.js";
import {nanoid} from "nanoid";
import {selectCourier} from "../services/shiprocket/shiprocket.courier.selector.service.js";
import {getCourierOptions} from "../services/shiprocket/shiprocket.transportation.service.js";
import {generateToken} from "../services/shiprocket/shiprocket.token.service.js";
import {publishToQueue} from "../broker/borker.js";
async function createOrderForAllCartProducts(req, res)
{
    try
    {
        const userId=req.user.userId||req.user.id;
        const {paymentMethod, addressId}=req.body;

        if (!userId)
        {
            return res.status(401).json({message: "User not authenticated"});
        }

        if (!addressId)
        {
            return res.status(400).json({message: "addressId is required"});
        }

        const validMethods=["PREPAID", "COD"];
        if (!validMethods.includes(paymentMethod))
        {
            return res.status(400).json({message: "Invalid payment method"});
        }

        const orderNumber=`ORD-${nanoid(8).toUpperCase()}`;

        const result=await prisma.$transaction(async (tx) =>
        {

            /* ──────────────────────────────
               1️⃣ Cart
            ────────────────────────────── */
            const cart=await tx.cart.findUnique({
                where: {userId},
            });

            if (!cart)
            {
                throw {status: 404, message: "Cart not found"};
            }

            const cartItems=await tx.cartItem.findMany({
                where: {cartId: cart.id},
                include: {product: true},
            });

            if (cartItems.length===0)
            {
                throw {status: 400, message: "Cart is empty"};
            }

            /* ──────────────────────────────
               2️⃣ Address
            ────────────────────────────── */
            const address=await tx.address.findFirst({
                where: {id: addressId, userId},
            });

            if (!address)
            {
                throw {status: 400, message: "Invalid address"};
            }

            /* ──────────────────────────────
               3️⃣ Totals + Weight calc
               Note: Product prices and priceAtAdd are in RUPEES
            ──────────────────────────────────────────────────── */
            let itemTotal=0; // Total in rupees
            let totalActualWeight=0;
            let totalVolumetricWeight=0;

            for (const item of cartItems)
            {
                if (item.quantity>item.product.stockQuantity)
                {
                    throw {
                        status: 409,
                        message: `Insufficient stock for ${item.product.name}`,
                    };
                }

                itemTotal+=item.quantity*item.priceAtAdd; // priceAtAdd is in rupees

                if (
                    !item.product.weight||
                    !item.product.length||
                    !item.product.breadth||
                    !item.product.height
                )
                {
                    throw {
                        status: 400,
                        message: `Shipping dimensions missing for ${item.product.name}`,
                    };
                }

                totalActualWeight+=item.product.weight*item.quantity;

                totalVolumetricWeight+=
                    (item.product.length*
                        item.product.breadth*
                        item.product.height*
                        item.quantity)/5000;
            }

            const chargeableWeight=Math.max(
                totalActualWeight,
                totalVolumetricWeight
            );

            /* ──────────────────────────────
               4️⃣ Shipping calculation (FINAL)
            ────────────────────────────── */
            const token=await generateToken();

            const couriers=await getCourierOptions({
                pickupPincode: "452001", // warehouse
                deliveryPincode: address.postalCode,
                weight: chargeableWeight,
                cod: paymentMethod==="COD",
                token,
            });

            const selectedCourier=selectCourier({
                couriers,
                strategy: "CHEAPEST",
            });

            // Free delivery threshold: ₹699 in rupees
            const FREE_DELIVERY_THRESHOLD=699;
            // Shipping rate from Shiprocket is in rupees
            const shippingFee=itemTotal>=FREE_DELIVERY_THRESHOLD? 0:Math.ceil(selectedCourier.rate);
            const totalAmount=itemTotal+shippingFee;

            /* ──────────────────────────────
               5️⃣ Create order (amounts in RUPEES)
            ────────────────────────────── */
            const order=await tx.order.create({
                data: {
                    orderNumber,
                    userId,
                    addressId,
                    paymentMethod,

                    totalAmount, // in rupees
                    currency: "INR",
                    actualWeight: totalActualWeight,
                    volumetricWeight: totalVolumetricWeight,
                    chargeableWeight: chargeableWeight,

                    selectedCourierId: selectedCourier.courier_company_id,
                    selectedCourierName: selectedCourier.courier_name,
                    deliveryFee: shippingFee, // in rupees
                    codAmount: paymentMethod==="COD"? totalAmount:null, // in rupees

                    items: {
                        create: cartItems.map((item) => ({
                            productId: item.productId,
                            productName: item.product.name,
                            sku: item.product.sku,
                            quantity: item.quantity,
                            price: item.priceAtAdd, // in rupees
                            totalPrice: item.quantity*item.priceAtAdd, // in rupees
                        })),
                    },

                    statusHistory: {
                        create: {status: "PENDING"},
                    },
                },
            });

            /* ──────────────────────────────
               6️⃣ Reduce stock
            ────────────────────────────── */
            for (const item of cartItems)
            {
                await tx.product.update({
                    where: {id: item.productId},
                    data: {
                        stockQuantity: {
                            decrement: item.quantity,
                        },
                    },
                });
            }

            /* ──────────────────────────────
               7️⃣ Clear cart
            ────────────────────────────── */
            await tx.cartItem.deleteMany({
                where: {cartId: cart.id},
            });

            return order;
        });

        return res.status(201).json({
            message: "Order created successfully",
            order: result,
        });

    } catch (error)
    {
        console.error("Error creating order:", error);

        return res.status(error.status||500).json({
            message: error.message||"Internal server error",
        });
    }
}



async function createOrderForProduct(req, res)
{
    try
    {
        const userId=req.user.userId||req.user.id;
        const {productId, quantity, paymentMethod, addressId}=req.body;

        if (!addressId)
        {
            return res.status(400).json({message: "addressId is required"});
        }

        const validMethods=["PREPAID", "COD"];
        if (!validMethods.includes(paymentMethod))
        {
            return res.status(400).json({message: "Invalid payment method"});
        }

        /* ──────────────────────────────
           1️⃣ Fetch product
        ────────────────────────────── */
        const product=await prisma.product.findUnique({
            where: {id: productId},
        });

        if (!product)
        {
            return res.status(404).json({message: "Product not found"});
        }
        console.log(product);
        if (
            !product.weight||
            !product.length||
            !product.breadth||
            !product.height
        )
        {
            return res.status(400).json({
                message: "Product shipping dimensions not set",
            });
        }

        /* ──────────────────────────────
           2️⃣ Quantity validation
        ────────────────────────────── */
        const qty=parseInt(quantity);

        if (isNaN(qty)||qty<=0)
        {
            return res.status(400).json({message: "Invalid quantity"});
        }

        if (qty>product.stockQuantity)
        {
            return res.status(409).json({
                message: "Insufficient stock",
            });
        }

        /* ──────────────────────────────
           3️⃣ Address validation
        ────────────────────────────── */
        const address=await prisma.address.findFirst({
            where: {id: addressId, userId},
        });

        if (!address)
        {
            return res.status(400).json({message: "Invalid address"});
        }

        /* ──────────────────────────────
           4️⃣ Price + weight calculation
           Note: Product prices are in RUPEES
        ────────────────────────────── */
        // Use discountPrice if available, otherwise use regular price
        const unitPrice=product.discountPrice||product.price;
        const itemTotal=unitPrice*qty; // in rupees

        const actualWeight=product.weight*qty;

        const volumetricWeight=
            (product.length*product.breadth*product.height*qty)/5000;

        const chargeableWeight=Math.max(actualWeight, volumetricWeight);

        /* ──────────────────────────────
           5️⃣ Shipping calculation
        ────────────────────────────── */
        const token=await generateToken();

        const couriers=await getCourierOptions({
            pickupPincode: "452001", // warehouse
            deliveryPincode: address.postalCode,
            weight: chargeableWeight,
            cod: paymentMethod==="COD",
            token,
        });

        const selectedCourier=selectCourier({
            couriers,
            strategy: "CHEAPEST",
        });

        // Free delivery threshold: ₹699 in rupees
        const FREE_DELIVERY_THRESHOLD=699;
        // Shipping rate from Shiprocket is in rupees
        const shippingFee=itemTotal>=FREE_DELIVERY_THRESHOLD? 0:Math.ceil(selectedCourier.rate);
        const totalAmount=itemTotal+shippingFee; // in rupees

        /* ──────────────────────────────
           6️⃣ Create order
        ────────────────────────────── */
        const orderNumber=`ORD-${nanoid(8).toUpperCase()}`;

        const order=await prisma.$transaction(async (tx) =>
        {
            const createdOrder=await tx.order.create({
                data: {
                    orderNumber,
                    userId,
                    addressId,
                    paymentMethod,
                    deliveryFee: shippingFee, // in rupees
                    actualWeight,
                    volumetricWeight,
                    chargeableWeight,

                    totalAmount, // in rupees
                    currency: "INR",

                    selectedCourierId: selectedCourier.courier_company_id,
                    selectedCourierName: selectedCourier.courier_name,

                    codAmount: paymentMethod==="COD"? totalAmount:null, // in rupees

                    items: {
                        create: {
                            productId,
                            productName: product.name,
                            sku: product.sku,
                            quantity: qty,
                            price: unitPrice, // in rupees (discountPrice or price)
                            totalPrice: itemTotal, // in rupees
                        },
                    },

                    statusHistory: {
                        create: {status: "PENDING"},
                    },
                },
            });

            await tx.product.update({
                where: {id: productId},
                data: {
                    stockQuantity: {
                        decrement: qty,
                    },
                },
            });

            return createdOrder;
        });



        return res.status(201).json({
            message: "Order created successfully",
            order,
        });

    } catch (error)
    {
        console.error("Error creating order for product:", error);

        return res.status(500).json({
            message: error.message||"Internal server error",
        });
    }
}


async function getOrderById(req, res)
{
    try
    {
        const userId=req.user.userId||req.user.id;
        const role=req.user.role;
        const {orderId}=req.params;

        // Build where clause - admin can see all orders
        const whereClause=role==="ADMIN"
            ? {id: orderId}
            :{id: orderId, userId: userId};

        const order=await prisma.order.findFirst({
            where: whereClause,
            include: {
                items: {
                    include: {
                        product: {
                            select: {
                                breadth: true,

                                categoryId: true,
                                createdAt: true,
                                weight: true,
                                length: true,
                                price: true,
                                discountPrice: true,
                                id: true,
                                isActive: true,
                                name: true,
                                sku: true,
                                slug: true,
                                stockQuantity: true,
                                updatedAt: true,
                                height: true,
                                isTrending: true,
                                description: true,
                                currency: true,
                                soldCount: true,
                                images: {
                                    select: {imageUrl: true},
                                    take: 1,
                                },
                            },



                        },

                    },
                },
                address: true,
                statusHistory: true,
                payment: true,
                shipment: true,
                user: role==="ADMIN"? {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phoneNumber: true
                    }
                }:false,
            },
        });

        if (!order)
        {
            return res.status(404).json({
                message: "Order not found",
            });
        }

        return res.status(200).json(order);

    } catch (error)
    {
        console.error("Error fetching order by ID:", error);
        return res.status(500).json({
            message: "Internal server error",
        });
    }
}

async function getAllOrdersByCategory(req, res)
{
    try
    {
        const role=req.user.role;
        const userId=req.user.userId||req.user.id;
        const {categoryId}=req.params;

        // 🔐 ADMIN → see ALL orders
        if (role==="ADMIN")
        {
            const orders=await prisma.order.findMany({
                where: {
                    items: {
                        some: {
                            product: {
                                categoryId: categoryId,
                            },
                        },
                    },
                },
                include: {
                    items: {
                        include: {
                            product: {
                                select: {
                                    breadth: true,

                                    categoryId: true,
                                    createdAt: true,
                                    weight: true,
                                    length: true,
                                    price: true,
                                    discountPrice: true,
                                    id: true,
                                    isActive: true,
                                    name: true,
                                    sku: true,
                                    slug: true,
                                    stockQuantity: true,
                                    updatedAt: true,
                                    height: true,
                                    isTrending: true,
                                    description: true,
                                    currency: true,
                                    soldCount: true,
                                    images: {
                                        select: {imageUrl: true},
                                        take: 1,
                                    },
                                },
                            },

                        },
                    },
                    user: true,
                    address: true,
                },
            });

            return res.status(200).json(orders);
        }

        // 👤 USER → see only own orders
        const orders=await prisma.order.findMany({
            where: {
                userId: userId,
                items: {
                    some: {
                        product: {
                            categoryId: categoryId,
                        },
                    },
                },
            },
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
                address: true,
            },
        });

        return res.status(200).json(orders);

    } catch (error)
    {
        console.error("Error fetching orders by category:", error);
        return res.status(500).json({
            message: "Internal server error",
        });
    }
}

async function getAllOrders(req, res)
{
    try
    {
        const role=req.user.role;
        const userId=req.user.userId||req.user.id;

        // 🔐 ADMIN → fetch all orders
        const whereCondition=
            role==="ADMIN"
                ? {}
                :{userId};

        const orders=await prisma.order.findMany({
            where: whereCondition,
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phoneNumber: true,
                    },
                },
                items: {
                    include: {
                        product: {
                            select: {
                                breadth: true,

                                categoryId: true,
                                createdAt: true,
                                weight: true,
                                length: true,
                                price: true,
                                discountPrice: true,
                                id: true,
                                isActive: true,
                                name: true,
                                sku: true,
                                slug: true,
                                stockQuantity: true,
                                updatedAt: true,
                                height: true,
                                isTrending: true,
                                description: true,
                                currency: true,
                                soldCount: true,
                                images: {
                                    select: {imageUrl: true},
                                    take: 1,
                                },
                            },
                        },

                    },
                },
                address: true,
                statusHistory: true,
                payment: true,
                shipment: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return res.status(200).json(orders);

    } catch (error)
    {
        console.error("Error fetching all orders:", error);
        return res.status(500).json({
            message: "Internal server error",
        });
    }
}

async function getOrderByStatus(req, res)
{
    try
    {

        const userId=req.user.userId;
        const role=req.user.role;
        const {status}=req.params;
        if (!["PENDING", "SHIPPED", "DELIVERED", "CANCELLED", "PAID", "FAILED"].includes(status))
        {
            return res.status(400).json({message: "Invalid status value"});
        }
        if (role==='ADMIN'||role==='admin')
        {
            let orders=await prisma.order.findMany({
                where: {status: status},
                include: {items: {include: {product: true}}}
            });
            return res.status(200).json(orders);

        }
        let orders=await prisma.order.findMany({
            where: {status: status, userId: userId},
            include: {
                items: {
                    include: {
                        product: {
                            select: {
                                breadth: true,

                                categoryId: true,
                                createdAt: true,
                                weight: true,
                                length: true,
                                price: true,
                                discountPrice: true,
                                id: true,
                                isActive: true,
                                name: true,
                                sku: true,
                                slug: true,
                                stockQuantity: true,
                                updatedAt: true,
                                height: true,
                                isTrending: true,
                                description: true,
                                currency: true,
                                soldCount: true,
                                images: {
                                    select: {imageUrl: true},
                                    take: 1,
                                },
                            },
                        },

                    },
                }
            }
        });
        return res.status(200).json(orders);
    }
    catch (error)
    {
        console.error("Error fetching orders by status:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
async function updateOrderStatus(req, res)
{
    try
    {

        const {orderId}=req.params;
        const {status}=req.body;
        const validStatuses=["PENDING", "PAID", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED", "FAILED"];
        if (!validStatuses.includes(status))
            return res.status(400).json({message: "Invalid status value"});
        const orderStatus=await prisma.order.findFirst({
            where: {id: (orderId)},
            select: {
                status: true
            }
        });
        if (!orderStatus)
        {
            return res.status(404).json({message: "Order not found"});
        }
        if (orderStatus.status===status)
        {
            return res.status(400).json({message: `Order is already in ${status} status`});
        }
        if (orderStatus.status==="DELIVERED"||orderStatus.status==="CANCELLED"||orderStatus.status==="REFUNDED")
        {
            return res.status(400).json({message: `Cannot update order with status ${orderStatus.status}`});
        }
        const orderUpdate=await prisma.order.update({
            where: {id: (orderId)},
            data: {status: status}
        });
        return res.status(200).json({
            message: "Order status updated successfully",
            orderUpdate
        });
    }
    catch (error)
    {
        console.error("Error updating order status:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
async function cancelOrder(req, res)
{
    try
    {
        const {orderId}=req.params;

        const order=await prisma.order.findUnique({
            where: {id: orderId},
        });
        if (!order)
        {
            return res.status(404).json({message: "Order not found"});
        }
        if (order.status==="CANCELLED")
        {
            return res.status(400).json({message: "Order is already cancelled"});
        }
        if (order.status==="SHIPPED"||order.status==="DELIVERED"||order.status==="FAILED")
        {
            return res.status(400).json({message: `Cannot cancel order with status ${order.status}`});
        }
        const cancelledOrder=await prisma.order.update({
            where: {id: orderId},
            data: {status: "CANCELLED"}
        });
        await publishToQueue('ORDER_NOTIFICATION.ORDER_CANCELLED', {
            orderId: cancelledOrder.id,
            userId: cancelledOrder.userId,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName

        });
        return res.status(200).json({
            message: "Order cancelled successfully",
            cancelledOrder
        });
    }
    catch (error)
    {
        await publishToQueue('ORDER_NOTIFICATION.ORDER_CANCELLATION_FAILED', {
            orderId: req.params.orderId,
            userId: req.user.userId||req.user.id,
            error: error.message,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName
        }
        )
        console.error("Error cancelling order:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
export
{
    createOrderForAllCartProducts,
    createOrderForProduct,
    getOrderById,
    getAllOrdersByCategory,
    getAllOrders,
    getOrderByStatus,
    updateOrderStatus,
    cancelOrder
}