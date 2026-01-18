

import cloudinary from '../services/cloudinary.service.js';
import streamifier from 'streamifier';
import prisma from '../db/db.js';

async function addImageToProduct(req, res)
{
    try
    {
        if (!req.files||req.files.length===0)
        {
            return res.status(400).json({message: 'No images uploaded'});
        }

        const {productId}=req.params;
        const product=await prisma.product.findUnique({
            where: {id: productId}
        });
        if (!product)
        {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        const uploadToCloudinary=(file) =>
        {
            return new Promise((resolve, reject) =>
            {
                const stream=cloudinary.uploader.upload_stream(
                    {folder: 'product_images'},
                    (error, result) =>
                    {
                        if (result) resolve(result);
                        else reject(error);
                    }
                );
                streamifier.createReadStream(file.buffer).pipe(stream);
            });
        };

        const uploadedImages=[];
        let position=0;
        for (const file of req.files)
        {
            const result=await uploadToCloudinary(file);
            const image=await prisma.productImage.create({
                data: {
                    product: {
                        connect: {id: productId}
                    },
                    imageUrl: result.secure_url,
                    publicId: result.public_id,
                    altText: file.originalname,
                    isPrimary: position===0,
                    position: position++
                }
            });
            uploadedImages.push({url: result.secure_url});
        }

        return res.json({
            message: 'Images uploaded successfully',
            images: uploadedImages
        });
    } catch (error)
    {
        console.error('Error adding images to product:', error);
        return res.status(500).json({message: 'Internal server error'});
    }
}
async function deleteAllImagesFromProduct(req, res)
{
    try
    {
        const {productId}=req.params;
        const images=await prisma.productImage.findMany({
            where: {productId: productId}
        });
        if (images.length===0)
        {
            return res.status(404).json({message: 'No images found for this product'});
        }
        for (const image of images)
        {
            await cloudinary.uploader.destroy(image.publicId);
        }
        await prisma.productImage.deleteMany({
            where: {productId: productId}
        });
        return res.json({message: 'All images deleted successfully from product'});
    }
    catch (error)
    {
        console.error('Error deleting all images from product:', error);
        return res.status(500).json({message: 'Internal server error'});
    }
}
async function deleteImageFromProduct(req, res)
{
    try
    {
        const {imageId}=req.params;
        const image=await prisma.productImage.findUnique({
            where: {id: imageId}
        });
        if (!image)
        {
            return res.status(404).json({message: 'Image not found'});
        }
        await cloudinary.uploader.destroy(image.publicId);
        await prisma.productImage.delete({
            where: {id: (imageId)}
        });
        return res.json({message: 'Image deleted successfully'});
    }
    catch (error)
    {
        console.error('Error deleting image from product:', error);
        return res.status(500).json({message: 'Internal server error'});
    }

}
async function getImagesForProduct(req, res)
{
    try
    {
        const {productId}=req.params;
        const images=await prisma.productImage.findMany({
            where: {productId: productId}
        });
        if (images.length===0)
        {
            return res.status(404).json({message: 'No images found for this product'});
        }
        return res.json(images);
    }
    catch (error)
    {
        console.error('Error getting images for product:', error);
        return res.status(500).json({message: 'Internal server error'});
    }
}
async function getImageById(req, res)
{
    try
    {
        const {imageId}=req.params;
        const image=await prisma.productImage.findUnique({
            where: {id: (imageId)}
        });
        if (!image)
        {
            return res.status(404).json({message: 'Image not found'});
        }
        return res.json(image);
    }
    catch (error)
    {
        console.error('Error getting image by ID:', error);
        return res.status(500).json({message: 'Internal server error'});
    }
}

async function setPrimaryImage(req, res)
{
    try
    {
        const {productId, imageId}=req.params;

        // Verify image belongs to product
        const image=await prisma.productImage.findFirst({
            where: {id: imageId, productId}
        });

        if (!image)
        {
            return res.status(404).json({message: 'Image not found for this product'});
        }

        // Remove primary from all other images of this product
        await prisma.productImage.updateMany({
            where: {productId},
            data: {isPrimary: false}
        });

        // Set selected image as primary
        await prisma.productImage.update({
            where: {id: imageId},
            data: {isPrimary: true}
        });

        return res.json({message: 'Primary image set successfully'});
    }
    catch (error)
    {
        console.error('Error setting primary image:', error);
        return res.status(500).json({message: 'Internal server error'});
    }
}

export {addImageToProduct, deleteImageFromProduct, getImagesForProduct, getImageById, deleteAllImagesFromProduct, setPrimaryImage};