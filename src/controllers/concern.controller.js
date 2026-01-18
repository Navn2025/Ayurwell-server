import prisma from "../db/db.js";
import cloudinary from '../services/cloudinary.service.js';
import streamifier from 'streamifier';

// ================
// CONCERN CRUD
// ================

async function createConcern(req, res)
{
    try
    {
        const {name, slug, description, link}=req.body;

        if (!name||!slug)
        {
            return res.status(400).json({message: "Name and slug are required"});
        }

        const existingConcern=await prisma.concern.findUnique({
            where: {slug}
        });

        if (existingConcern)
        {
            return res.status(409).json({message: "Concern with this slug already exists"});
        }

        const newConcern=await prisma.concern.create({
            data: {
                name,
                slug,
                description,
                link
            }
        });

        return res.status(201).json({
            message: "Concern created successfully",
            concern: newConcern
        });
    } catch (error)
    {
        console.error("Error creating concern:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function getAllConcerns(req, res)
{
    try
    {
        // Admin can see all concerns, others see only active
        const {includeInactive}=req.query;
        const isAdmin=req.user?.role==='ADMIN'||req.user?.role==='SUPER_ADMIN';

        const whereClause=includeInactive==='true'&&isAdmin? {}:{isActive: true};

        const concerns=await prisma.concern.findMany({
            where: whereClause,
            include: {
                _count: {
                    select: {products: true}
                }
            },
            orderBy: {createdAt: 'desc'}
        });

        return res.status(200).json({
            message: "Concerns fetched successfully",
            concerns
        });
    } catch (error)
    {
        console.error("Error fetching concerns:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function getConcernById(req, res)
{
    try
    {
        const {id}=req.params;

        const concern=await prisma.concern.findUnique({
            where: {id}
        });

        if (!concern)
        {
            return res.status(404).json({message: "Concern not found"});
        }

        return res.status(200).json({
            message: "Concern fetched successfully",
            concern
        });
    } catch (error)
    {
        console.error("Error fetching concern by ID:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function getConcernBySlug(req, res)
{
    try
    {
        const {slug}=req.params;

        const concern=await prisma.concern.findUnique({
            where: {slug}
        });

        if (!concern)
        {
            return res.status(404).json({message: "Concern not found"});
        }

        return res.status(200).json({
            message: "Concern fetched successfully",
            concern
        });
    } catch (error)
    {
        console.error("Error fetching concern by slug:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function updateConcern(req, res)
{
    try
    {
        const {id}=req.params;
        const {name, slug, description, link, isActive}=req.body;

        const existingConcern=await prisma.concern.findUnique({
            where: {id}
        });

        if (!existingConcern)
        {
            return res.status(404).json({message: "Concern not found"});
        }

        // Check if new slug already exists (if slug is being changed)
        if (slug&&slug!==existingConcern.slug)
        {
            const slugExists=await prisma.concern.findUnique({
                where: {slug}
            });
            if (slugExists)
            {
                return res.status(409).json({message: "Concern with this slug already exists"});
            }
        }

        const updatedConcern=await prisma.concern.update({
            where: {id},
            data: {
                name,
                slug,
                description,
                link,
                isActive
            }
        });

        return res.status(200).json({
            message: "Concern updated successfully",
            concern: updatedConcern
        });
    } catch (error)
    {
        console.error("Error updating concern:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function deleteConcern(req, res)
{
    try
    {
        const {id}=req.params;

        const existingConcern=await prisma.concern.findUnique({
            where: {id}
        });

        if (!existingConcern)
        {
            return res.status(404).json({message: "Concern not found"});
        }

        // Delete image from Cloudinary if exists
        if (existingConcern.publicId)
        {
            await cloudinary.uploader.destroy(existingConcern.publicId);
        }

        await prisma.concern.delete({
            where: {id}
        });

        return res.status(200).json({message: "Concern deleted successfully"});
    } catch (error)
    {
        console.error("Error deleting concern:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

// ================
// CONCERN IMAGE (Single Image)
// ================

async function uploadConcernImage(req, res)
{
    try
    {
        const file=req.file;

        if (!file)
        {
            return res.status(400).json({message: 'No image uploaded'});
        }

        const {concernId}=req.params;

        const concern=await prisma.concern.findUnique({
            where: {id: concernId}
        });

        if (!concern)
        {
            return res.status(404).json({message: "Concern not found"});
        }

        // Delete existing image from Cloudinary if exists
        if (concern.publicId)
        {
            await cloudinary.uploader.destroy(concern.publicId);
        }

        // Upload new image to Cloudinary
        const result=await new Promise((resolve, reject) =>
        {
            const stream=cloudinary.uploader.upload_stream(
                {folder: 'concern_images'},
                (error, result) =>
                {
                    if (result) resolve(result);
                    else reject(error);
                }
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
        });

        // Update concern with new image
        const updatedConcern=await prisma.concern.update({
            where: {id: concernId},
            data: {
                imageUrl: result.secure_url,
                publicId: result.public_id
            }
        });

        return res.status(200).json({
            message: 'Image uploaded successfully',
            concern: updatedConcern
        });
    } catch (error)
    {
        console.error('Error uploading concern image:', error);
        return res.status(500).json({message: 'Internal server error'});
    }
}

async function deleteConcernImage(req, res)
{
    try
    {
        const {concernId}=req.params;

        const concern=await prisma.concern.findUnique({
            where: {id: concernId}
        });

        if (!concern)
        {
            return res.status(404).json({message: 'Concern not found'});
        }

        if (!concern.imageUrl)
        {
            return res.status(404).json({message: 'No image to delete'});
        }

        // Delete from Cloudinary
        if (concern.publicId)
        {
            await cloudinary.uploader.destroy(concern.publicId);
        }

        // Remove image from concern
        const updatedConcern=await prisma.concern.update({
            where: {id: concernId},
            data: {
                imageUrl: null,
                publicId: null
            }
        });

        return res.status(200).json({
            message: 'Image deleted successfully',
            concern: updatedConcern
        });
    } catch (error)
    {
        console.error('Error deleting concern image:', error);
        return res.status(500).json({message: 'Internal server error'});
    }
}

export default {
    createConcern,
    getAllConcerns,
    getConcernById,
    getConcernBySlug,
    updateConcern,
    deleteConcern,
    uploadConcernImage,
    deleteConcernImage
};
