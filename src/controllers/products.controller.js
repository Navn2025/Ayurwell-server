import prisma from "../db/db.js";

async function createProduct(req, res)
{
    // Implementation for creating a product
    try
    {
        const {name, slug, description, price, categoryId, concernId, discountPrice, currency, stockQuantity, sku, weight, length, breadth, height, isTrending}=req.body;


        const existingProduct=await prisma.product.findFirst({
            where: {
                OR: [
                    {slug},
                    {sku}
                ]
            }
        });

        if (existingProduct)
        {
            return res.status(409).json({message: "Product already exists"});
        }
        const newProduct=await prisma.product.create({
            data: {
                name,
                slug,
                description,
                price,
                categoryId,
                concernId: concernId||null,
                discountPrice,
                currency,
                stockQuantity,
                sku,
                weight,
                length,
                breadth,
                height,
                isTrending: isTrending||false
            },
            include: {
                category: true,
                concern: true
            }
        });
        return res.status(201).json(newProduct);

    }
    catch (error)
    {
        console.error("Error creating product:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
async function getProducts(req, res)
{
    try
    {
        const products=await prisma.product.findMany({
            include: {
                category: true,
                concern: true,
                images: true,
                faqs: {orderBy: {position: 'asc'}},
                directions: {orderBy: {stepNumber: 'asc'}},
                reviews: {
                    include: {user: {select: {firstName: true, lastName: true}}},

                    orderBy: {createdAt: 'desc'}
                }
            }
        });
        return res.status(200).json(products);
    }
    catch (error)
    {
        console.error("Error fetching products:", error);
        return res.status(500).json({message: "Internal server error"});
    }

}

async function getTrendingProducts(req, res)
{
    try
    {
        const products=await prisma.product.findMany({
            where: {isTrending: true, isActive: true},
            include: {
                category: true,
                concern: true,
                images: true
            },
            take: 12
        });
        return res.status(200).json(products);
    }
    catch (error)
    {
        console.error("Error fetching trending products:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function getBestSellingProducts(req, res)
{
    try
    {
        let products=await prisma.product.findMany({
            where: {isActive: true, soldCount: {gt: 0}},
            include: {
                category: true,
                concern: true,
                images: true
            },
            orderBy: {soldCount: 'desc'},
            take: 4
        });

        // If no best sellers, return random products
        if (products.length===0)
        {
            const allProducts=await prisma.product.findMany({
                where: {isActive: true},
                include: {
                    category: true,
                    concern: true,
                    images: true
                }
            });
            // Shuffle and take 12 random products
            products=allProducts.sort(() => Math.random()-0.5).slice(0, 4);
        }

        return res.status(200).json(products);
    }
    catch (error)
    {
        console.error("Error fetching best selling products:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function getProductsByCategory(req, res)
{
    try
    {
        const {categoryId}=req.params;
        const products=await prisma.product.findMany({
            where: {categoryId: (categoryId)},
            include: {
                category: true,
                concern: true,
                images: true,
                faqs: {orderBy: {position: 'asc'}},
                directions: {orderBy: {stepNumber: 'asc'}},
                reviews: {
                    include: {user: {select: {firstName: true, lastName: true}}},

                    orderBy: {createdAt: 'desc'}
                }
            }
        });
        return res.status(200).json(products);
    }
    catch (error)
    {
        console.error("Error fetching products by category:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function getProductsByCategorySlug(req, res)
{
    try
    {
        const {slug}=req.params;
        const {limit, page=1}=req.query;

        const category=await prisma.category.findUnique({
            where: {slug}
        });

        if (!category)
        {
            return res.status(404).json({message: "Category not found"});
        }

        // If limit is provided without page, return limited products (for home page sections)
        if (limit&&!req.query.page)
        {
            const products=await prisma.product.findMany({
                where: {categoryId: category.id, isActive: true},
                include: {
                    category: true,
                    concern: true,
                    images: true
                },
                take: parseInt(limit)
            });
            return res.status(200).json(products);
        }

        // Paginated response
        const pageLimit=limit? parseInt(limit):16;
        const skip=(parseInt(page)-1)*pageLimit;

        const [products, totalCount]=await Promise.all([
            prisma.product.findMany({
                where: {categoryId: category.id, isActive: true},
                include: {
                    category: true,
                    concern: true,
                    images: true
                },
                skip,
                take: pageLimit,
                orderBy: {createdAt: 'desc'}
            }),
            prisma.product.count({
                where: {categoryId: category.id, isActive: true}
            })
        ]);

        const totalPages=Math.ceil(totalCount/pageLimit);

        return res.status(200).json({
            category,
            products,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage: parseInt(page)<totalPages,
                hasPrevPage: parseInt(page)>1
            }
        });
    }
    catch (error)
    {
        console.error("Error fetching products by category slug:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function getProductsByConcern(req, res)
{
    try
    {
        const {concernId}=req.params;
        const products=await prisma.product.findMany({
            where: {concernId: concernId},
            include: {
                category: true,
                concern: true,
                images: true,
                faqs: {orderBy: {position: 'asc'}},
                directions: {orderBy: {stepNumber: 'asc'}},
                reviews: {
                    include: {user: {select: {firstName: true, lastName: true}}},

                    orderBy: {createdAt: 'desc'}
                }
            }
        });
        return res.status(200).json(products);
    }
    catch (error)
    {
        console.error("Error fetching products by concern:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function getProductsByConcernSlug(req, res)
{
    try
    {
        const {slug}=req.params;
        const {page=1, limit=16}=req.query;

        const concern=await prisma.concern.findUnique({
            where: {slug}
        });

        if (!concern)
        {
            return res.status(404).json({message: "Concern not found"});
        }

        const skip=(parseInt(page)-1)*parseInt(limit);

        const [products, totalCount]=await Promise.all([
            prisma.product.findMany({
                where: {concernId: concern.id, isActive: true},
                include: {
                    category: true,
                    concern: true,
                    images: true
                },
                skip,
                take: parseInt(limit),
                orderBy: {createdAt: 'desc'}
            }),
            prisma.product.count({
                where: {concernId: concern.id, isActive: true}
            })
        ]);

        const totalPages=Math.ceil(totalCount/parseInt(limit));

        return res.status(200).json({
            concern,
            products,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalCount,
                hasNextPage: parseInt(page)<totalPages,
                hasPrevPage: parseInt(page)>1
            }
        });
    }
    catch (error)
    {
        console.error("Error fetching products by concern slug:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
async function getProductById(req, res)
{
    try
    {
        const {productId}=req.params;
        const product=await prisma.product.findFirst({
            where: {id: productId},
            include: {
                category: true,
                concern: true,
                images: true,
                faqs: {orderBy: {position: 'asc'}},
                directions: {orderBy: {stepNumber: 'asc'}},
                reviews: {
                    include: {user: {select: {firstName: true, lastName: true}}},
                    orderBy: {createdAt: 'desc'}
                }
            }
        });
        return res.status(200).json(product);
    }
    catch (error)
    {
        console.error("Error fetching product by ID:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function getProductBySlug(req, res)
{
    try
    {
        const {slug}=req.params;
        const product=await prisma.product.findFirst({
            where: {slug, isActive: true},
            include: {
                category: true,
                concern: true,
                images: true,
                faqs: {orderBy: {position: 'asc'}},
                directions: {orderBy: {stepNumber: 'asc'}},
                reviews: {
                    include: {user: {select: {firstName: true, lastName: true}}},
                    orderBy: {createdAt: 'desc'},
                    take: 10
                }
            }
        });

        if (!product)
        {
            return res.status(404).json({message: "Product not found"});
        }

        // Calculate average rating
        const avgRating=product.reviews.length>0
            ? product.reviews.reduce((sum, r) => sum+r.rating, 0)/product.reviews.length
            :0;

        return res.status(200).json({...product, avgRating});
    }
    catch (error)
    {
        console.error("Error fetching product by slug:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function updateProduct(req, res)
{
    const {productId}=req.params;
    const {
        name, slug, description, price, categoryId, concernId,
        discountPrice, currency, stockQuantity, sku,
        weight, length, breadth, height, isTrending, isActive
    }=req.body;

    try
    {
        const isProductExist=await prisma.product.findUnique({
            where: {id: productId}
        });

        if (!isProductExist)
        {
            return res.status(404).json({message: "Product not found"});
        }

        // Check slug or sku conflict with other products
        console.log(isProductExist);
        if (slug||sku)
        {
            const conflict=await prisma.product.findFirst({
                where: {
                    OR: [
                        slug? {slug}:undefined,
                        sku? {sku}:undefined
                    ].filter(Boolean),
                    NOT: {id: productId}
                }
            });
            console.log(conflict);

            if (conflict)
            {
                return res.status(409).json({
                    message: "Slug or SKU already exists for another product"
                });
            }
        }

        const updatedProduct=await prisma.product.update({
            where: {id: productId},
            data: {
                name,
                slug,
                description,
                price,
                categoryId,
                concernId: concernId||null,
                discountPrice,
                currency,
                stockQuantity,
                sku,
                weight,
                length,
                breadth,
                height,
                isTrending: isTrending!==undefined? isTrending:isProductExist.isTrending,
                isActive: isActive!==undefined? isActive:isProductExist.isActive
            },
            include: {
                category: true,
                concern: true
            }
        });

        return res.status(200).json(updatedProduct);

    } catch (error)
    {
        console.error("Error updating product:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function deleteProduct(req, res)
{
    const {productId}=req.params;

    try
    {
        const product=await prisma.product.findFirst({
            where: {id: productId},
            include: {
                orderItems: true // Check if product has been ordered
            }
        });

        if (!product)
        {
            return res.status(404).json({message: "Product not found"});
        }

        // If product has been ordered, don't delete - deactivate instead
        if (product.orderItems&&product.orderItems.length>0)
        {
            await prisma.product.update({
                where: {id: productId},
                data: {isActive: false}
            });
            return res.status(200).json({
                message: "Product has orders and cannot be deleted. It has been deactivated instead.",
                deactivated: true
            });
        }

        // Delete in transaction - remove related records first
        await prisma.$transaction(async (tx) =>
        {
            // Delete cart activities for this product
            await tx.cartActivity.deleteMany({
                where: {productId}
            });

            // Delete cart items for this product
            await tx.cartItem.deleteMany({
                where: {productId}
            });

            // Delete the product (images, FAQs, directions, reviews will cascade)
            await tx.product.delete({
                where: {id: productId}
            });
        });

        return res.status(200).json({message: "Product deleted successfully"});
    }
    catch (error)
    {
        console.error("Error deleting product:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

// ==================
// FAQ Controllers
// ==================

async function getProductFAQs(req, res)
{
    try
    {
        const {productId}=req.params;
        const faqs=await prisma.productFAQ.findMany({
            where: {productId},
            orderBy: {position: 'asc'}
        });
        return res.status(200).json(faqs);
    }
    catch (error)
    {
        console.error("Error fetching FAQs:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function addProductFAQ(req, res)
{
    try
    {
        const {productId}=req.params;
        const {question, answer, position}=req.body;

        const product=await prisma.product.findUnique({where: {id: productId}});
        if (!product)
        {
            return res.status(404).json({message: "Product not found"});
        }

        const faq=await prisma.productFAQ.create({
            data: {
                productId,
                question,
                answer,
                position: position||0
            }
        });
        return res.status(201).json(faq);
    }
    catch (error)
    {
        console.error("Error adding FAQ:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function updateProductFAQ(req, res)
{
    try
    {
        const {faqId}=req.params;
        const {question, answer, position}=req.body;

        const faq=await prisma.productFAQ.update({
            where: {id: faqId},
            data: {question, answer, position}
        });
        return res.status(200).json(faq);
    }
    catch (error)
    {
        console.error("Error updating FAQ:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function deleteProductFAQ(req, res)
{
    try
    {
        const {faqId}=req.params;
        await prisma.productFAQ.delete({where: {id: faqId}});
        return res.status(200).json({message: "FAQ deleted successfully"});
    }
    catch (error)
    {
        console.error("Error deleting FAQ:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

// ==================
// Directions Controllers (How to Use)
// ==================

async function getProductDirections(req, res)
{
    try
    {
        const {productId}=req.params;
        const directions=await prisma.productDirection.findMany({
            where: {productId},
            orderBy: {stepNumber: 'asc'}
        });
        return res.status(200).json(directions);
    }
    catch (error)
    {
        console.error("Error fetching directions:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function addProductDirection(req, res)
{
    try
    {
        const {productId}=req.params;
        const {stepNumber, title, instruction}=req.body;

        const product=await prisma.product.findUnique({where: {id: productId}});
        if (!product)
        {
            return res.status(404).json({message: "Product not found"});
        }

        const direction=await prisma.productDirection.create({
            data: {
                productId,
                stepNumber,
                title: title||null,
                instruction
            }
        });
        return res.status(201).json(direction);
    }
    catch (error)
    {
        console.error("Error adding direction:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function updateProductDirection(req, res)
{
    try
    {
        const {directionId}=req.params;
        const {stepNumber, title, instruction}=req.body;

        const direction=await prisma.productDirection.update({
            where: {id: directionId},
            data: {stepNumber, title, instruction}
        });
        return res.status(200).json(direction);
    }
    catch (error)
    {
        console.error("Error updating direction:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function deleteProductDirection(req, res)
{
    try
    {
        const {directionId}=req.params;
        await prisma.productDirection.delete({where: {id: directionId}});
        return res.status(200).json({message: "Direction deleted successfully"});
    }
    catch (error)
    {
        console.error("Error deleting direction:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

// Toggle Trending Status
async function toggleTrending(req, res)
{
    try
    {
        const {productId}=req.params;
        const product=await prisma.product.findUnique({where: {id: productId}});

        if (!product)
        {
            return res.status(404).json({message: "Product not found"});
        }

        const updatedProduct=await prisma.product.update({
            where: {id: productId},
            data: {isTrending: !product.isTrending}
        });
        return res.status(200).json(updatedProduct);
    }
    catch (error)
    {
        console.error("Error toggling trending:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

export default {
    createProduct,
    getProducts,
    getTrendingProducts,
    getBestSellingProducts,
    getProductById,
    getProductBySlug,
    updateProduct,
    deleteProduct,
    getProductsByCategory,
    getProductsByCategorySlug,
    getProductsByConcern,
    getProductsByConcernSlug,
    getProductFAQs,
    addProductFAQ,
    updateProductFAQ,
    deleteProductFAQ,
    getProductDirections,
    addProductDirection,
    updateProductDirection,
    deleteProductDirection,
    toggleTrending
};