#!/usr/bin/env node

/**
 * Debug script to check Razorpay payment status
 * Usage: node debug-razorpay-payment.js <payment_id>
 */

import Razorpay from 'razorpay';
import dotenv from 'dotenv';

dotenv.config();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function debugPayment(paymentId) {
    if (!paymentId) {
        console.error('Please provide a Razorpay payment ID');
        process.exit(1);
    }

    try {
        console.log(`Fetching payment details for: ${paymentId}`);
        
        const payment = await razorpay.payments.fetch(paymentId);
        
        console.log('\n=== PAYMENT DETAILS ===');
        console.log('ID:', payment.id);
        console.log('Status:', payment.status);
        console.log('Amount:', payment.amount, 'paise (₹' + (payment.amount / 100) + ')');
        console.log('Currency:', payment.currency);
        console.log('Captured:', payment.captured);
        console.log('Refunded:', payment.refunded);
        console.log('Refund Amount:', payment.refund_amount || 0, 'paise');
        console.log('Created At:', new Date(payment.created_at * 1000).toISOString());
        
        console.log('\n=== REFUND ELIGIBILITY ===');
        if (payment.status !== 'captured') {
            console.log('❌ Payment not captured. Current status:', payment.status);
        } else if (payment.refunded) {
            console.log('❌ Payment already refunded. Amount:', payment.refund_amount);
        } else {
            console.log('✅ Payment is eligible for refund');
            console.log('Maximum refundable amount:', payment.amount, 'paise');
        }
        
        // Test refund with minimum amount
        console.log('\n=== TEST REFUND (₹1) ===');
        try {
            const testRefund = await razorpay.payments.refund(paymentId, {
                amount: 100, // ₹1 in paise
                speed: 'normal',
                notes: {
                    test: 'debug_script',
                    timestamp: new Date().toISOString()
                }
            });
            
            console.log('✅ Test refund successful');
            console.log('Refund ID:', testRefund.id);
            console.log('Refund Amount:', testRefund.amount, 'paise');
            
            // Immediately cancel the test refund if possible
            console.log('\n⚠️  NOTE: Test refund was created. You may need to cancel it manually.');
            
        } catch (refundError) {
            console.log('❌ Test refund failed:');
            console.log('Error:', JSON.stringify(refundError.error, null, 2));
        }
        
    } catch (error) {
        console.error('❌ Error fetching payment:');
        console.log('Status:', error.statusCode);
        console.log('Error:', JSON.stringify(error.error, null, 2));
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    debugPayment(process.argv[2]);
}

export { debugPayment };