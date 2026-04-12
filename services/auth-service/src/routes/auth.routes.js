const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

console.log('DEBUG: authController.register type:', typeof authController.register);
console.log('DEBUG: authController.login type:', typeof authController.login);

router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;
