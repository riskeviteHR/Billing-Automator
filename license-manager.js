const fs = require('fs');
const path = require('path');
const { machineIdSync } = require('node-machine-id');
const axios = require('axios');
const os = require('os');

// Google Apps Script Deployment URL
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyMql-hJ91ppiYe5zPChRoIkeMHTXgwdTXDG7Eo2sohRyzr0NXcP_T0FCQ360g0Fuhx/exec';
const LICENSE_SHEET_ID = '1Hy_DYJXr7A5tBkG3ePGtHFpHhvs6E_pckk7JR-tN0jw';

// Local storage path for license info
const LICENSE_SAVE_PATH = path.join(os.homedir(), '.ca_invoice_license.json');

const getMachineID = () => {
    try {
        return machineIdSync();
    } catch (err) {
        console.error('Failed to get machine Id:', err);
        return 'fallback-machine-id';
    }
};

const readLicense = () => {
    if (fs.existsSync(LICENSE_SAVE_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(LICENSE_SAVE_PATH, 'utf8'));
        } catch (e) {
            return null;
        }
    }
    return null;
};

const saveLicense = (data) => {
    fs.writeFileSync(LICENSE_SAVE_PATH, JSON.stringify(data, null, 2), 'utf8');
};

const isExpired = (expiry) => {
    if (!expiry) return true;
    const expiryDate = new Date(expiry);
    if (Number.isNaN(expiryDate.getTime())) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);
    return expiryDate < today;
};

const buildPayload = (action, key) => ({
    action,
    key,
    machineId: getMachineID(),
    sheetId: LICENSE_SHEET_ID,
    product: 'invoice'
});

const normalizeServerResult = (result) => {
    if (!result || !result.success) return result || { success: false, error: 'No response from licensing server.' };
    if (isExpired(result.expiry)) {
        return { success: false, error: 'License key has expired.' };
    }
    return result;
};

const verifyWithServer = async (key) => {
    try {
        const response = await axios.post(GAS_API_URL, buildPayload('verify', key));
        return normalizeServerResult(response.data);
    } catch (err) {
        console.error('Server verification error:', err);
        return { success: false, error: 'Cannot connect to licensing server.' };
    }
};

const activateWithServer = async (key) => {
    try {
        const response = await axios.post(GAS_API_URL, buildPayload('activate', key));
        return normalizeServerResult(response.data);
    } catch (err) {
        return { success: false, error: 'Activation server unreachable. Check internet connection.' };
    }
};

module.exports = {
    getMachineID,
    readLicense,
    saveLicense,
    isExpired,
    verifyWithServer,
    activateWithServer
};
