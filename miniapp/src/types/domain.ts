export interface CommunitySummary {
  id: string;
  name: string;
}

export interface CartLine {
  productId: string;
  storeId: string;
  name: string;
  unitPrice: string;
  quantity: number;
}
