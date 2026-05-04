const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const {
    login,
    changePassword,
    logout,
    forgotPassword,
    resetPassword,
    requestUnlock,
    unlockAccount,
} = require('./auth.controller');

router.post('/login', login);
router.post('/change-password', authenticate, changePassword);
router.post('/logout', authenticate, logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/request-unlock', requestUnlock);
router.post('/unlock-account', unlockAccount);

module.exports = router;
