import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
  timeout: 60000, // Increase timeout to 60 seconds
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("ata_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

// Handle errors
api.interceptors.response.use(
  (res) => res,
  (error) => {
    console.error("❌ API Error Details:", {
      message: error.message,
      code: error.code,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
      },
      response: error.response ? {
        status: error.response.status,
        data: error.response.data,
      } : "No Response",
    });

    if (
      typeof window !== "undefined" &&
      error.response?.status === 401
    ) {
      localStorage.removeItem("ata_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
