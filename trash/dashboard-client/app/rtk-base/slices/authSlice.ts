import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import axiosInstance from '../../utils/axiosBase';
import { AxiosError } from 'axios';

// ----------------------------------------------------------------
// Interfaces based on Krabby Auth Server schema/controllers
// ----------------------------------------------------------------
export interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  profile_image?: string;
  is_admin?: boolean;
  is_active?: boolean;
  status?: string;
  country: string;
  phone_number: string;
  is_logged_out?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthResponseData {
  user_profile: UserProfile;
  access_token: string;
}

export interface AuthResponse {
  response_message: string;
  response: AuthResponseData | null;
  error: string | null;
}

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

// Helper to load initial state from localStorage safely
const getInitialUser = (): UserProfile | null => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('userData');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error(e);

      return null;
    }
  }
  return null;
};

const initialState: AuthState = {
  user: getInitialUser(),
  accessToken:
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null,
  isLoading: false,
  error: null,
  isAuthenticated:
    typeof window !== 'undefined'
      ? !!localStorage.getItem('accessToken')
      : false,
};

// ----------------------------------------------------------------
// Async Thunks
// ----------------------------------------------------------------
/**
 * Login handler using Axios
 */
export const handleLogin = createAsyncThunk<
  AuthResponseData,
  { email: string; password: string },
  { rejectValue: string }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const response = await axiosInstance.post<AuthResponse>(
      '/auth/login',
      credentials,
    );
    const data = response.data;

    if (data.error || !data.response) {
      return rejectWithValue(
        data.error || data.response_message || 'Login failed',
      );
    }

    const { user_profile, access_token } = data.response;

    if (typeof window !== 'undefined') {
      localStorage.setItem('email', user_profile.email);
      localStorage.setItem('accessToken', access_token);
      localStorage.setItem('userData', JSON.stringify(user_profile));
    }

    return data.response;
  } catch (err) {
    const error = err as AxiosError<AuthResponse>;
    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.response_message ||
      error.message ||
      'An error occurred during login';
    return rejectWithValue(errorMessage);
  }
});

/**
 * Logout handler
 * Pattern: POST /api/v1/auth/logout?user_email=...
 */
export const handleLogout = createAsyncThunk<
  void,
  void,
  { rejectValue: string }
>('auth/logout', async (_, { rejectWithValue }) => {
  try {
    const email =
      typeof window !== 'undefined' ? localStorage.getItem('email') : null;

    if (email) {
      await axiosInstance.post(`/auth/logout`, { user_email: email });
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('email');
      localStorage.removeItem('accessTokenSetTime');
      localStorage.removeItem('userData');
    }
  } catch (err) {
    const error = err as AxiosError<AuthResponse>;

    // Even if backend fails, we ensure local cleanup for user logout safety
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('email');
      localStorage.removeItem('accessTokenSetTime');
      localStorage.removeItem('userData');
    }

    return rejectWithValue(error.message || 'Logout failed');
  }
});

// ----------------------------------------------------------------
// Slice Definition
// ----------------------------------------------------------------
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(handleLogin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(
        handleLogin.fulfilled,
        (state, action: PayloadAction<AuthResponseData>) => {
          state.isLoading = false;
          state.user = action.payload.user_profile;
          state.accessToken = action.payload.access_token;
          state.isAuthenticated = true;
        },
      )
      .addCase(handleLogin.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || 'Login failed';
      })
      // Logout
      .addCase(handleLogout.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.error = null;
      })
      .addCase(handleLogout.rejected, (state) => {
        // Reset state anyway to ensure user is logged out visually
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.error = null;
      });
  },
});

export const { clearError } = authSlice.actions;

export default authSlice.reducer;
