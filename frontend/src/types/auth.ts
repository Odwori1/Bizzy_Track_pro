export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  businessId: string;
  permissions: string[];
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
    refreshToken: string;
  };
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  businessName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}
