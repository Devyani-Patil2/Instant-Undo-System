/**
 * Firebase Configuration for INSTANT UNDO
 * Elvion Guard Engine v2.0
 */

const admin = require('firebase-admin');

let db = null;
let isConnected = false;

/**
 * Initialize Firebase with service account
 * @param {Object} serviceAccount - Firebase service account JSON object
 */
function initializeFirebase(serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        db = admin.firestore();
        isConnected = true;

        console.log('🔥 Firebase Connected Successfully');
        console.log(`   Project: ${serviceAccount.project_id}`);

        return true;
    } catch (error) {
        console.error('❌ Firebase Connection Failed:', error.message);
        console.log('   Falling back to in-memory storage...');
        isConnected = false;
        return false;
    }
}

/**
 * Get Firestore database instance
 */
function getDB() {
    return db;
}

/**
 * Check if Firebase is connected
 */
function isFirebaseConnected() {
    return isConnected;
}

module.exports = { initializeFirebase, getDB, isFirebaseConnected };
