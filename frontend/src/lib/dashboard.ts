import api from "./api";

export interface DashboardStats {
  total_orders: number;
  confirmed_orders: number;
  revenue: number;
  total_customers: number;
  vip_customers: number;
}

export interface Order {
  id: number;
  shopify_order_id: string;
  shopify_order_number: string | null;
  customer_id: number | null;
  status: string;
  total_price: number;
  currency: string;
  payment_method: string | null;
  confirmed_at: string | null;
  created_at: string | null;
}

export interface Customer {
  id: number;
  phone: string;
  name: string | null;
  segment: string;
  total_orders: number;
  total_spent: number;
  last_order_date: string | null;
  created_at: string | null;
}

export interface Conversation {
  id: number;
  customer_id: number;
  platform: string;
  current_flow: string | null;
  current_step: string | null;
  ai_paused: boolean;
  context: {
    last_intent?: string;
    history_tail?: Array<{ role: string; content: string; manual?: boolean }>;
  };
  updated_at: string | null;
  customer?: Customer;
}

export const getStats = async (): Promise<DashboardStats> => {
  const res = await api.get("/dashboard/stats");
  return res.data;
};

export const getOrders = async (limit = 25, offset = 0): Promise<Order[]> => {
  const res = await api.get("/dashboard/orders", { params: { limit, offset } });
  return res.data;
};

export const getCustomers = async (
  limit = 25,
  offset = 0,
  segment?: string,
): Promise<Customer[]> => {
  const res = await api.get("/dashboard/customers", {
    params: { limit, offset, ...(segment ? { segment } : {}) },
  });
  return res.data;
};

export interface Product {
  id: number;
  shopify_product_id: string;
  title: string;
  handle: string | null;
  vendor: string | null;
  product_type: string | null;
  status: string | null;
  price: number;
  inventory_qty: number;
  image_url: string | null;
  updated_at: string | null;
}

export const getProducts = async (
  limit = 25,
  offset = 0,
  status?: string,
  search?: string,
): Promise<Product[]> => {
  const res = await api.get("/dashboard/products", {
    params: { limit, offset, ...(status ? { status } : {}), ...(search ? { search } : {}) },
  });
  return res.data;
};

export interface PaymentSettings {
  instapay_number: string | null;
  instapay_link: string | null;
  vodafone_number: string | null;
  vodafone_link: string | null;
}

export interface PendingOrder {
  id: number;
  shopify_order_id: string;
  shopify_order_number: string | null;
  status: string;
  payment_method: string | null;
  total_price: number;
  currency: string;
  created_at: string | null;
  customer: { id: number; name: string | null; phone: string } | null;
}

export const getPaymentSettings = async (): Promise<PaymentSettings> => {
  const res = await api.get("/dashboard/order-confirmation/settings");
  return res.data;
};

export const savePaymentSettings = async (data: Partial<PaymentSettings>): Promise<PaymentSettings> => {
  const res = await api.post("/dashboard/order-confirmation/settings", data);
  return res.data;
};

export const getPendingOrders = async (limit = 50, offset = 0): Promise<PendingOrder[]> => {
  const res = await api.get("/dashboard/order-confirmation/pending", { params: { limit, offset } });
  return res.data;
};

export interface CustomerProfile {
  id: number;
  name: string | null;
  phone: string;
  segment: string;
  total_orders: number;
  total_spent: number;
  last_order_date: string | null;
  created_at: string | null;
}

export interface CustomerPendingOrder {
  id: number;
  shopify_order_id: string;
  shopify_order_number: string | null;
  status: string;
  payment_method: string | null;
  total_price: number;
  currency: string;
  created_at: string | null;
}

export const getCustomerProfile = async (customerId: number): Promise<CustomerProfile> => {
  const res = await api.get(`/dashboard/customers/${customerId}/profile`);
  return res.data;
};

export const getCustomerPendingOrders = async (customerId: number): Promise<CustomerPendingOrder[]> => {
  const res = await api.get(`/dashboard/customers/${customerId}/pending-orders`);
  return res.data;
};

export const confirmOrder = async (orderId: number): Promise<{ id: number; status: string }> => {
  const res = await api.post(`/dashboard/orders/${orderId}/confirm`);
  return res.data;
};

export const getConversations = async (
  limit = 25,
  offset = 0,
): Promise<Conversation[]> => {
  const res = await api.get("/dashboard/conversations", {
    params: { limit, offset },
  });
  return res.data;
};
