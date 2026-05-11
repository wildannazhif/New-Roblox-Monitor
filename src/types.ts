export interface EldoradoOrder {
  orderId: string;
  orderDate: string; // Original string from CSV
  parsedDate: Date;  // UTC Date object
  localDate: Date;   // Corrected to GMT+7
  title: string;
  offerType: string;
  description: string;
  purchaseQuantity: number;
  orderState: string;
  disputeReason: string;
  disputeMessage: string;
  pricePerUnitAmount: number;
  pricePerUnitCurrency: string;
  feedbackRating: string;
  reviewMessage: string;
  cancelationReason: string;
  cancelationMessage: string;
  totalOrderAmount: number;
  totalPriceCurrency: string;
}

export interface SalesSummary {
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  canceledOrders: number;
  deliveredOrders: number;
  averageOrderValue: number;
  successRate: number;
  averageDailyTransactions: number;
}
