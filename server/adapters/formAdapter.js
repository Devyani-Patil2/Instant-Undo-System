/**
 * Form Adapter - Simulates generic form submissions
 */

const formAdapter = {
    name: 'WebForm',

    // Simulate form submission
    async execute(action) {
        console.log(`📝 [FORM ADAPTER] Executing form submission:`);
        console.log(`   Form: ${action.metadata?.formName || 'Unknown Form'}`);
        console.log(`   Action: ${action.metadata?.action || 'submit'}`);
        console.log(`   URL: ${action.metadata?.url || 'N/A'}`);

        // Simulate submission delay
        await new Promise(resolve => setTimeout(resolve, 400));

        return {
            success: true,
            message: `Form submitted: ${action.metadata?.formName}`,
            executedAt: new Date().toISOString()
        };
    },

    // Cancel form submission
    async cancel(action) {
        console.log(`🚫 [FORM ADAPTER] Form submission cancelled`);
        console.log(`   Form: ${action.metadata?.formName || 'Unknown Form'}`);

        return {
            success: true,
            message: 'Form submission prevented',
            cancelledAt: new Date().toISOString()
        };
    }
};

module.exports = formAdapter;
