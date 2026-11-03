import express from 'express';
import authRouter from './router/auth.route.js';
import boutiqueRouter from './router/boutique.route.js';
import familleRouter from './router/famille.route.js';
import categorieRouter from './router/categorie.route.js';
import sousCategorieRouter from './router/sousCategorie.route.js';
import productRouter from './router/product.route.js';
import productBoutiqueRouter from './router/productBoutique.route.js';
import cartRouter from './router/cart.route.js';
import orderRouter from './router/order.route.js';
import promotionRouter from './router/promotion.route.js';
import wishlistRouter from './router/wishlist.route.js';
import reviewRouter from './router/review.route.js';
import addressRouter from './router/address.route.js';
import recommandationRouter from './router/recommandation.route.js';
import shopRequestRouter from './router/shopRequest.route.js';
import shopOrderRouter from './router/shopOrder.route.js';
import paymentRouter from './router/payment.route.js';
import supportRouter from './router/support.route.js';
import sanctionRouter from './router/sanction.route.js';
import shopMarketingRouter from './router/marketing.route.js';
import campaignRouter from './router/campaign.route.js';
import { boostRouter, sponsoredRouter } from './router/boost.route.js';

const mainRouter = express.Router();


mainRouter.use('/auth', authRouter);
// Promotions, boosts et crédits d'une boutique : avant /shops/:id.
mainRouter.use('/shops', shopMarketingRouter);
mainRouter.use('/shops', boutiqueRouter);
mainRouter.use('/shop-requests', shopRequestRouter);
mainRouter.use('/familles', familleRouter);
mainRouter.use('/categories', categorieRouter);
mainRouter.use('/sous-categories', sousCategorieRouter);
mainRouter.use('/products', productRouter);
mainRouter.use('/product-boutiques', productBoutiqueRouter);
mainRouter.use('/cart', cartRouter);
mainRouter.use('/orders', orderRouter);
mainRouter.use('/shop-orders', shopOrderRouter);
mainRouter.use('/payments', paymentRouter);
mainRouter.use('/support', supportRouter);
mainRouter.use('/sanctions', sanctionRouter);
mainRouter.use('/promotions', promotionRouter);
mainRouter.use('/campaigns', campaignRouter);
mainRouter.use('/boosts', boostRouter);
mainRouter.use('/sponsored', sponsoredRouter);
mainRouter.use('/wishlist', wishlistRouter);
mainRouter.use('/reviews', reviewRouter);
mainRouter.use('/addresses', addressRouter);
mainRouter.use('/recommandations', recommandationRouter);



export default mainRouter;