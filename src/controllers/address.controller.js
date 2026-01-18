import prisma from "../db/db.js";

async function addAddressController(req, res)
{
    const userId=req.user.userId;
    const {addressLine1, addressLine2, city, state, postalCode, country, phoneNumber, saveAs}=req.body;
    if (!addressLine1||!city||!state||!postalCode||!country||!phoneNumber||!saveAs)
    {
        return res.status(400).json({message: "All required address fields must be provided"});
    }
    try
    {
        const newAddress=await prisma.address.create({
            data: {
                userId,
                addressLine1,
                addressLine2,
                city,
                state,
                postalCode,
                country,
                phoneNumber,
                saveAs
            }
        });
        return res.status(201).json(newAddress);
    }
    catch (error)
    {
        console.error("Error adding address:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
async function getAddressesController(req, res)
{
    try
    {
        const userId=req.user.userId;
        console.log(userId);

        const address=await prisma.address.findMany({
            where: {userId: userId}
        })
        console.log(address);
        return res.status(201).json({
            message: "Address fetched successfully",
            address
        })
    } catch (err)
    {
        console.log(err);
        return res.status(500).json({message: "Internal server error", err})
    }


}
async function updateAddressController(req, res)
{
    try
    {
        const userId=req.user.userId;
        const addressId=req.body.id;
        const {addressLine1, addressLine2, city, state, postalCode, country, phoneNumber, saveAs}=req.body;

        if (!addressLine1||!city||!state||!postalCode||!country||!phoneNumber||!saveAs)
        {
            return res.status(400).json({message: "All required address fields must be provided"});
        }
        const address=await prisma.address.findFirst({
            where: {
                id: addressId,
                userId: req.user.id, // security check
            },
        });

        if (!address)
        {
            return res.status(404).json({
                success: false,
                message: "Address not found",
            });
        }
        const updatedAddress=await prisma.address.update({
            where: {id: addressId},
            data: {
                addressLine1,
                addressLine2,
                city,
                state,
                postalCode,
                country,
                phoneNumber,
                saveAs
            },
        });
        return res.status(200).json({message: "Address updated successfully", address: updatedAddress});

    }
    catch (err)
    {
        console.log(err);
        return res.status(500).json({

            message: "Internal server error"
        })
    }
}

async function deleteAddressController(req, res)
{
    try
    {
        const userId=req.user.userId;
        const {addressId}=req.params;

        const address=await prisma.address.findFirst({
            where: {
                id: addressId,
                userId: userId,
            },
        });

        if (!address)
        {
            return res.status(404).json({message: "Address not found"});
        }

        await prisma.address.delete({
            where: {id: addressId}
        });

        return res.status(200).json({message: "Address deleted successfully"});
    }
    catch (err)
    {
        console.log(err);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function setDefaultAddressController(req, res)
{
    try
    {
        const userId=req.user.userId;
        const {addressId}=req.params;

        const address=await prisma.address.findFirst({
            where: {
                id: addressId,
                userId: userId,
            },
        });

        if (!address)
        {
            return res.status(404).json({message: "Address not found"});
        }

        // Remove default from all other addresses
        await prisma.address.updateMany({
            where: {userId: userId},
            data: {isDefault: false}
        });

        // Set this address as default
        const updatedAddress=await prisma.address.update({
            where: {id: addressId},
            data: {isDefault: true}
        });

        return res.status(200).json({message: "Default address updated", address: updatedAddress});
    }
    catch (err)
    {
        console.log(err);
        return res.status(500).json({message: "Internal server error"});
    }
}

export {addAddressController, getAddressesController, updateAddressController, deleteAddressController, setDefaultAddressController};