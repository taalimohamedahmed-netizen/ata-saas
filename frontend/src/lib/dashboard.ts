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

export const getConversations = async (
  limit = 25,
  offset = 0,
): Promise<Conversation[]> => {
  const res = await api.get("/dashboard/conversations", {
    params: { limit, offset },
  });
  return res.data;
};
