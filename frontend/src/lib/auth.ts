import api from "./api";

export interface AuthResponse {
  access_token: string;
  tenant_id: string | number;
  name: string;
}

export const loginUser = async (
  email: string,
  password: string,
): Promise<AuthResponse> => {
  const res = await api.post("/auth/login", { email, password });
  return res.data;
};

export const registerUser = async (
  name: string,
  email: string,
  password: string,
): Promise<AuthResponse> => {
  const res = await api.post("/auth/register", { name, email, password });
  return res.data;
};
