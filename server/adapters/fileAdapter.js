/**
 * File Adapter - Simulates file system operations
 */

const fileAdapter = {
    name: 'System',

    // Simulate file deletion
    async execute(action) {
        console.log(`🗑️ [FILE ADAPTER] Executing file deletion:`);
        console.log(`   Path: ${action.metadata?.path || 'Unknown'}`);
        console.log(`   Type: ${action.metadata?.type || 'file'}`);

        // Simulate operation delay
        await new Promise(resolve => setTimeout(resolve, 300));

        return {
            success: true,
            message: `File/Folder deleted: ${action.metadata?.path}`,
            executedAt: new Date().toISOString()
        };
    },

    // Cancel file deletion (soft delete recovery)
    async cancel(action) {
        console.log(`🚫 [FILE ADAPTER] File deletion cancelled`);
        console.log(`   Preserved: ${action.metadata?.path || 'Unknown'}`);

        return {
            success: true,
            message: 'File deletion prevented - file preserved',
            cancelledAt: new Date().toISOString()
        };
    }
};

module.exports = fileAdapter;
