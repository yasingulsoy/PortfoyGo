const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

// Logging helper
const logApiCall = (type: 'request' | 'response' | 'error', data: any) => {
  const timestamp = new Date().toISOString();
  const prefix = type === 'request' ? '📤' : type === 'response' ? '📥' : '❌';
  console.log(`${prefix} [${timestamp}] API ${type.toUpperCase()}:`, data);
};

// Logout işleminin sadece bir kez yapılması için flag
let isLoggingOut = false;

// Token'ı localStorage'dan al
const getToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
};

// API çağrısı yap
const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const token = getToken();
  const fullUrl = `${API_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token.substring(0, 20)}...`;
  }

  // Request logging
  logApiCall('request', {
    method: options.method || 'GET',
    url: fullUrl,
    endpoint,
    hasToken: !!token,
    body: options.body ? JSON.parse(options.body as string) : undefined,
  });

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        ...headers,
        'Authorization': token ? `Bearer ${token}` : undefined,
      },
    });

    // Response logging
    logApiCall('response', {
      method: options.method || 'GET',
      url: fullUrl,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      // 401 Unauthorized veya 403 Forbidden hatası - token geçersiz veya yetkisiz
      if (response.status === 401 || response.status === 403) {
        logApiCall('error', {
          method: options.method || 'GET',
          url: fullUrl,
          status: response.status,
          message: 'Unauthorized/Forbidden - Logging out user',
        });
        
        // Token'ı temizle ve kullanıcıyı logout yap (sadece bir kez)
        if (typeof window !== 'undefined' && !isLoggingOut) {
          const currentPath = window.location.pathname;
          // Eğer zaten login sayfasındaysak yönlendirme yapma
          if (currentPath !== '/login' && currentPath !== '/register') {
            isLoggingOut = true;
            // Tüm storage'ı temizle
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('portfolio');
            // Cookie'yi de temizle
            document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            // Custom event gönder ki AuthContext dinlesin
            window.dispatchEvent(new CustomEvent('auth:logout'));
            // Kısa bir gecikme ile yönlendir (AuthContext'in güncellenmesi için)
            setTimeout(() => {
              window.location.replace('/login');
            }, 100);
          }
        }
        throw new Error('Oturum süreniz doldu. Lütfen tekrar giriş yapın.');
      }
      
      const error = await response.json().catch(() => ({ message: 'Bir hata oluştu' }));
      logApiCall('error', {
        method: options.method || 'GET',
        url: fullUrl,
        status: response.status,
        error: error,
      });
      throw new Error(error.message || 'API hatası');
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    // Network errors veya diğer hatalar
    logApiCall('error', {
      method: options.method || 'GET',
      url: fullUrl,
      errorType: error.name || 'Unknown',
      errorMessage: error.message || 'Unknown error',
      stack: error.stack,
    });
    throw error;
  }
};

// Transaction API
export const transactionApi = {
  buy: async (data: {
    symbol: string;
    name: string;
    asset_type: 'crypto' | 'stock';
    quantity: number;
    price: number;
  }) => {
    return apiCall('/transactions/buy', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  sell: async (data: {
    symbol: string;
    quantity: number;
  }) => {
    return apiCall('/transactions/sell', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Portfolio API
export const portfolioApi = {
  getPortfolio: async () => {
    return apiCall('/portfolio');
  },

  getTransactions: async (limit: number = 50) => {
    return apiCall(`/portfolio/transactions?limit=${limit}`);
  },
};

// Leaderboard API
export const leaderboardApi = {
  getLeaderboard: async (limit: number = 10) => {
    return apiCall(`/leaderboard?limit=${limit}`);
  },

  getMyRank: async () => {
    return apiCall('/leaderboard/my-rank');
  },
};

// Admin API
export const adminApi = {
  getStats: async () => {
    return apiCall('/admin/stats');
  },

  getUsers: async (limit: number = 50, offset: number = 0) => {
    return apiCall(`/admin/users?limit=${limit}&offset=${offset}`);
  },

  toggleUserBan: async (userId: string, ban: boolean) => {
    return apiCall(`/admin/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ ban }),
    });
  },
};

// Badges API
export const badgesApi = {
  getMyBadges: async () => {
    return apiCall('/badges/my-badges');
  },

  getAllBadges: async () => {
    return apiCall('/badges');
  },
};

// Activity Logs API
export const activityLogsApi = {
  getLogs: async (limit: number = 50, offset: number = 0, type?: string) => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    if (type) {
      params.append('type', type);
    }
    return apiCall(`/activity-logs?${params.toString()}`);
  },

  getTypes: async () => {
    return apiCall('/activity-logs/types');
  },
};