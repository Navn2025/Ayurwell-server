import prisma from "../db/db.js";

export async function calculatePackageDimensions(order)
{
    const items=await prisma.orderItem.findMany({
        where: {orderId: order.id},
        include: {
            product: true, // 🔥 REQUIRED
        },
    });

    let length=0;
    let breadth=0;
    let height=0;

    for (const item of items)
    {
        length=Math.max(length, item.product.length);
        breadth=Math.max(breadth, item.product.breadth);
        height+=item.product.height*item.quantity;
    }
    console.log(length);

    return {length, breadth, height};
}
