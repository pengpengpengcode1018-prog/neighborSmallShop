import { prisma } from '../config/database.js';
import type { EnableStatus, Prisma, ProductStatus } from '../generated/prisma/client.js';
import { auditRepository, type AuditActor } from './audit.repository.js';

export class InvalidCatalogReferenceError extends Error {}
export class CategoryHasProductsError extends Error {}
export class ProductCannotBeOnSaleError extends Error {}

export interface CategoryWriteInput {
  storeId: string;
  name: string;
  status: EnableStatus;
  sortOrder: number;
}

export interface ProductWriteInput {
  storeId: string;
  categoryId: string;
  name: string;
  description?: string | undefined;
  detail?: string | undefined;
  price: string;
  originalPrice?: string | undefined;
  stock: number;
  purchaseLimit?: number | undefined;
  stockWarningThreshold: number;
  isHot: boolean;
  status: ProductStatus;
  sortOrder: number;
}

function categoryAudit(input: CategoryWriteInput) {
  return {
    storeId: input.storeId,
    name: input.name,
    status: input.status,
    sortOrder: input.sortOrder,
  };
}

function productAudit(input: ProductWriteInput) {
  return {
    storeId: input.storeId,
    categoryId: input.categoryId,
    name: input.name,
    price: input.price,
    originalPrice: input.originalPrice ?? null,
    stock: input.stock,
    purchaseLimit: input.purchaseLimit ?? null,
    stockWarningThreshold: input.stockWarningThreshold,
    isHot: input.isHot,
    status: input.status,
    sortOrder: input.sortOrder,
  };
}

async function validateStore(tx: Prisma.TransactionClient, storeId: string) {
  const store = await tx.store.findFirst({ where: { id: storeId, deletedAt: null } });
  if (!store) throw new InvalidCatalogReferenceError();
  return store;
}

async function validateProductContext(tx: Prisma.TransactionClient, input: ProductWriteInput) {
  const store = await validateStore(tx, input.storeId);
  const category = await tx.productCategory.findFirst({
    where: { id: input.categoryId, storeId: input.storeId, deletedAt: null },
  });
  if (!category) throw new InvalidCatalogReferenceError();
  if (
    input.status === 'ON_SALE' &&
    (input.stock === 0 || category.status !== 'ENABLED' || store.status === 'DISABLED')
  ) {
    throw new ProductCannotBeOnSaleError();
  }
}

function productData(input: ProductWriteInput) {
  return {
    storeId: input.storeId,
    categoryId: input.categoryId,
    name: input.name,
    description: input.description ?? null,
    detail: input.detail ?? null,
    price: input.price,
    originalPrice: input.originalPrice ?? null,
    stock: input.stock,
    purchaseLimit: input.purchaseLimit ?? null,
    stockWarningThreshold: input.stockWarningThreshold,
    isHot: input.isHot,
    status: input.status,
    sortOrder: input.sortOrder,
  };
}

export const catalogRepository = {
  listCategories(storeId: string) {
    return prisma.productCategory.findMany({
      where: { storeId, deletedAt: null },
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'asc' }],
    });
  },
  findCategory(id: string) {
    return prisma.productCategory.findFirst({ where: { id, deletedAt: null } });
  },
  createCategory(input: CategoryWriteInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      await validateStore(tx, input.storeId);
      const created = await tx.productCategory.create({ data: input });
      await auditRepository.create(tx, {
        actor,
        module: 'category',
        action: 'create',
        businessDataId: created.id,
        description: `创建商品分类：${created.name}`,
        afterData: categoryAudit(input),
      });
      return created;
    });
  },
  updateCategory(id: string, input: CategoryWriteInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      await validateStore(tx, input.storeId);
      const before = await tx.productCategory.findUniqueOrThrow({ where: { id } });
      const updated = await tx.productCategory.update({ where: { id }, data: input });
      if (input.status === 'DISABLED') {
        await tx.product.updateMany({
          where: { categoryId: id, deletedAt: null, status: 'ON_SALE' },
          data: { status: 'OFF_SHELF' },
        });
      }
      await auditRepository.create(tx, {
        actor,
        module: 'category',
        action: 'update',
        businessDataId: id,
        description: `编辑商品分类：${updated.name}`,
        beforeData: categoryAudit(before),
        afterData: categoryAudit(input),
      });
      return updated;
    });
  },
  softDeleteCategory(id: string, actor: AuditActor, name: string) {
    return prisma.$transaction(async (tx) => {
      if (await tx.product.count({ where: { categoryId: id, deletedAt: null } })) {
        throw new CategoryHasProductsError();
      }
      const deleted = await tx.productCategory.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'DISABLED' },
      });
      await auditRepository.create(tx, {
        actor,
        module: 'category',
        action: 'delete',
        businessDataId: id,
        description: `删除商品分类：${name}`,
        afterData: { deleted: true, status: 'DISABLED' },
      });
      return deleted;
    });
  },
  async listProducts(
    storeId: string,
    page: number,
    pageSize: number,
    keyword?: string,
    categoryId?: string,
    status?: ProductStatus,
  ) {
    const where: Prisma.ProductWhereInput = {
      storeId,
      deletedAt: null,
      ...(keyword ? { name: { contains: keyword } } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(status ? { status } : {}),
    };
    const [list, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);
    return { list, total };
  },
  findProduct(id: string) {
    return prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { category: true },
    });
  },
  createProduct(input: ProductWriteInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      await validateProductContext(tx, input);
      const created = await tx.product.create({
        data: productData(input),
        include: { category: true },
      });
      await auditRepository.create(tx, {
        actor,
        module: 'product',
        action: 'create',
        businessDataId: created.id,
        description: `创建商品：${created.name}`,
        afterData: productAudit(input),
      });
      return created;
    });
  },
  updateProduct(id: string, input: ProductWriteInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      await validateProductContext(tx, input);
      const before = await tx.product.findUniqueOrThrow({ where: { id } });
      const updated = await tx.product.update({
        where: { id },
        data: productData(input),
        include: { category: true },
      });
      await auditRepository.create(tx, {
        actor,
        module: 'product',
        action: 'update',
        businessDataId: id,
        description: `编辑商品：${updated.name}`,
        beforeData: productAudit({
          storeId: before.storeId,
          categoryId: before.categoryId,
          name: before.name,
          price: before.price.toFixed(2),
          ...(before.originalPrice ? { originalPrice: before.originalPrice.toFixed(2) } : {}),
          stock: before.stock,
          ...(before.purchaseLimit ? { purchaseLimit: before.purchaseLimit } : {}),
          stockWarningThreshold: before.stockWarningThreshold,
          isHot: before.isHot,
          status: before.status,
          sortOrder: before.sortOrder,
        }),
        afterData: productAudit(input),
      });
      return updated;
    });
  },
  softDeleteProduct(id: string, actor: AuditActor, name: string) {
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.product.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'OFF_SHELF' },
      });
      await auditRepository.create(tx, {
        actor,
        module: 'product',
        action: 'delete',
        businessDataId: id,
        description: `删除商品：${name}`,
        afterData: { deleted: true, status: 'OFF_SHELF' },
      });
      return deleted;
    });
  },
};
