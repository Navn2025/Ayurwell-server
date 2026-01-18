import prisma from "../db/db.js";
import sendEmail from "../notification/email.js";
import {publishToQueue} from "../broker/borker.js";

// Create a new contact
async function createContact(req, res)
{
    try
    {
        const {firstName, lastName, email, phone, subject, message}=req.body;

        // Validate required fields
        if (!firstName||!lastName||!email||!phone||!subject||!message)
        {
            return res.status(400).json({message: "All fields are required"});
        }

        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        {
            return res.status(400).json({message: "Invalid email format"});
        }

        // Validate phone format
        if (!/^\d{10}$/.test(phone.replace(/\D/g, '')))
        {
            return res.status(400).json({message: "Phone number must be 10 digits"});
        }

        // Check if message is too short
        if (message.trim().length<10)
        {
            return res.status(400).json({message: "Message must be at least 10 characters"});
        }

        // Create contact
        const contact=await prisma.contact.create({
            data: {
                firstName,
                lastName,
                email,
                phone,
                subject,
                message: message.trim(),
                userId: req.user?.userId||null, // If user is logged in
                status: "NEW"
            },
            include: {
                user: true
            }
        });

        // Send notification email to admin


        await publishToQueue("CONTACT_NOTIFICATION.NEW_MESSAGE", {
            contactId: contact.id,
            firstName,
            lastName,
            email,
            phone,
            subject,
            message
        });

        return res.status(201).json({
            message: "Contact message sent successfully",
            contact
        });
    } catch (error)
    {
        console.error("Error creating contact:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

// Get all contacts (admin only)
async function getAllContacts(req, res)
{
    try
    {
        if (req.user?.role!=="ADMIN")
        {
            return res.status(403).json({message: "Admin access only"});
        }

        const {status, search, page=1, limit=10}=req.query;

        const skip=Math.max(0, (parseInt(page)-1)*parseInt(limit));

        // Build where clause
        const where={};
        if (status)
        {
            where.status=status;
        }
        if (search)
        {
            where.OR=[
                {firstName: {contains: search, mode: "insensitive"}},
                {lastName: {contains: search, mode: "insensitive"}},
                {email: {contains: search, mode: "insensitive"}},
                {subject: {contains: search, mode: "insensitive"}}
            ];
        }

        const [contacts, total]=await Promise.all([
            prisma.contact.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    },
                    replies: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    email: true
                                }
                            }
                        }
                    }
                },
                orderBy: {createdAt: "desc"},
                skip,
                take: parseInt(limit)
            }),
            prisma.contact.count({where})
        ]);

        return res.json({
            contacts,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total/parseInt(limit))
            }
        });
    } catch (error)
    {
        console.error("Error fetching contacts:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

// Get single contact (admin only)
async function getContactById(req, res)
{
    try
    {
        if (req.user?.role!=="ADMIN")
        {
            return res.status(403).json({message: "Admin access only"});
        }

        const {contactId}=req.params;

        const contact=await prisma.contact.findUnique({
            where: {id: contactId},
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        phoneNumber: true
                    }
                },
                replies: {
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
                    orderBy: {createdAt: "asc"}
                }
            }
        });

        if (!contact)
        {
            return res.status(404).json({message: "Contact not found"});
        }

        return res.json({contact});
    } catch (error)
    {
        console.error("Error fetching contact:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

// Update contact status (admin only)
async function updateContactStatus(req, res)
{
    try
    {
        if (req.user?.role!=="ADMIN")
        {
            return res.status(403).json({message: "Admin access only"});
        }

        const {contactId}=req.params;
        const {status}=req.body;

        const validStatuses=["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"];
        if (!validStatuses.includes(status))
        {
            return res.status(400).json({message: "Invalid status"});
        }

        const contact=await prisma.contact.update({
            where: {id: contactId},
            data: {status}
        });

        return res.json({
            message: "Contact status updated",
            contact
        });
    } catch (error)
    {
        console.error("Error updating contact:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

// Add reply to contact (admin only)
async function addContactReply(req, res)
{
    try
    {
        if (req.user?.role!=="ADMIN")
        {
            return res.status(403).json({message: "Admin access only"});
        }

        const {contactId}=req.params;
        const {message}=req.body;

        if (!message||message.trim().length<5)
        {
            return res.status(400).json({message: "Reply message must be at least 5 characters"});
        }

        // Check if contact exists
        const contact=await prisma.contact.findUnique({
            where: {id: contactId},
            select: {email: true, firstName: true, lastName: true}
        });

        if (!contact)
        {
            return res.status(404).json({message: "Contact not found"});
        }

        // Create reply
        const reply=await prisma.contactReply.create({
            data: {
                contactId,
                userId: req.user.userId,
                message: message.trim()
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
            }
        });



        await publishToQueue("CONTACT_NOTIFICATION.NEW_REPLY", {
            contactId,
            userEmail: contact.email,
            userName: contact.firstName,
            message
        });

        return res.status(201).json({
            message: "Reply added successfully",
            reply
        });
    } catch (error)
    {
        console.error("Error adding reply:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

// Delete contact (admin only)
async function deleteContact(req, res)
{
    try
    {
        // Enhanced admin role check
        if (req.user?.role!=="ADMIN"&&req.user?.role!=="SUPER_ADMIN")
        {
            return res.status(403).json({
                message: "Admin access only",
                code: "INSUFFICIENT_PERMISSIONS"
            });
        }

        const {contactId}=req.params;

        await prisma.contact.delete({
            where: {id: contactId}
        });

        return res.json({message: "Contact deleted successfully"});
    } catch (error)
    {
        console.error("Error deleting contact:", error);
        return res.status(500).json({message: "Internal server error"});
    }
}

// Enhanced add reply function with comprehensive support
async function sendReplyToContactEnhanced(req, res)
{
    const startTime=Date.now();

    try
    {
        // Enhanced admin role check
        if (req.user?.role!=="ADMIN"&&req.user?.role!=="SUPER_ADMIN")
        {
            return res.status(403).json({
                message: "Admin access only",
                code: "INSUFFICIENT_PERMISSIONS"
            });
        }

        const {contactId}=req.params;
        const {
            reply,
            customerEmail,
            customerName,
            sendEmail: shouldSendEmail=false
        }=req.body;

        // Enhanced validation
        const validationErrors={};

        if (!reply||typeof reply!=='string')
        {
            validationErrors.reply="Reply message is required and must be a string";
        } else if (reply.trim().length<5)
        {
            validationErrors.reply="Reply message must be at least 5 characters";
        } else if (reply.trim().length>2000)
        {
            validationErrors.reply="Reply message must not exceed 2000 characters";
        }

        if (customerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))
        {
            validationErrors.customerEmail="Invalid customer email format";
        }

        if (Object.keys(validationErrors).length>0)
        {
            return res.status(400).json({
                message: "Validation failed",
                errors: validationErrors,
                code: "VALIDATION_ERROR"
            });
        }

        // Check if contact exists and get full details
        const contact=await prisma.contact.findUnique({
            where: {id: contactId},
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            }
        });

        if (!contact)
        {
            return res.status(404).json({
                message: "Contact not found",
                code: "CONTACT_NOT_FOUND"
            });
        }

        // Create reply in database with transaction
        const createdReply=await prisma.$transaction(async (tx) =>
        {
            // Create reply
            const newReply=await tx.contactReply.create({
                data: {
                    contactId,
                    userId: req.user.userId,
                    message: reply.trim(),

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
                }
            });

            // Update contact status to REPLIED if this is the first reply
            const existingReplies=await tx.contactReply.count({
                where: {contactId}
            });

            if (existingReplies===1)
            {
                await tx.contact.update({
                    where: {id: contactId},
                    data: {
                        status: "REPLIED",
                        updatedAt: new Date()
                    }
                });
            }

            return newReply;
        });

        // Send email notification (only if requested or if custom email provided)
        let emailSent=false;
        const finalCustomerName=customerName||`${contact.firstName} ${contact.lastName}`;
        const finalRecipientEmail=customerEmail||contact.email;

        if (shouldSendEmail||customerEmail)
        {
            try
            {
                const emailHtmlTemplate=`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Reply to Your Message - Ayurwell</title>
                        <style>
                            body {
                                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                line-height: 1.6;
                                color: #333;
                                max-width: 600px;
                                margin: 0 auto;
                                padding: 20px;
                                background-color: #f8f9fa;
                            }
                            .email-container {
                                background-color: #ffffff;
                                border-radius: 12px;
                                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                                overflow: hidden;
                            }
                            .header {
                                background: linear-gradient(135deg, #1a472a 0%, #2d5a3d 100%);
                                color: #fff;
                                padding: 30px 40px;
                                text-align: center;
                            }
                            .header h1 {
                                margin: 0;
                                font-size: 28px;
                                font-weight: 700;
                            }
                            .header .tagline {
                                margin: 8px 0 0 0;
                                font-size: 16px;
                                opacity: 0.9;
                            }
                            .content {
                                padding: 40px;
                            }
                            .content h2 {
                                color: #1a472a;
                                font-size: 24px;
                                margin-bottom: 20px;
                            }
                            .reply-box {
                                background-color: #f0f9ff;
                                border-left: 4px solid #1a472a;
                                padding: 20px;
                                margin: 20px 0;
                                border-radius: 0 8px 8px 0;
                            }
                            .reply-box p {
                                margin: 0;
                                white-space: pre-wrap;
                                font-family: inherit;
                            }
                            .footer {
                                background-color: #1a472a;
                                color: rgba(255, 255, 255, 0.8);
                                padding: 30px 40px;
                                text-align: center;
                            }
                            .footer p {
                                margin: 0 0 10px 0;
                                font-size: 14px;
                            }
                            .footer a {
                                color: rgba(255, 255, 255, 0.8);
                                text-decoration: none;
                                margin: 0 10px;
                            }
                            .footer a:hover {
                                color: #fff;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="email-container">
                            <div class="header">
                                <h1>Ayurwell</h1>
                                <div class="tagline">Embrace Natural Wellness</div>
                            </div>
                            <div class="content">
                                <h2>We've replied to your message 💬</h2>
                                <p>Hello ${finalCustomerName},</p>
                                <p>Thank you for reaching out to Ayurwell. We've sent our response below:</p>
                                <div class="reply-box">
                                    <p>${reply.replace(/\n/g, '<br>')}</p>
                                </div>
                                <h3>What happens next?</h3>
                                <p>1. <strong>Review our response:</strong> Take time to read through our reply</p>
                                <p>2. <strong>Follow up if needed:</strong> Reply to this email or contact us again</p>
                                <p>3. <strong>Visit our website:</strong> Browse more products and wellness resources</p>
                            </div>
                            <div class="footer">
                                <p>&copy; ${new Date().getFullYear()} Ayurwell. All rights reserved.</p>
                                <p>100% Authentic Ayurvedic Products | Trusted by Thousands</p>
                                <div>
                                    <a href="${process.env.FRONTEND_URL}/contact">Contact Us</a> | 
                                    <a href="${process.env.FRONTEND_URL}/products">Shop</a>
                                </div>
                            </div>
                        </div>
                    </body>
                    </html>
                `;

                await sendEmail(
                    finalRecipientEmail,
                    `Reply to Your Message - Ayurwell [${contactId}]`,
                    `Hello ${finalCustomerName},\n\nThank you for contacting Ayurwell. We've sent our response to your message:\n\n${reply}\n\nIf you need further assistance, please don't hesitate to contact us again.\n\nBest regards,\nThe Ayurwell Team\n\nContact ID: ${contactId}`,
                    emailHtmlTemplate
                );
                emailSent=true;
            } catch (emailError)
            {
                console.error('Failed to send reply email:', emailError);
                // Don't fail the entire request if email fails
            }
        }

        // Publish notification for real-time updates
        try
        {
            await publishToQueue("CONTACT_NOTIFICATION.NEW_REPLY", {
                contactId,
                userEmail: finalRecipientEmail,
                userName: finalCustomerName,
                message: reply,
                emailSent,
                replyId: createdReply.id,
                timestamp: new Date().toISOString()
            });
        } catch (queueError)
        {
            console.error('Failed to publish to queue:', queueError);
            // Don't fail the entire request if queue fails
        }

        // Log action for audit
        console.log(`Enhanced reply added to contact ${contactId} by admin ${req.user.userId}`, {
            replyId: createdReply.id,
            messageLength: reply.length,
            emailSent,
            processingTime: Date.now()-startTime
        });

        return res.status(201).json({
            message: "Reply added successfully",
            data: {
                reply: createdReply,
                emailSent,
                contactId,
                processingTime: `${Date.now()-startTime}ms`
            },
            code: "SUCCESS"
        });

    } catch (error)
    {
        console.error("Error adding enhanced reply:", {
            error: error.message,
            stack: error.stack,
            contactId: req.params.contactId,
            adminId: req.user?.userId,
            timestamp: new Date().toISOString()
        });

        return res.status(500).json({
            message: "Internal server error",
            code: "INTERNAL_ERROR",
            timestamp: new Date().toISOString()
        });
    }
}

export
{
    createContact,
    getAllContacts,
    getContactById,
    updateContactStatus,
    addContactReply,
    deleteContact,
    sendReplyToContactEnhanced
};