import {subscribeToQueue} from "./borker.js";
import sendEmail from '../notification/email.js'
export default function ()
{
    subscribeToQueue("AUTH_NOTIFICATION.USER_CREATED", async (data) =>
    {
        const emailHtmlTemplate=`<html>
       <body>
           <h1>Welcome to Ayurwell, ${data.firstName}!</h1>
              <p>Thank you for registering with us. We're excited to have you on board.</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
         </body>
         </html>`;
        await sendEmail(
            data.email,
            "Welcome to Ayurwell!",
            `Hello ${data.firstName},\n\nThank you for registering with Ayurwell. We're excited to have you on board.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    })
    subscribeToQueue("AUTH_NOTIFICATION.USER_DELETED", async (data) =>
    {
        const emailHtmlTemplate=`<html>
         <body>
                <h1>Goodbye from Ayurwell, ${data.firstName}</h1>
                <p>We're sorry to see you go. If you have any feedback, please let us know.</p>
                <p>We hope to see you again in the future!</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
                
          </body>
          </html>`;
        await sendEmail(
            data.email,
            "Goodbye from Ayurwell",
            `Hello ${data.firstName},\n\nWe're sorry to see you go. If you have any feedback, please let us know.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue("AUTH_NOTIFICATION.PASSWORD_RESET", async (data) =>
    {
        const resetLink=`${process.env.FRONTEND_URL}/reset-password?token=${data.resetToken}`;
        const emailHtmlTemplate=`<html>
            <body>
                <h1>Password Reset Request</h1>
                <p>Hi ${data.firstName},</p>
                <p>We received a request to reset your password. Click the link below to set a new password:</p>
                <a href="${resetLink}">Reset Password</a>
                <p>If you didn't request a password reset, please ignore this email.</p>
            </body>
            </html>`
        await sendEmail(
            data.email,
            "Password Reset Request",
            `Hi ${data.firstName},\n\nWe received a request to reset your password. Use the link below to set a new password:\n\n${resetLink}\n\nIf you didn't request a password reset, please ignore this email.`,
            emailHtmlTemplate
        );
    });

    subscribeToQueue("AUTH_NOTIFICATION.PASSWORD_CHANGED", async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>
                <h1>Password Changed Successfully</h1>
                <p>Hi ${data.firstName},</p>
                <p>Your password has been changed successfully. If you did not make this change, please contact our support team immediately.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Password Changed Successfully",
            `Hi ${data.firstName},\n\nYour password has been changed successfully. If you did not make this change, please contact our support team immediately.`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue("ORDER_NOTIFICATION.ORDER_PAID", async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>
                <h1>Order Payment Successful</h1>
                <p>Hi ${data.firstName},</p>
                <p>Your payment for order #${data.orderId} has been received successfully. Thank you for shopping with us!</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Order Payment Successful",
            `Hi ${data.firstName+" "+data.lastName},\n\nYour payment for order #${data.orderId} has been received successfully. Thank you for shopping with us!`,
            emailHtmlTemplate
        );

    });
    subscribeToQueue("SHIPMENT_NOTIFICATION.SHIPMENT_CREATED", async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>
                <h1>Your Order has been Shipped!</h1>
                <p>Hi ${data.firstName},</p>
                <p>Your order #${data.orderId} has been shipped. You can track your shipment using the following link:</p>
                <a href="${data.trackingUrl}">Track Shipment</a>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Your Order has been Shipped!",
            `Hi ${data.firstName+" "+data.lastName},\n\nYour order #${data.orderId} has been shipped. You can track your shipment using the following link:\n\n${data.trackingUrl}`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue("SHIPMENT_NOTIFICATION.SHIPMENT_ASSIGNED_FAILED", async (data) =>
    {
        const emailHtmlTemplate=`<html>

            <body>
                <h1>Shipment Assignment Failed</h1>
                <p>Hi ${data.firstName},</p>
                <p>We encountered an issue while assigning a shipment for your order #${data.orderId}. Our team is working to resolve this as quickly as possible.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Shipment Assignment Failed",
            `Hi ${data.firstName+" "+data.lastName},\n\nWe encountered an issue while assigning a shipment for your order #${data.orderId}. Our team is working to resolve this as quickly as possible.`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue("PAYMENT_NOTIFICATION.PAYMENT_VERIFICATION_FAILED", async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>
                <h1>Payment Verification Failed</h1>
                <p>Hi ${data.firstName},</p>
                <p>We were unable to verify your recent payment associated with order ID: ${data.razorpay_order_id}. Please try again or contact support for assistance.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Payment Verification Failed",
            `Hi ${data.firstName+" "+data.lastName},\n\nWe were unable to verify your recent payment associated with order ID: ${data.razorpay_order_id}. Please try again or contact support for assistance.`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue('COD_NOTIFICATION.SHIPMENT_CREATED', async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>

                <h1>Your COD Order has been Shipped!</h1>
                <p>Hi ${data.firstName},</p>
                <p>Your COD order #${data.orderId} has been shipped. You can track your shipment using the following link:</p>
                <a href="${data.trackingUrl}">Track Shipment</a>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Your COD Order has been Shipped!",
            `Hi ${data.firstName+" "+data.lastName},\n\nYour COD order #${data.orderId} has been shipped. You can track your shipment using the following link:\n\n${data.trackingUrl}`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue('ORDER_NOTIFICATION.ORDER_CANCELLED', async (data) =>
    {
        const emailHtmlTemplate=`<html>

            <body>
                <h1>Your Order has been Cancelled</h1>
                <p>Hi ${data.firstName},</p>    
                <p>Your order #${data.orderId} has been successfully cancelled. If you have any questions, please contact our support team.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Your Order has been Cancelled",
            `Hi ${data.firstName+" "+data.lastName},\n\nYour order #${data.orderId} has been successfully cancelled. If you have any questions, please contact our support team.`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue('ORDER_NOTIFICATION.ORDER_CANCELLATION_FAILED', async (data) =>
    {
        const emailHtmlTemplate=`<html>

            <body>
                <h1>Order Cancellation Failed</h1>
                <p>Hi ${data.firstName},</p>
                <p>We encountered an issue while cancelling your order #${data.orderId}. Our team is working to resolve this as quickly as possible.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Order Cancellation Failed",
            `Hi ${data.firstName+" "+data.lastName},\n\nWe encountered an issue while cancelling your order #${data.orderId}. Our team is working to resolve this as quickly as possible.`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue('REFUND_NOTIFICATION.RTO_REFUND', async (data) =>
    {
        const emailHtmlTemplate=`<html>

            <body>
                <h1>RTO Refund Processed</h1>
                <p>Hi ${data.firstName},</p>
                <p>Your RTO refund for order #${data.orderId} has been processed successfully. The amount of ₹${data.amount} will be credited to your original payment method shortly.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "RTO Refund Processed",
            `Hi ${data.firstName+" "+data.lastName},\n\nYour RTO refund for order #${data.orderId} has been processed successfully. The amount of ₹${data.amount} will be credited to your original payment method shortly.`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue('REFUND_NOTIFICATION.RTO_REFUND_FAILED', async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>
                <h1>RTO Refund Failed</h1>
                <p>Hi ${data.firstName},</p>
                <p>We encountered an issue while processing your RTO refund for order #${data.orderId}. Our team is working to resolve this as quickly as possible.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "RTO Refund Failed",
            `Hi ${data.firstName+" "+data.lastName},\n\nWe encountered an issue while processing your RTO refund for order #${data.orderId}. Our team is working to resolve this as quickly as possible.`,
            emailHtmlTemplate
        );  
    });

    subscribeToQueue('REFUND_NOTIFICATION.ADMIN_REFUND', async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>
                <h1>Refund Processed</h1>
                <p>Hi ${data.firstName},</p>
                <p>The refund for order #${data.orderId} has been processed successfully. The amount of ₹${data.amount} will be credited to the customer's original payment method shortly.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Refund Processed",
            `Hi ${data.firstName+" "+data.lastName},\n\nThe refund for order #${data.orderId} has been processed successfully. The amount of ₹${data.amount} will be credited to the customer's original payment method shortly.`,
            emailHtmlTemplate
        );
    });

    subscribeToQueue('REFUND_NOTIFICATION.ADMIN_REFUND_FAILED', async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>
                <h1>Refund Failed</h1>
                <p>Hi ${data.firstName},</p>
                <p>We encountered an issue while processing the refund for order #${data.orderId}. Our team is working to resolve this as quickly as possible.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Refund Failed",
            `Hi ${data.firstName+" "+data.lastName},\n\nWe encountered an issue while processing the refund for order #${data.orderId}. Our team is working to resolve this as quickly as possible.`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue('REFUND_NOTIFICATION.RETURN_REFUND', async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>

                <h1>Return Refund Processed</h1>
                <p>Hi ${data.firstName},</p>
                <p>Your return refund for return ID #${data.returnId} has been processed successfully. The amount of ₹${data.amount} will be credited to your original payment method shortly.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Return Refund Processed",
            `Hi ${data.firstName+" "+data.lastName},\n\nYour return refund for return ID #${data.returnId} has been processed successfully. The amount of ₹${data.amount} will be credited to your original payment method shortly.`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue('REFUND_NOTIFICATION.RETURN_REFUND_FAILED', async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>
                <h1>Return Refund Failed</h1>
                <p>Hi ${data.firstName},</p>    
                <p>We encountered an issue while processing your return refund for return ID #${data.returnId}. Our team is working to resolve this as quickly as possible.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Return Refund Failed",
            `Hi ${data.firstName+" "+data.lastName},\n\nWe encountered an issue while processing your return refund for return ID #${data.returnId}. Our team is working to resolve this as quickly as possible.`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue('RETURN_NOTIFICATION.RETURN_SHIPMENT_CREATED', async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>
                <h1>Your Return Shipment has been Created!</h1>
                <p>Hi ${data.firstName},</p>
                <p>Your return shipment has been created successfully. We will notify you once we receive the returned items.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Your Return Shipment has been Created!",
            `Hi ${data.firstName+" "+data.lastName},\n\nYour return shipment has been created successfully. We will notify you once we receive the returned items.`,
            emailHtmlTemplate
        );
    });
    subscribeToQueue('RETURN_NOTIFICATION.RETURN_SHIPMENT_UPDATE_FAILED', async (data) =>
    {
        const emailHtmlTemplate=`<html>
            <body>
                <h1>Return Shipment Update Failed</h1>
                <p>Hi ${data.firstName},</p>
                <p>We encountered an issue while updating your return shipment. Our team is working to resolve this as quickly as possible.</p>
            </body>
            </html>`;
        await sendEmail(
            data.email,
            "Return Shipment Update Failed",
            `Hi ${data.firstName+" "+data.lastName},\n\nWe encountered an issue while updating your return shipment. Our team is working to resolve this as quickly as possible.`,
            emailHtmlTemplate
);
    });

    // Contact Form Email Notifications
    subscribeToQueue("CONTACT_NOTIFICATION.NEW_MESSAGE", async (data) => {
        const emailHtmlTemplate = `<html>
            <body>
                <h1>New Contact Message Received</h1>
                <p>Hello Admin,</p>
                <p>You have received a new message from the contact form:</p>
                <div style="border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 5px;">
                    <p><strong>Name:</strong> ${data.firstName} ${data.lastName}</p>
                    <p><strong>Email:</strong> ${data.email}</p>
                    <p><strong>Phone:</strong> ${data.phoneNumber || 'Not provided'}</p>
                    <p><strong>Message:</strong></p>
                    <p style="background: #f9f9f9; padding: 10px; border-left: 4px solid #1a472a;">${data.message}</p>
                </div>
                <p>Please respond to this inquiry as soon as possible.</p>
                <p>Best regards,<br/>Ayurwell System</p>
            </body>
        </html>`;
        
        await sendEmail(
            process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
            "New Contact Message - " + (data.subject || 'No Subject'),
            `New contact message received from ${data.firstName} ${data.lastName} (${data.email}):\n\n${data.message}`,
            emailHtmlTemplate
        );
    });

    subscribeToQueue("CONTACT_NOTIFICATION.NEW_REPLY", async (data) => {
        const emailHtmlTemplate = `<html>
            <body>
                <h1>Response to Your Message</h1>
                <p>Hi ${data.customerName},</p>
                <p>We have responded to your message. Here's our reply:</p>
                <div style="border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 5px; background: #f9f9f9;">
                    <p style="background: #fff; padding: 10px; border-left: 4px solid #1a472a;">${data.reply}</p>
                </div>
                <p>If you have any further questions, please don't hesitate to contact us.</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
            </body>
        </html>`;
        
        await sendEmail(
            data.customerEmail,
            "Response to Your Contact Message",
            `Hi ${data.customerName},\n\nWe have responded to your message. Here's our reply:\n\n${data.reply}\n\nIf you have any further questions, please don't hesitate to contact us.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    });

    // Return Request Email Notifications
    subscribeToQueue("RETURN_NOTIFICATION.RETURN_REQUEST_CREATED", async (data) => {
        const emailHtmlTemplate = `<html>
            <body>
                <h1>Return Request Received</h1>
                <p>Hi ${data.firstName},</p>
                <p>We have received your return request for order #${data.orderId}. Your return ID is: <strong>${data.returnId}</strong></p>
                <p>Our team will review your request and process it shortly. You can track the status of your return using the provided return ID.</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
            </body>
        </html>`;
        
        await sendEmail(
            data.email,
            "Return Request Received",
            `Hi ${data.firstName},\n\nWe have received your return request for order #${data.orderId}. Your return ID is: ${data.returnId}\n\nOur team will review your request and process it shortly. You can track the status of your return using the provided return ID.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    });

    subscribeToQueue("RETURN_REQUEST_CANCELLED_QUEUE", async (data) => {
        const emailHtmlTemplate = `<html>
            <body>
                <h1>Return Request Cancelled</h1>
                <p>Hi ${data.firstName},</p>
                <p>Your return request #${data.returnId} for order #${data.orderId} has been cancelled as per your request.</p>
                <p>If you have any questions or need to initiate a new return, please contact our support team.</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
            </body>
        </html>`;
        
        await sendEmail(
            data.email,
            "Return Request Cancelled",
            `Hi ${data.firstName},\n\nYour return request #${data.returnId} for order #${data.orderId} has been cancelled as per your request.\n\nIf you have any questions or need to initiate a new return, please contact our support team.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    });

    // Refund Process Email Notifications
    subscribeToQueue("REFUND.INITIATED", async (data) => {
        const emailHtmlTemplate = `<html>
            <body>
                <h1>Refund Process Initiated</h1>
                <p>Hi ${data.firstName},</p>
                <p>We have initiated the refund process for your order #${data.orderId}. The refund amount is <strong>₹${data.amount}</strong></p>
                <p>The refund will be processed within 5-7 business days and credited to your original payment method.</p>
                <p>You will receive another notification once the refund is completed.</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
            </body>
        </html>`;
        
        await sendEmail(
            data.email,
            "Refund Process Initiated",
            `Hi ${data.firstName},\n\nWe have initiated the refund process for your order #${data.orderId}. The refund amount is ₹${data.amount}\n\nThe refund will be processed within 5-7 business days and credited to your original payment method.\n\nYou will receive another notification once the refund is completed.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    });

    subscribeToQueue("REFUND.SUCCESS", async (data) => {
        const emailHtmlTemplate = `<html>
            <body>
                <h1>Refund Processed Successfully</h1>
                <p>Hi ${data.firstName},</p>
                <p>Your refund for order #${data.orderId} has been processed successfully!</p>
                <p><strong>Refund Amount:</strong> ₹${data.amount}</p>
                <p><strong>Refund ID:</strong> ${data.refundId}</p>
                <p>The amount has been credited to your original payment method. Please allow 3-5 business days for the amount to reflect in your account.</p>
                <p>Thank you for your patience during this process.</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
            </body>
        </html>`;
        
        await sendEmail(
            data.email,
            "Refund Processed Successfully",
            `Hi ${data.firstName},\n\nYour refund for order #${data.orderId} has been processed successfully!\n\nRefund Amount: ₹${data.amount}\nRefund ID: ${data.refundId}\n\nThe amount has been credited to your original payment method. Please allow 3-5 business days for the amount to reflect in your account.\n\nThank you for your patience during this process.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    });

    subscribeToQueue("REFUND.FAILED", async (data) => {
        const emailHtmlTemplate = `<html>
            <body>
                <h1>Refund Processing Failed</h1>
                <p>Hi ${data.firstName},</p>
                <p>We encountered an issue while processing your refund for order #${data.orderId}.</p>
                <p><strong>Refund Amount:</strong> ₹${data.amount}</p>
                <p>Our team has been notified and is working to resolve this issue as quickly as possible.</p>
                <p>You will receive another notification once the issue is resolved.</p>
                <p>We apologize for any inconvenience caused.</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
            </body>
        </html>`;
        
        await sendEmail(
            data.email,
            "Refund Processing Failed",
            `Hi ${data.firstName},\n\nWe encountered an issue while processing your refund for order #${data.orderId}.\n\nRefund Amount: ₹${data.amount}\n\nOur team has been notified and is working to resolve this issue as quickly as possible.\n\nYou will receive another notification once the issue is resolved.\n\nWe apologize for any inconvenience caused.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    });

    // Additional Error Notifications
    subscribeToQueue("SHIPMENT_NOTIFICATION.SHIPMENT_CANCELLED", async (data) => {
        const emailHtmlTemplate = `<html>
            <body>
                <h1>Shipment Cancelled</h1>
                <p>Hi ${data.firstName},</p>
                <p>Your shipment for order #${data.orderId} has been cancelled due to unforeseen circumstances.</p>
                <p>Our team is working to arrange an alternative shipment for you.</p>
                <p>You will receive another notification once the new shipment is created.</p>
                <p>We apologize for any inconvenience caused.</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
            </body>
        </html>`;
        
        await sendEmail(
            data.email,
            "Shipment Cancelled",
            `Hi ${data.firstName},\n\nYour shipment for order #${data.orderId} has been cancelled due to unforeseen circumstances.\n\nOur team is working to arrange an alternative shipment for you.\n\nYou will receive another notification once the new shipment is created.\n\nWe apologize for any inconvenience caused.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    });

    subscribeToQueue("RETURN_REQUEST_ERROR_QUEUE", async (data) => {
        const emailHtmlTemplate = `<html>
            <body>
                <h1>Return Request Error</h1>
                <p>Hi ${data.firstName},</p>
                <p>We encountered an error while processing your return request for order #${data.orderId}.</p>
                <p>Please try again after some time or contact our support team for assistance.</p>
                <p>We apologize for any inconvenience caused.</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
            </body>
        </html>`;
        
        await sendEmail(
            data.email,
            "Return Request Error",
            `Hi ${data.firstName},\n\nWe encountered an error while processing your return request for order #${data.orderId}.\n\nPlease try again after some time or contact our support team for assistance.\n\nWe apologize for any inconvenience caused.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    });

    subscribeToQueue("COD_SHIPMENT_ERROR_QUEUE", async (data) => {
        const emailHtmlTemplate = `<html>
            <body>
                <h1>COD Shipment Error</h1>
                <p>Hi ${data.firstName},</p>
                <p>We encountered an issue while creating shipment for your COD order #${data.orderId}.</p>
                <p>Our team is working to resolve this issue as quickly as possible.</p>
                <p>You will receive another notification once the shipment is created.</p>
                <p>We apologize for any inconvenience caused.</p>
                <p>Best regards,<br/>The Ayurwell Team</p>
            </body>
        </html>`;
        
        await sendEmail(
            data.email,
            "COD Shipment Error",
            `Hi ${data.firstName},\n\nWe encountered an issue while creating shipment for your COD order #${data.orderId}.\n\nOur team is working to resolve this issue as quickly as possible.\n\nYou will receive another notification once the shipment is created.\n\nWe apologize for any inconvenience caused.\n\nBest regards,\nThe Ayurwell Team`,
            emailHtmlTemplate
        );
    });

}