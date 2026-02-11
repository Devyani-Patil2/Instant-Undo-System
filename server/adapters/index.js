/**
 * Adapter Registry - Central hub for all action adapters
 */

const emailAdapter = require('./emailAdapter');
const fileAdapter = require('./fileAdapter');
const gitAdapter = require('./gitAdapter');
const formAdapter = require('./formAdapter');

// Map action types to their adapters
const adapters = {
    'email': emailAdapter,
    'gmail': emailAdapter,
    'file': fileAdapter,
    'delete': fileAdapter,
    'git': gitAdapter,
    'github': gitAdapter,
    'push': gitAdapter,
    'form': formAdapter,
    'submit': formAdapter
};

// Get adapter by action type
function getAdapter(actionType) {
    const type = actionType?.toLowerCase() || 'form';
    return adapters[type] || formAdapter; // Default to form adapter
}

// Execute action through appropriate adapter
async function executeAction(action) {
    const adapter = getAdapter(action.type);
    return await adapter.execute(action);
}

// Cancel action through appropriate adapter
async function cancelAction(action) {
    const adapter = getAdapter(action.type);
    return await adapter.cancel(action);
}

// Get adapter name for logging
function getAdapterName(actionType) {
    const adapter = getAdapter(actionType);
    return adapter.name;
}

module.exports = {
    getAdapter,
    executeAction,
    cancelAction,
    getAdapterName
};
