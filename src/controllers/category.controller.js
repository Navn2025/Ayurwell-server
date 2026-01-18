import prisma from "../db/db.js";
import cloudinary from '../services/cloudinary.service.js';
import streamifier from 'streamifier';




async function addCategory(req, res)
{
    try
    {
        const {name, slug, description, parentId}=req.body;

        if (!name||!slug)
        {
            return res.status(400).json({
                message: "Name and slug are required",
            });
        }

        if (parentId)
        {
            const parent=await prisma.category.findUnique({
                where: {id: parentId},
            });

            if (!parent)
            {
                return res.status(400).json({
                    message: "Parent category does not exist",
                });
            }
        }

        const category=await prisma.category.create({
            data: {
                name,
                slug,
                description,
                parentId: parentId||null,
            },
        });

        return res.status(201).json(category);
    } catch (error)
    {
        console.error("Create category error:", error);

        if (error.code==="P2002")
        {
            return res.status(409).json({
                message: "Category slug already exists",
            });
        }

        return res.status(500).json({message: "Internal server error"});
    }
}
async function getCategoryById(req, res)
{
    try
    {
        const {id}=req.params;
        const category=await prisma.category.findUnique({
            where: {id},
            include: {
                children: true,
                products: true,
            },
        });
        if (!category)
        {
            return res.status(404).json({message: "Category not found"});
        }
        return res.status(200).json(category);
    } catch (error)
    {
        console.error("Fetch category by ID error:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}


async function getCategoryTree(req, res)
{
    try
    {
        const categories=await prisma.category.findMany({
            where: {parentId: null},
            include: {
                children: {
                    include: {
                        _count: {
                            select: {products: true}
                        }
                    }
                },
                _count: {
                    select: {products: true}
                }
            },
        });

        return res.status(200).json(categories);
    } catch (error)
    {
        console.error("Fetch category tree error:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function getCategoryBySlug(req, res)
{
    try
    {
        const {slug}=req.params;

        const category=await prisma.category.findUnique({
            where: {slug},
            include: {
                children: true,
                products: true,
            },
        });

        if (!category)
        {
            return res.status(404).json({message: "Category not found"});
        }

        return res.status(200).json(category);
    } catch (error)
    {
        console.error("Fetch category error:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function updateCategory(req, res)
{
    try
    {
        const {id}=req.params;
        const {name, slug, description, parentId}=req.body;

        if (parentId===id)
        {
            return res.status(400).json({
                message: "Category cannot be its own parent",
            });
        }

        if (parentId)
        {
            const parent=await prisma.category.findUnique({
                where: {id: parentId},
            });

            if (!parent)
            {
                return res.status(400).json({
                    message: "Parent category does not exist",
                });
            }
        }

        const category=await prisma.category.update({
            where: {id},
            data: {
                name,
                slug,
                description,
                parentId: parentId??undefined,
            },
        });

        return res.status(200).json(category);
    } catch (error)
    {
        console.error("Update category error:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}


async function deleteCategory(req, res)
{
    try
    {
        const {id}=req.params;

        // 1️⃣ Check category exists
        const category=await prisma.category.findUnique({
            where: {id},
        });

        if (!category)
        {
            return res.status(404).json({
                success: false,
                message: "Category not found",
            });
        }

        // 2️⃣ Check products
        const productsCount=await prisma.product.count({
            where: {categoryId: id},
        });

        if (productsCount>0)
        {
            return res.status(409).json({
                success: false,
                message: "Cannot delete category. Products exist in this category.",
            });
        }

        // 3️⃣ Check subcategories
        const childrenCount=await prisma.category.count({
            where: {parentId: id},
        });

        if (childrenCount>0)
        {
            return res.status(409).json({
                success: false,
                message: "Cannot delete category with subcategories.",
            });
        }

        // 4️⃣ Delete category
        await prisma.category.delete({
            where: {id},
        });

        return res.status(200).json({
            success: true,
            message: "Category deleted successfully",
        });

    } catch (error)
    {
        console.error("Delete category error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

// ================
// CATEGORY IMAGE (Single Image)
// ================

async function uploadCategoryImage(req, res)
{
    try
    {
        const file=req.file;

        if (!file)
        {
            return res.status(400).json({message: 'No image uploaded'});
        }

        const {id}=req.params;

        const category=await prisma.category.findUnique({
            where: {id}
        });

        if (!category)
        {
            return res.status(404).json({message: "Category not found"});
        }

        // Delete existing image from Cloudinary if exists
        if (category.publicId)
        {
            await cloudinary.uploader.destroy(category.publicId);
        }

        // Upload new image to Cloudinary
        const result=await new Promise((resolve, reject) =>
        {
            const stream=cloudinary.uploader.upload_stream(
                {folder: 'category_images'},
                (error, result) =>
                {
                    if (result) resolve(result);
                    else reject(error);
                }
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
        });

        // Update category with new image
        const updatedCategory=await prisma.category.update({
            where: {id},
            data: {
                imageUrl: result.secure_url,
                publicId: result.public_id
            }
        });

        return res.status(200).json({
            message: 'Image uploaded successfully',
            category: updatedCategory
        });
    } catch (error)
    {
        console.error('Error uploading category image:', error);
        return res.status(500).json({message: 'Internal server error'});
    }
}

async function deleteCategoryImage(req, res)
{
    try
    {
        const {id}=req.params;

        const category=await prisma.category.findUnique({
            where: {id}
        });

        if (!category)
        {
            return res.status(404).json({message: 'Category not found'});
        }

        if (!category.imageUrl)
        {
            return res.status(404).json({message: 'No image to delete'});
        }

        // Delete from Cloudinary
        if (category.publicId)
        {
            await cloudinary.uploader.destroy(category.publicId);
        }

        // Remove image from category
        const updatedCategory=await prisma.category.update({
            where: {id},
            data: {
                imageUrl: null,
                publicId: null
            }
        });

        return res.status(200).json({
            message: 'Image deleted successfully',
            category: updatedCategory
        });
    } catch (error)
    {
        console.error('Error deleting category image:', error);
        return res.status(500).json({message: 'Internal server error'});
    }
}


export default {
    addCategory,
    getCategoryTree,
    getCategoryBySlug,
    updateCategory,
    deleteCategory,
    uploadCategoryImage,
    deleteCategoryImage,
    getCategoryById
};
