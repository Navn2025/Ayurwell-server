import dotenv from "dotenv";
dotenv.config();
import {createTransport, getTestMessageUrl} from 'nodemailer';

// Validate required environment variables
const requiredEnvVars = ['EMAIL_USER', 'CLIENT_ID', 'CLIENT_SECRET', 'REFRESH_TOKEN'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('Missing required email environment variables:', missingVars.join(', '));
    console.error('Email functionality will not work properly without these variables.');
    // In development, you might want to throw an error
    if (process.env.NODE_ENV === 'production') {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
}

const transporter = createTransport({
    service: 'gmail',
    auth: {
        type: 'OAuth2',
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
    },
    // Enhanced configuration
    pool: true, // Use connection pooling
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000, // Rate limiting
    rateLimit: 5, // Max 5 emails per second
});

// Verify the connection configuration
transporter.verify((error, success) =>
{
    if (error)
    {
        console.error('Error connecting to email server:', error);
    } else
    {
        console.log('Email server is ready to send messages');
    }
});

// Function to send email with enhanced error handling and retry logic
const sendEmailWithRetry = async (to, subject, text, html, retryCount = 3) => {
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            const info = await transporter.sendMail({
                from: `"AyurWell" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                text,
                html,
                priority: 'normal',
                headers: {
                    'X-Mailer': 'AyurWell NodeMailer',
                    'X-Priority': '3'
                }
            });

            console.log(`Email sent successfully (attempt ${attempt}): ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error(`Email send attempt ${attempt} failed:`, error);
            
            if (attempt === retryCount) {
                // All retries failed
                console.error('All email send attempts failed. Last error:', error);
                throw new Error(`Failed to send email after ${retryCount} attempts: ${error.message}`);
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
};
// Enhanced email function with validation and error handling
const sendEmail = async (to, subject, text, html) => {
    // Input validation
    if (!to || !subject || (!text && !html)) {
        throw new Error('Missing required email parameters: to, subject, and either text or html');
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof to === 'string' && !emailRegex.test(to)) {
        throw new Error(`Invalid email address: ${to}`);
    }
    
    // Multiple email addresses validation
    if (Array.isArray(to)) {
        const invalidEmails = to.filter(email => !emailRegex.test(email));
        if (invalidEmails.length > 0) {
            throw new Error(`Invalid email addresses: ${invalidEmails.join(', ')}`);
        }
    }

    try {
        const result = await sendEmailWithRetry(to, subject, text, html);
        console.log('Message sent: %s', result.messageId);
        console.log('Preview URL: %s', getTestMessageUrl(result));
        return result;
    } catch (error) {
        console.error('Error sending email:', error);
        // In production, you might want to use a proper logging service
        // or send alerts to monitoring systems
        throw error;
    }
};

export default sendEmail;