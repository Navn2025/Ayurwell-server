import prisma from "../db/db.js";


async function addToCartController(req, res)
{
    try
    {
        const userId=req.user.userId;
        const {productId, quantity}=req.body;

        // 🔐 Validation
        if (!productId||!quantity||quantity<1)
        {
            return res.status(400).json({
                message: "Product ID and valid quantity are required"
            });
        }

        // 🔥 TRANSACTION (IMPORTANT)
        const result=await prisma.$transaction(async (tx) =>
        {

            // 1️⃣ Get cart
            const cart=await tx.cart.findUnique({
                where: {userId}
            });

            if (!cart)
            {
                throw new Error("Cart not found for user");
            }

            // 2️⃣ Get product
            const product=await tx.product.findUnique({
                where: {id: productId}
            });

            if (!product)
            {
                throw new Error("Product not found");
            }
            if (quantity>product.stockQuantity)
            {
                throw new Error("Requested quantity exceeds available stock");
            }
            const cartItemExisting=await tx.cartItem.findUnique({
                where: {
                    cartId_productId: {
                        cartId: cart.id,
                        productId
                    }
                }
            });
            if (cartItemExisting)
            {
                if (cartItemExisting.quantity+quantity>product.stockQuantity)
                {
                    throw new Error("Requested quantity exceeds available stock");
                }
            }

            // 3️⃣ Add or update cart item
            const cartItem=await tx.cartItem.upsert({
                where: {
                    cartId_productId: {
                        cartId: cart.id,
                        productId
                    }
                },
                update: {
                    quantity: {
                        increment: quantity
                    }
                },
                create: {
                    cartId: cart.id,
                    productId,
                    quantity,
                    priceAtAdd: product.discountPrice||product.price
                }
            });

            // 4️⃣ Log activity
            await tx.cartActivity.create({
                data: {
                    userId,
                    cartId: cart.id,
                    productId,
                    phoneNumber: req.user.phoneNumber||"",
                    city: req.user.city||null,
                    action: "ADD_TO_CART"
                }
            });

            return cartItem;
        });

        return res.status(200).json({
            message: "Product added to cart successfully",
            cartItem: result
        });

    } catch (error)
    {
        console.error("Add to cart error:", error.message);

        return res.status(500).json({
            message: error.message||"Failed to add product to cart"
        });
    }
}
async function getUsersCartController(req, res)
{
    const userId=req.user.userId;

    try
    {
        const cart=await prisma.cart.findUnique({
            where: {userId},
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                images: true
                            }
                        }
                    }
                }
            }
        });

        if (!cart)
        {
            return res.status(404).json({message: "Cart not found"});
        }

        return res.status(200).json(cart);

    } catch (error)
    {
        console.error("Error fetching user's cart:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
async function updateCartItemController(req, res)
{
    const userId=req.user.userId;
    const {cartItemId, productId, quantity}=req.body;
    try
    {
        const result=await prisma.$transaction(async (tx) =>
        {
            // Get cart first
            const cart=await tx.cart.findUnique({
                where: {userId}
            });

            if (!cart)
            {
                throw new Error("Cart not found");
            }

            // Find cart item by cartItemId or by productId
            let cartItem;
            if (cartItemId)
            {
                cartItem=await tx.cartItem.findUnique({
                    where: {id: cartItemId},
                    include: {cart: true}
                });
            } else if (productId)
            {
                cartItem=await tx.cartItem.findUnique({
                    where: {
                        cartId_productId: {
                            cartId: cart.id,
                            productId
                        }
                    },
                    include: {cart: true}
                });
            }

            if (!cartItem||cartItem.cart.userId!==userId)
            {
                throw new Error("Cart item not found or access denied");
            }
            if (quantity<1)
            {
                throw new Error("Invalid quantity");
            }
            const product=await tx.product.findUnique({
                where: {id: cartItem.productId}
            });
            if (!product)
            {
                throw new Error("Product not found");
            }
            if (quantity>product.stockQuantity)
            {
                throw new Error("Requested quantity exceeds available stock");
            }

            // 2️⃣ Update quantity
            const updatedCartItem=await tx.cartItem.update({
                where: {id: cartItem.id},
                data: {quantity, priceAtAdd: product.discountPrice||product.price}
            });


            await tx.cartActivity.create({
                data: {
                    userId,
                    cartId: cartItem.cartId,
                    productId: cartItem.productId,
                    phoneNumber: req.user.phoneNumber||"",
                    city: req.user.city||null,
                    action: "UPDATE_QUANTITY"
                }
            });

            return updatedCartItem;
        });

        return res.status(200).json({
            message: "Cart item updated successfully",
            cartItem: result
        });

    } catch (error)
    {
        console.error("Update cart item error:", error.message);

        return res.status(500).json({
            message: error.message||"Failed to update cart item"
        });
    }
}
async function deleteProductFromCart(req, res)
{
    const userId=req.user.userId;
    const {cartItemId, productId}=req.body;
    try
    {
        const result=await prisma.$transaction(async (tx) =>
        {
            // Get cart first
            const cart=await tx.cart.findUnique({
                where: {userId}
            });

            if (!cart)
            {
                throw new Error("Cart not found");
            }

            // Find cart item by cartItemId or by productId
            let cartItem;
            if (cartItemId)
            {
                cartItem=await tx.cartItem.findUnique({
                    where: {id: cartItemId},
                    include: {cart: true}
                });
            } else if (productId)
            {
                cartItem=await tx.cartItem.findUnique({
                    where: {
                        cartId_productId: {
                            cartId: cart.id,
                            productId
                        }
                    },
                    include: {cart: true}
                });
            }

            if (!cartItem||cartItem.cart.userId!==userId)
            {
                throw new Error("Cart item not found or access denied");
            }
            // 2️⃣ Delete cart item
            const deletedCartItem=await tx.cartItem.delete({
                where: {id: cartItem.id}
            });
            await tx.cartActivity.create({
                data: {
                    userId,
                    cartId: cartItem.cartId,
                    productId: cartItem.productId,
                    phoneNumber: req.user.phoneNumber||"",
                    city: req.user.city||null,
                    action: "REMOVE_FROM_CART"
                }
            });
            return deletedCartItem;
        });
        return res.status(200).json({
            message: "Cart item deleted successfully",
            cartItem: result
        });
    } catch (error)
    {
        console.error("Delete cart item error:", error.message);
        return res.status(500).json({
            message: error.message||"Failed to delete cart item"
        });
    }



}
async function clearCartController(req, res)
{
    const userId=req.user.userId;

    try
    {
        const cart=await prisma.cart.findFirst({
            where: {userId}
        });
        if (!cart)
        {
            return res.status(404).json({message: "Cart not found"});
        }
        await prisma.cartItem.deleteMany({
            where: {cartId: cart.id}
        });
        return res.status(200).json({message: "Cart cleared successfully"});
    } catch (error)
    {
        console.error("Error clearing cart:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
export
{
    addToCartController,
    getUsersCartController,
    updateCartItemController,
    deleteProductFromCart,
    clearCartController
};