import Router from '@koa/router';

import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  listCategories,
  listProducts,
  updateCategory,
  updateProduct,
} from '../../controllers/catalog.controller.js';
import { requireAdmin } from '../../middlewares/admin-auth.middleware.js';

export function createCatalogRouter(): Router {
  const router = new Router({ prefix: '/admin' });
  router.use(requireAdmin);
  router.get('/categories', listCategories);
  router.post('/categories', createCategory);
  router.put('/categories/:id', updateCategory);
  router.delete('/categories/:id', deleteCategory);
  router.get('/products', listProducts);
  router.post('/products', createProduct);
  router.put('/products/:id', updateProduct);
  router.delete('/products/:id', deleteProduct);
  return router;
}
