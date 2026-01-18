// Email Testing Utility for Ayurwell
// This helps verify email configuration and test templates

import sendEmail from './email.js';
import { createWelcomeEmail, createPasswordResetEmail, createOrderConfirmationEmail } from './emailTemplates.js';

class EmailTester {
    constructor() {
        this.testResults = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        console.log(logEntry);
        this.testResults.push({ timestamp, message, type });
    }

    async testBasicEmail() {
        this.log('Testing basic email functionality...');
        try {
            const result = await sendEmail(
                process.env.TEST_EMAIL || process.env.EMAIL_USER,
                'Email Test - Ayurwell',
                'This is a test email from Ayurwell system.',
                '<h1>Test Email</h1><p>If you receive this email, the configuration is working correctly.</p>'
            );
            this.log('✅ Basic email test successful', 'success');
            return { success: true, result };
        } catch (error) {
            this.log(`❌ Basic email test failed: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async testWelcomeEmail() {
        this.log('Testing welcome email template...');
        try {
            const { subject, html, text } = createWelcomeEmail('Test', 'User');
            const result = await sendEmail(
                process.env.TEST_EMAIL || process.env.EMAIL_USER,
                subject,
                text,
                html
            );
            this.log('✅ Welcome email test successful', 'success');
            return { success: true, result };
        } catch (error) {
            this.log(`❌ Welcome email test failed: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async testPasswordResetEmail() {
        this.log('Testing password reset email template...');
        try {
            const { subject, html, text } = createPasswordResetEmail('Test', 'https://ayurwell.com/reset-password?token=test-token-123');
            const result = await sendEmail(
                process.env.TEST_EMAIL || process.env.EMAIL_USER,
                subject,
                text,
                html
            );
            this.log('✅ Password reset email test successful', 'success');
            return { success: true, result };
        } catch (error) {
            this.log(`❌ Password reset email test failed: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async testMultipleRecipients() {
        this.log('Testing multiple email recipients...');
        try {
            const recipients = [
                process.env.TEST_EMAIL || process.env.EMAIL_USER,
                'test@example.com' // This will fail but helps test validation
            ].filter(email => email && email !== 'test@example.com');

            if (recipients.length === 0) {
                this.log('⚠️ No valid recipients for multiple email test', 'warning');
                return { success: false, error: 'No valid recipients' };
            }

            const result = await sendEmail(
                recipients,
                'Multiple Recipients Test - Ayurwell',
                'Testing email to multiple recipients.',
                '<h1>Multiple Recipients Test</h1><p>This email was sent to multiple recipients.</p>'
            );
            this.log('✅ Multiple recipients test successful', 'success');
            return { success: true, result };
        } catch (error) {
            this.log(`❌ Multiple recipients test failed: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async runAllTests() {
        this.log('🚀 Starting comprehensive email service tests...');
        this.log('================================================');
        
        const tests = [
            { name: 'Basic Email', fn: () => this.testBasicEmail() },
            { name: 'Welcome Email', fn: () => this.testWelcomeEmail() },
            { name: 'Password Reset Email', fn: () => this.testPasswordResetEmail() },
            { name: 'Multiple Recipients', fn: () => this.testMultipleRecipients() }
        ];

        const results = {};
        let passedTests = 0;
        let totalTests = tests.length;

        for (const test of tests) {
            this.log(`\n📧 Running ${test.name} Test...`);
            try {
                const result = await test.fn();
                results[test.name] = result;
                if (result.success) {
                    passedTests++;
                }
            } catch (error) {
                results[test.name] = { success: false, error: error.message };
                this.log(`❌ ${test.name} test failed: ${error.message}`, 'error');
            }
        }

        this.log('================================================');
        this.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed`);
        this.log('================================================');

        // Generate report
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: totalTests,
                passed: passedTests,
                failed: totalTests - passedTests,
                successRate: `${Math.round((passedTests / totalTests) * 100)}%`
            },
            results,
            logs: this.testResults
        };

        if (passedTests === totalTests) {
            this.log('🎉 All email tests passed! Your email service is fully functional.', 'success');
        } else {
            this.log('⚠️ Some email tests failed. Please check the configuration.', 'warning');
        }

        return report;
    }

    generateConfigurationReport() {
        this.log('📋 Generating email configuration report...');
        
        const config = {
            environment: process.env.NODE_ENV || 'development',
            emailService: 'gmail',
            hasRequiredEnvVars: {
                EMAIL_USER: !!process.env.EMAIL_USER,
                CLIENT_ID: !!process.env.CLIENT_ID,
                CLIENT_SECRET: !!process.env.CLIENT_SECRET,
                REFRESH_TOKEN: !!process.env.REFRESH_TOKEN,
                FRONTEND_URL: !!process.env.FRONTEND_URL
            },
            testEmail: process.env.TEST_EMAIL || 'Not configured'
        };

        const missingVars = Object.entries(config.hasRequiredEnvVars)
            .filter(([key, value]) => !value)
            .map(([key]) => key);

        const report = `
Email Configuration Report
========================
Environment: ${config.environment}
Email Service: ${config.emailService}
Test Email: ${config.testEmail}

Required Environment Variables:
${Object.entries(config.hasRequiredEnvVars)
    .map(([key, value]) => `${key}: ${value ? '✅' : '❌'}`)
    .join('\n')}

${missingVars.length > 0 ? `
⚠️ Missing Environment Variables:
${missingVars.map(varName => `- ${varName}`).join('\n')}

Please set these environment variables in your .env file:
${missingVars.map(varName => `${varName}=your_value_here`).join('\n')}
` : `
✅ All required environment variables are configured!
`}

Next Steps:
1. If all environment variables are set, run: node -e "require('./src/notification/emailTester.js').runAllTests()"
2. Check test email inbox for test emails
3. Verify email content and rendering
4. Test with actual email addresses used in production
        `.trim();

        console.log(report);
        return { config, missingVars, report };
    }
}

// Export for use in testing
export default EmailTester;

// Allow running tests directly from command line
if (require.main === module) {
    const tester = new EmailTester();
    
    const command = process.argv[2];
    
    switch (command) {
        case 'config':
            tester.generateConfigurationReport();
            break;
        case 'test':
            tester.runAllTests().then(report => {
                // Save report to file for analysis
                const fs = require('fs');
                fs.writeFileSync('email-test-report.json', JSON.stringify(report, null, 2));
                console.log('\n📄 Test report saved to: email-test-report.json');
            });
            break;
        default:
            console.log(`
Email Testing Utility for Ayurwell
Usage:
  node emailTester.js config    - Show configuration status
  node emailTester.js test      - Run comprehensive email tests

Examples:
  node emailTester.js config
  node emailTester.js test
            `);
    }
}