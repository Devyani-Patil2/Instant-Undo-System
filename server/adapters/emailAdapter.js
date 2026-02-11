/**
 * Email Adapter - Simulates SMTP email operations
 */

const emailAdapter = {
    name: 'Gmail',

    // Simulate sending an email
    async execute(action) {
        console.log(`📧 [EMAIL ADAPTER] Executing email send:`);
        console.log(`   To: ${action.metadata?.to || 'Unknown'}`);
        console.log(`   Subject: ${action.metadata?.subject || 'No Subject'}`);

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            success: true,
            message: `Email sent to ${action.metadata?.to}`,
            executedAt: new Date().toISOString()
        };
    },

    // Cancel/Undo the email (just prevent sending)
    async cancel(action) {
        console.log(`🚫 [EMAIL ADAPTER] Email cancelled - not sent`);
        console.log(`   Was going to: ${action.metadata?.to || 'Unknown'}`);

        return {
            success: true,
            message: 'Email sending prevented',
            cancelledAt: new Date().toISOString()
        };
    }
};

module.exports = emailAdapter;
