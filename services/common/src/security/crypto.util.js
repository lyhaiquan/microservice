const crypto = require('crypto');

// Nên lấy từ environment variable trong production
const AES_KEY = process.env.AES_SECRET_KEY || crypto.randomBytes(32); 

/**
 * Encrypt a string using AES-256-GCM
 * @param {string} text 
 * @returns {object} { iv, ciphertext, authTag }
 */
function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(AES_KEY), iv);
    
    let ciphertext = cipher.update(text, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    return {
        iv: iv.toString('hex'),
        ciphertext,
        authTag
    };
}

/**
 * Decrypt a string using AES-256-GCM
 * @param {object} encryptedData { iv, ciphertext, authTag }
 * @returns {string} original text
 */
function decrypt(encryptedData) {
    if (!encryptedData || !encryptedData.iv || !encryptedData.ciphertext || !encryptedData.authTag) {
        return null;
    }
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm', 
        Buffer.from(AES_KEY), 
        Buffer.from(encryptedData.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

/**
 * Generate a deterministic hash for search/indexing (like email)
 * using SHA-256 and a per-user salt.
 * @param {string} value 
 * @param {string} salt 
 * @returns {string} hashed value
 */
function generateHmac(value, salt) {
    if (!value || !salt) return null;
    return crypto.createHmac('sha256', salt).update(value.toLowerCase()).digest('hex');
}

module.exports = {
    encrypt,
    decrypt,
    generateHmac
};
