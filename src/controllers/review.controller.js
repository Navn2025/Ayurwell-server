import prisma from "../db/db.js";

export async function addReview(req, res)
{
    try
    {
        const {productId, rating, comment}=req.body;
        const userId=req.user.userId;
        const existingOrder=await prisma.order.findFirst({
            where: {
                userId,
                items: {
                    some: {
                        productId
                    }
                },
                status: "DELIVERED"
            }
        });
        if (!existingOrder)
        {
            return res.status(400).json({
                message: "You can only review products you have purchased and received."
            });
        }
        if (rating<1||rating>5)
        {
            return res.status(400).json({
                message: "Rating must be between 1 and 5."
            });
        }
        const existingReview=await prisma.review.findFirst({
            where: {
                productId,
                userId
            }
        });
        if (existingReview)
        {
            return res.status(400).json({
                message: "You have already reviewed this product."
            });
        }
        const newReview=await prisma.review.create({
            data: {
                productId,
                userId,
                rating,
                comment
            }
        });
        res.status(201).json({
            message: "Review added successfully",
            review: newReview
        });
    }
    catch (error)
    {
        if (error.code==='P2002'&&error.meta?.modelName==='Review')
        {
            // Unique constraint failed on userId+productId
            return res.status(400).json({
                message: "You have already reviewed this product."
            });
        }
        console.error("Error adding review:", error);
        res.status(500).json({
            message: "Failed to add review",
            error: error.message
        });
    }
}
export async function getProductReviews(req, res)
{
    try
    {
        const {productId}=req.params;
        const reviews=await prisma.review.findMany({
            where: {
                productId: (productId)
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        res.status(200).json({
            reviews
        });


    }
    catch (error)
    {
        console.error("Error fetching product reviews:", error);
        res.status(500).json({
            message: "Failed to fetch product reviews",
            error: error.message
        });
    }
}
export async function getAverageRating(req, res)
{
    try
    {
        const {productId}=req.params;
        const result=await prisma.review.aggregate({
            where: {
                productId: (productId)
            },
            _avg: {
                rating: true
            },
            _count: {
                rating: true
            }
        });
        const averageRating=result._avg.rating||0;
        const reviewCount=result._count.rating||0;
        res.status(200).json({
            averageRating,
            reviewCount
        });
    }
    catch (error)
    {
        console.error("Error fetching average rating:", error);
        res.status(500).json({
            message: "Failed to fetch average rating",
            error: error.message
        });
    }
}
export async function getUserReviewForProduct(req, res)
{
    try
    {
        const {productId}=req.params;
        const userId=req.user.userId;
        const review=await prisma.review.findFirst({
            where: {
                productId: (productId),
                userId
            }
        });
        res.status(200).json({
            review
        });
    }
    catch (error)
    {
        console.error("Error fetching user review for product:", error);
        res.status(500).json({
            message: "Failed to fetch user review for product",
            error: error.message
        });
    }
}
export async function deleteReview(req, res)
{
    try
    {
        const {reviewId}=req.params;
        const userId=req.user.userId;
        const review=await prisma.review.findUnique({
            where: {
                id: reviewId
            }
        });
        if (!review)
        {
            return res.status(404).json({
                message: "Review not found"
            });
        }
        if (review.userId!==userId&&req.user.role!=='ADMIN')
        {
            return res.status(403).json({
                message: "You are not authorized to delete this review"
            });
        }
        await prisma.review.delete({
            where: {
                id: reviewId
            }
        });
        res.status(200).json({
            message: "Review deleted successfully"
        });
    }
    catch (error)
    {
        console.error("Error deleting review:", error);
        res.status(500).json({
            message: "Failed to delete review",
            error: error.message
        });
    }
}
export async function editReview(req, res)
{
    try
    {
        const {reviewId}=req.params;
        const {rating, comment}=req.body;
        const userId=req.user.userId;
        const review=await prisma.review.findUnique({
            where: {
                id: reviewId
            }
        });
        if (!review)
        {
            return res.status(404).json({
                message: "Review not found"
            });
        }

        if (review.userId!==userId)
        {
            return res.status(403).json({
                message: "You are not authorized to edit this review"
            });
        }
        if (rating<1||rating>5)
        {
            return res.status(400).json({
                message: "Rating must be between 1 and 5."
            });
        }
        const updatedReview=await prisma.review.update({
            where: {
                id: reviewId
            },
            data: {
                rating,
                comment
            }
        });
        res.status(200).json({
            message: "Review updated successfully",
            review: updatedReview
        });

    }
    catch (error)
    {
        console.error("Error editing review:", error);
        res.status(500).json({
            message: "Failed to edit review",
            error: error.message
        });
    }
}

export async function rejectReview(req, res)
{
    try
    {
        const {reviewId}=req.params;
        const review=await prisma.review.findUnique({
            where: {
                id: reviewId
            }
        });
        if (!review)
        {
            return res.status(404).json({
                message: "Review not found"
            });
        }
        const rejectedReview=await prisma.review.update({
            where: {
                id: reviewId
            },
            data: {
                isApproved: false
            }
        });
        res.status(200).json({
            message: "Review rejected successfully",
            review: rejectedReview
        });
    }
    catch (error)
    {
        console.error("Error rejecting review:", error);
        res.status(500).json({
            message: "Failed to reject review",
            error: error.message
        });
    }
}