/**
 * Git Adapter - Simulates Git operations
 */

const gitAdapter = {
    name: 'GitHub',

    // Simulate git push
    async execute(action) {
        console.log(`📤 [GIT ADAPTER] Executing git operation:`);
        console.log(`   Branch: ${action.metadata?.branch || 'Unknown'}`);
        console.log(`   Type: ${action.metadata?.type || 'push'}`);
        console.log(`   Force: ${action.metadata?.force || false}`);

        // Simulate operation delay
        await new Promise(resolve => setTimeout(resolve, 800));

        return {
            success: true,
            message: `Git ${action.metadata?.type || 'push'} to ${action.metadata?.branch} completed`,
            executedAt: new Date().toISOString()
        };
    },

    // Cancel git operation
    async cancel(action) {
        console.log(`🚫 [GIT ADAPTER] Git operation cancelled`);
        console.log(`   Branch preserved: ${action.metadata?.branch || 'Unknown'}`);

        return {
            success: true,
            message: 'Git operation prevented - no changes pushed',
            cancelledAt: new Date().toISOString()
        };
    }
};

module.exports = gitAdapter;
