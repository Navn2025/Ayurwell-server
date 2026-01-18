// Email Template Utility for Ayurwell
// This provides consistent email styling and structure

export const createEmailTemplate = (content, title = "Ayurwell") => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
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
            margin: 20px 0;
        }
        
        .header {
            background: linear-gradient(135deg, #1a472a 0%, #2d5a3d 100%);
            color: #fff;
            padding: 30px 40px;
            text-align: center;
        }
        
        .header h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 700;
            font-family: "Georgia", serif;
        }
        
        .header .tagline {
            margin: 8px 0 0 0;
            font-size: 16px;
            opacity: 0.9;
            font-weight: 300;
        }
        
        .content {
            padding: 40px;
        }
        
        .content h2 {
            color: #1a472a;
            font-size: 24px;
            margin-bottom: 20px;
            font-weight: 600;
        }
        
        .content h3 {
            color: #2d5a3d;
            font-size: 20px;
            margin-bottom: 15px;
            font-weight: 500;
        }
        
        .content p {
            margin-bottom: 16px;
            font-size: 15px;
        }
        
        .btn {
            display: inline-block;
            padding: 12px 28px;
            background: linear-gradient(135deg, #1a472a 0%, #2d5a3d 100%);
            color: #ffffff;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 15px;
            transition: all 0.3s ease;
            margin: 20px 0;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(26, 71, 42, 0.3);
        }
        
        .info-box {
            background-color: #f0f8f0;
            border-left: 4px solid #1a472a;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .warning-box {
            background-color: #fff8f0;
            border-left: 4px solid #ff9800;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .error-box {
            background-color: #fff5f5;
            border-left: 4px solid #e53e3e;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .success-box {
            background-color: #f0fff4;
            border-left: 4px solid #48bb78;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
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
        
        .footer .social-links {
            margin-top: 15px;
        }
        
        .footer .social-links a {
            color: rgba(255, 255, 255, 0.8);
            text-decoration: none;
            margin: 0 10px;
            font-size: 14px;
        }
        
        .footer .social-links a:hover {
            color: #fff;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        
        .data-table th,
        .data-table td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .data-table th {
            background-color: #f8f9fa;
            font-weight: 600;
            color: #1a472a;
        }
        
        @media only screen and (max-width: 600px) {
            body {
                padding: 10px;
            }
            
            .header {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 24px;
            }
            
            .content {
                padding: 25px;
            }
            
            .footer {
                padding: 20px;
            }
            
            .data-table th,
            .data-table td {
                padding: 8px 10px;
                font-size: 14px;
            }
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
            ${content}
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Ayurwell. All rights reserved.</p>
            <p>100% Authentic Ayurvedic Products | Trusted by Thousands</p>
            <div class="social-links">
                <a href="#">Website</a> | 
                <a href="#">Contact</a> | 
                <a href="#">Privacy Policy</a>
            </div>
        </div>
    </div>
</body>
</html>`;
};

export const createWelcomeEmail = (firstName, lastName) => {
    const content = `
        <h2>Welcome to Ayurwell, ${firstName}! 👋</h2>
        <p>Thank you for registering with us. We're excited to have you on board and begin your wellness journey with authentic Ayurvedic products.</p>
        <div class="success-box">
            <h3>Your Account Benefits:</h3>
            <p>✅ Access to 100% authentic Ayurvedic products<br>
            ✅ Fast and secure delivery nationwide<br>
            ✅ Exclusive member discounts and offers<br>
            ✅ Personalized wellness recommendations</p>
        </div>
        <p>To get started, you can:</p>
        <ul>
            <li><a href="${process.env.FRONTEND_URL}/shop" class="btn">Start Shopping</a></li>
            <li>Browse our collection of premium Ayurvedic products</li>
            <li>Complete your profile for personalized recommendations</li>
        </ul>
        <p>If you have any questions, our support team is always here to help you.</p>
        <p>Best regards,<br>The Ayurwell Team</p>
    `;
    
    return {
        subject: "Welcome to Ayurwell! 🌿",
        html: createEmailTemplate(content, "Welcome to Ayurwell"),
        text: `Hello ${firstName},\n\nThank you for registering with Ayurwell. We're excited to have you on board!\n\nYour Account Benefits:\n✅ Access to 100% authentic Ayurvedic products\n✅ Fast and secure delivery nationwide\n✅ Exclusive member discounts and offers\n✅ Personalized wellness recommendations\n\nStart shopping at: ${process.env.FRONTEND_URL}/shop\n\nBest regards,\nThe Ayurwell Team`
    };
};

export const createPasswordResetEmail = (firstName, resetLink) => {
    const content = `
        <h2>Password Reset Request 🔐</h2>
        <p>Hi ${firstName},</p>
        <p>We received a request to reset your password for your Ayurwell account. No worries, it happens to the best of us!</p>
        <div class="warning-box">
            <h3>Security Notice:</h3>
            <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
            <p>This link will expire in <strong>15 minutes</strong> for your security.</p>
        </div>
        <p>To reset your password, click the button below:</p>
        <div style="text-align: center;">
            <a href="${resetLink}" class="btn">Reset Password</a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <div class="info-box">
            <code style="word-break: break-all; background: #f1f3f4; padding: 10px; border-radius: 4px; display: block;">${resetLink}</code>
        </div>
        <p>If you continue to have issues, please contact our support team.</p>
        <p>Best regards,<br>The Ayurwell Team</p>
    `;
    
    return {
        subject: "Password Reset Request - Ayurwell",
        html: createEmailTemplate(content, "Password Reset Request"),
        text: `Hi ${firstName},\n\nWe received a request to reset your password for your Ayurwell account. Use the link below to set a new password:\n\n${resetLink}\n\nThis link will expire in 15 minutes for your security.\n\nIf you didn't request this password reset, please ignore this email. Your password will remain unchanged.\n\nBest regards,\nThe Ayurwell Team`
    };
};

export const createOrderConfirmationEmail = (firstName, orderId, amount, items) => {
    const content = `
        <h2>Order Confirmed! 🎉</h2>
        <p>Hi ${firstName},</p>
        <p>Thank you for your order! We're excited to prepare your authentic Ayurvedic products for delivery.</p>
        <div class="info-box">
            <h3>Order Details:</h3>
            <table class="data-table">
                <tr><td><strong>Order ID:</strong></td><td>#${orderId}</td></tr>
                <tr><td><strong>Total Amount:</strong></td><td>₹${amount}</td></tr>
                <tr><td><strong>Payment Status:</strong></td><td>✅ Paid Successfully</td></tr>
            </table>
        </div>
        <h3>Order Items:</h3>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Price</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.quantity}</td>
                        <td>₹${item.price}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <h3>What happens next?</h3>
        <p>1. <strong>Processing (1-2 hours):</strong> We'll carefully prepare your order</p>
        <p>2. <strong>Shipped (1-2 days):</strong> You'll receive tracking information</p>
        <p>3. <strong>Delivered (3-5 days):</strong> Enjoy your Ayurvedic wellness journey!</p>
        <p>Track your order status anytime at <a href="${process.env.FRONTEND_URL}/orders/${orderId}">Your Orders</a></p>
        <p>Thank you for choosing Ayurwell for your wellness needs!</p>
        <p>Best regards,<br>The Ayurwell Team</p>
    `;
    
    return {
        subject: `Order Confirmed #${orderId} - Ayurwell`,
        html: createEmailTemplate(content, "Order Confirmed"),
        text: `Hi ${firstName},\n\nThank you for your order! We're excited to prepare your authentic Ayurvedic products for delivery.\n\nOrder Details:\nOrder ID: #${orderId}\nTotal Amount: ₹${amount}\nPayment Status: Paid Successfully\n\nTrack your order at: ${process.env.FRONTEND_URL}/orders/${orderId}\n\nThank you for choosing Ayurwell!\n\nBest regards,\nThe Ayurwell Team`
    };
};