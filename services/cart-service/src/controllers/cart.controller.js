const CartService = require('../services/cart.service');

class CartController {
    static async addToCart(req, res, next) {
        try {
            const { userId, productId, quantity } = req.body;
            
            if (!userId || !productId || !quantity) {
                return res.status(400).json({ success: false, message: 'Missing userId, productId or quantity' });
            }

            const parsedQuantity = parseInt(quantity, 10);
            if (isNaN(parsedQuantity) || parsedQuantity < 1) {
                 return res.status(400).json({ success: false, message: 'Quantity must be an integer greater than 0' });
            }

            const cart = await CartService.addToCart(userId, productId, parsedQuantity);
            return res.status(200).json({ success: true, data: cart });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = CartController;
