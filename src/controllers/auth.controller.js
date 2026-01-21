import bcrypt from "bcryptjs";
import prisma from "../db/db.js";
import jwt from "jsonwebtoken";

import {publishToQueue} from "../broker/borker.js";


async function registerUser(req, res)
{
    const {email, password, firstName, lastName, phoneNumber}=req.body;

    try
    {
        if (!email||!password||!firstName||!lastName||!phoneNumber)
        {
            return res.status(400).json({message: "All fields are required"});
        }

        const isUserExist=await prisma.user.findUnique({where: {email}});
        if (isUserExist)
        {
            return res.status(400).json({message: "User already exists"});
        }

        const hashPassword=await bcrypt.hash(password, 10);

        // 🔥 TRANSACTION START
        const {user}=await prisma.$transaction(async (tx) =>
        {
            const user=await tx.user.create({
                data: {
                    email,
                    passwordHash: hashPassword,
                    firstName,
                    lastName,
                    phoneNumber,
                    isProfileComplete: true,
                }
            });

            // ✅ Create cart immediately
            await tx.cart.create({
                data: {
                    userId: user.id
                }
            });

            return {user};
        });
        // 🔥 TRANSACTION END

        await publishToQueue("AUTH_NOTIFICATION.USER_CREATED", {
            userId: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
        });

        const token=jwt.sign(
            {userId: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName},
            process.env.JWT_SECRET,
            {expiresIn: "2weeks"}
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: true,        // must be true on HTTPS (Render)
            sameSite: "Lax",    // REQUIRED for cross-site
            maxAge: 14*24*60*60*1000,
            path: "/",
        });


        return res.status(201).json({
            message: "User registered successfully",
            userId: user.id,
            token
        });

    } catch (error)
    {
        console.error("Error registering user:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function loginUser(req, res)
{

    const {email, password}=req.body;
    try
    {
        if (!email||!password)
        {
            return res.status(400).json({message: "Email and password are required"});
        }

        const user=await prisma.user.findUnique({where: {email}});
        if (!user)
        {
            return res.status(400).json({message: "Invalid email or password"});
        }
        const isPasswordValid=await bcrypt.compare(password, user.passwordHash||"");
        if (!isPasswordValid)
        {
            return res.status(400).json({message: "Invalid email or password"});
        }
        const token=jwt.sign({userId: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName}, process.env.JWT_SECRET, {expiresIn: "2weeks"});
        res.cookie("token", token, {
            httpOnly: true,
            secure: true,        // must be true on HTTPS (Render)
            sameSite: "Lax",    // REQUIRED for cross-site
            maxAge: 14*24*60*60*1000,
            path: "/",
        });
        // 2 weeks
        return res.status(200).json({
            message: "Login successful",
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                phoneNumber: user.phoneNumber,
                role: user.role,
                isProfileComplete: user.isProfileComplete,
                isEmailVerified: user.isEmailVerified
            },
            token
        });
    }
    catch (error)
    {
        console.error("Error logging in user:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

async function googleAuth(req, res)
{
    try
    {
        if (!req.user)
        {
            return res.status(401).json({message: "Google authentication failed"});
        }

        const user=req.user;

        if (!process.env.JWT_SECRET)
        {
            return res.status(500).json({message: "JWT secret is not configured"});
        }

        const token=jwt.sign({userId: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName}, process.env.JWT_SECRET, {expiresIn: "2weeks"});


        res.cookie("token", token,
            {
                httpOnly: true,
                secure: process.env.NODE_ENV==="production",
                sameSite: "Lax",
                maxAge: 14*24*60*60*1000
            }
        );

        // Check if profile is complete
        const isProfileComplete=user.isProfileComplete;

        // Redirect to profile completion if not complete
        if (!isProfileComplete)
        {
            const profileRedirect=process.env.GOOGLE_PROFILE_REDIRECT||`${process.env.FRONTEND_URL||"http://localhost:5173"}/complete-profile`;
            return res.redirect(profileRedirect);
        }

        const successRedirect=process.env.GOOGLE_SUCCESS_REDIRECT||`${process.env.FRONTEND_URL||"http://localhost:5173"}`;
        return res.redirect(successRedirect);
    }
    catch (error)
    {
        console.error("Error handling Google auth callback:", error);
        const failureRedirect=process.env.GOOGLE_FAILURE_REDIRECT||`${process.env.FRONTEND_URL||"http://localhost:5173"}/login?error=google_auth_failed`;
        return res.redirect(failureRedirect);
    }
}

async function completeProfile(req, res)
{
    const userId=req.user.userId;
    console.log(userId);
    // from JWT
    const {phoneNumber}=req.body;


    if (!phoneNumber)
    {
        return res.status(400).json({message: "Phone number is required"});
    }
    const isAlreadyComplete=await prisma.user.findUnique({
        where: {id: userId},
        select: {isProfileComplete: true}
    });
    if (isAlreadyComplete&&isAlreadyComplete.isProfileComplete)
    {
        return res.status(400).json({message: "Profile is already complete"});
    }

    const user=await prisma.user.update({
        where: {id: userId},
        data: {
            phoneNumber,
            isProfileComplete: true,
        },
    });

    return res.json({message: "Profile completed", userId: user.id});
}
async function getCurrentUser(req, res)
{
    const userId=req.user.userId;
    console.log(req.user);

    try
    {
        const user=await prisma.user.findUnique({
            where: {id: userId},
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
                role: true,
                isProfileComplete: true,
                isEmailVerified: true,
                createdAt: true,

            }
        });
        if (!user)
        {
            return res.status(404).json({message: "User not found"});
        }
        return res.json({user});
    }
    catch (error)
    {
        console.error("Error fetching current user:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
async function logoutUser(req, res)
{

    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV==="production",
    });
    return res.json({message: "Logout successful"});
}
async function deleteUser(req, res)
{
    const userId=req.user.userId;
    try
    {
        await prisma.$transaction(async (prisma) =>
        {
            const user=await prisma.user.findUniqueOrThrow({
                where: {id: userId},
                select: {
                    email: true,
                    firstName: true,
                    lastName: true,

                }
            });
            await prisma.cart.delete(
                {
                    where: {userId: userId}
                })

            await publishToQueue("AUTH_NOTIFICATION.USER_DELETED", {userId: userId, email: user.email, firstName: user.firstName, lastName: user.lastName});

            await prisma.user.delete({where: {id: userId}});
            res.clearCookie("token", {
                httpOnly: true,
                secure: process.env.NODE_ENV==="production",
            });
        });
        return res.json({message: "User deleted successfully"});
    }
    catch (error)
    {
        console.error("Error deleting user:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
async function updateUser(req, res)
{
    const {email, firstName, lastName, phoneNumber}=req.body;
    const userId=req.user.userId;

    if (!email||!firstName||!lastName||!phoneNumber)
    {
        return res.status(400).json({message: "All fields are required"});
    }
    const existingUser=await prisma.user.findUnique({where: {email}});
    if (existingUser&&existingUser.id!==userId)
    {
        return res.status(400).json({message: "Email is already in use by another account"});
    }

    const user=await prisma.user.update({
        where: {id: userId},
        data: {email, firstName, lastName, phoneNumber},
    });
    const token=jwt.sign(
        {userId: user.id, email: user.email, role: user.role},
        process.env.JWT_SECRET,
        {expiresIn: "2weeks"}
    );

    res.cookie("token", token, {
        httpOnly: true,
        secure: true,        // must be true on HTTPS (Render)
        sameSite: "Lax",    // REQUIRED for cross-site
        maxAge: 14*24*60*60*1000,
        path: "/",
    });


    return res.json({message: "User updated successfully", userId: user.id});
}
async function forgotPassword(req, res)
{
    const {email}=req.body;
    try
    {
        if (!email)
        {
            return res.status(400).json({message: "Email is required"});
        }
        const user=await prisma.user.findUnique({where: {email}});
        if (!user)
        {
            return res.status(404).json({message: "User with this email does not exist"});
        }
        const token=jwt.sign({userId: user.id, email: user.email}, process.env.JWT_SECRET, {expiresIn: "1h"});

        await publishToQueue("AUTH_NOTIFICATION.PASSWORD_RESET", {
            userId: user.id,
            email: user.email,
            firstName: user.firstName,
            resetToken: token
        });

        return res.json({message: "Password reset email sent"});
    }
    catch (error)
    {
        console.error("Error in forgotPassword:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}
async function resetPassword(req, res)
{
    const {token, newPassword}=req.body;
    try
    {
        if (!token||!newPassword)
        {
            return res.status(400).json({message: "Token and new password are required"});
        }
        const decoded=jwt.verify(token, process.env.JWT_SECRET);
        const userId=decoded.userId;
        const hashPassword=await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: {id: userId},
            data: {passwordHash: hashPassword},
        });
        await publishToQueue("AUTH_NOTIFICATION.PASSWORD_CHANGED", {
            userId: userId,
            email: decoded.email,
            firstName: decoded.firstName
        });
        return res.json({message: "Password reset successful"});
    }
    catch (error)
    {
        console.error("Error in resetPassword:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}




async function changePassword(req, res)
{
    const userId=req.user.userId;
    const {currentPassword, newPassword}=req.body;

    try
    {
        if (!currentPassword||!newPassword)
        {
            return res.status(400).json({message: "Current password and new password are required"});
        }

        if (newPassword.length<6)
        {
            return res.status(400).json({message: "New password must be at least 6 characters long"});
        }

        // Get user with current password
        const user=await prisma.user.findUnique({
            where: {id: userId},
            select: {passwordHash: true, email: true, firstName: true}
        });

        if (!user)
        {
            return res.status(404).json({message: "User not found"});
        }

        // Verify current password
        const isCurrentPasswordValid=await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isCurrentPasswordValid)
        {
            return res.status(400).json({message: "Current password is incorrect"});
        }

        // Hash new password
        const hashPassword=await bcrypt.hash(newPassword, 10);

        // Update password
        await prisma.user.update({
            where: {id: userId},
            data: {passwordHash: hashPassword}
        });

        // Send password change notification
        await publishToQueue("AUTH_NOTIFICATION.PASSWORD_CHANGED", {
            userId: userId,
            email: user.email,
            firstName: user.firstName
        });

        return res.json({message: "Password changed successfully"});

    } catch (error)
    {
        console.error("Error changing password:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}


export
{
    registerUser, loginUser, googleAuth, completeProfile
    , getCurrentUser, logoutUser, deleteUser, updateUser, forgotPassword, resetPassword, changePassword
};
