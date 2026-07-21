import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';

const visibleCategoryWhere = {
  status: 'ENABLED',
  deletedAt: null,
} satisfies Prisma.ProductCategoryWhereInput;

const visibleProductWhere = {
  deletedAt: null,
  status: { in: ['ON_SALE', 'SOLD_OUT'] },
  category: visibleCategoryWhere,
} satisfies Prisma.ProductWhereInput;

const residentProductInclude = { category: true } satisfies Prisma.ProductInclude;

export type ResidentProductRecord = Prisma.ProductGetPayload<{
  include: typeof residentProductInclude;
}>;

export const residentProductRepository = {
  listCategories(storeId: string) {
    return prisma.productCategory.findMany({
      where: { storeId, ...visibleCategoryWhere },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'asc' }],
    });
  },

  findVisibleCategory(storeId: string, categoryId: string) {
    return prisma.productCategory.findFirst({
      where: { id: categoryId, storeId, ...visibleCategoryWhere },
      select: { id: true },
    });
  },

  async listProducts(
    storeId: string,
    page: number,
    pageSize: number,
    categoryId?: string,
  ): Promise<{ list: ResidentProductRecord[]; total: number }> {
    const where: Prisma.ProductWhereInput = {
      storeId,
      ...visibleProductWhere,
      ...(categoryId ? { categoryId } : {}),
    };
    const [list, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: residentProductInclude,
        orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);
    return { list, total };
  },

  findVisibleProduct(id: string): Promise<ResidentProductRecord | null> {
    return prisma.product.findFirst({
      where: { id, ...visibleProductWhere },
      include: residentProductInclude,
    });
  },
};
