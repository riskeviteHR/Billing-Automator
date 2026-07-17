const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Local storage path for admin credentials (same trust model as the license file)
const ADMIN_PATH = path.join(os.homedir(), '.ca_invoice_admin.json');
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';

const hashPassword = (password, salt) => crypto.scryptSync(String(password), salt, 64).toString('hex');

const readAdmin = () => {
    try {
        const parsed = JSON.parse(fs.readFileSync(ADMIN_PATH, 'utf8'));
        if (parsed && parsed.username && parsed.salt && parsed.hash) return parsed;
    } catch (e) { /* missing or corrupt — caller decides */ }
    return null;
};

const writeAdmin = (username, password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const record = { username: String(username), salt, hash: hashPassword(password, salt) };
    fs.writeFileSync(ADMIN_PATH, JSON.stringify(record, null, 2), 'utf8');
    return record;
};

const ensureAdminFile = () => {
    if (!readAdmin()) writeAdmin(DEFAULT_USERNAME, DEFAULT_PASSWORD);
};

const verifyCredentials = (username, password) => {
    const admin = readAdmin();
    if (!admin) return false;
    // Always compute the scrypt so a wrong username costs the same time as a wrong password.
    const candidate = Buffer.from(hashPassword(password || '', admin.salt), 'hex');
    const stored = Buffer.from(admin.hash, 'hex');
    const passwordOk = candidate.length === stored.length && crypto.timingSafeEqual(stored, candidate);
    return admin.username === String(username || '') && passwordOk;
};

const changeCredentials = ({ currentPassword, newUsername, newPassword }) => {
    const admin = readAdmin();
    if (!admin) throw new Error('Admin credentials are not initialised.');
    if (!verifyCredentials(admin.username, currentPassword)) throw new Error('Current password is incorrect.');
    const username = String(newUsername || admin.username).trim() || admin.username;
    const password = String(newPassword || '');
    if (password.length < 4) throw new Error('New password must be at least 4 characters.');
    writeAdmin(username, password);
    return { username };
};

// Passkey mode: a single secret grants access. Backward compatible — the stored hash
// (originally derived from the default password) verifies against the same typed value.
const verifyPasskey = (passkey) => {
    const admin = readAdmin();
    if (!admin) return false;
    const candidate = Buffer.from(hashPassword(passkey || '', admin.salt), 'hex');
    const stored = Buffer.from(admin.hash, 'hex');
    return candidate.length === stored.length && crypto.timingSafeEqual(stored, candidate);
};

const changePasskey = ({ currentPasskey, newPasskey }) => {
    const admin = readAdmin();
    if (!admin) throw new Error('Passkey is not initialised.');
    if (!verifyPasskey(currentPasskey)) throw new Error('Current passkey is incorrect.');
    const passkey = String(newPasskey || '');
    if (passkey.length < 4) throw new Error('New passkey must be at least 4 characters.');
    writeAdmin(admin.username || 'admin', passkey);
    return { success: true };
};

module.exports = { ensureAdminFile, readAdmin, verifyCredentials, changeCredentials, verifyPasskey, changePasskey };
