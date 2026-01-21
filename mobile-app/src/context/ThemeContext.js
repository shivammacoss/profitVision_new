import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_URL } from '../config';

// Default theme (Venta Black / Gold & Black)
const defaultTheme = {
  name: 'Gold & Black',
  colors: {
    primary: '#d4af37',
    primaryHover: '#c9a42e',
    secondary: '#fbbf24',
    accent: '#d4af37',
    bgPrimary: '#000000',
    bgSecondary: '#0a0a0a',
    bgCard: '#121212',
    bgHover: '#1a1a1a',
    textPrimary: '#ffffff',
    textSecondary: '#888888',
    textMuted: '#666666',
    border: '#1a1a1a',
    borderLight: '#2a2a2a',
    success: '#22c55e',
    error: '#ff4444',
    warning: '#fbbf24',
    info: '#3b82f6',
    buyColor: '#3b82f6',
    sellColor: '#ff4444',
    profitColor: '#22c55e',
    lossColor: '#ff4444',
    tabBarBg: '#121212',
    cardBg: '#121212',
  }
};

const ThemeContext = createContext({
  theme: defaultTheme,
  colors: defaultTheme.colors,
  loading: true,
  refreshTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(defaultTheme);
  const [loading, setLoading] = useState(true);

  const fetchActiveTheme = async () => {
    try {
      const response = await fetch(`${API_URL}/theme/active`);
      const data = await response.json();
      
      if (data.success && data.theme && data.theme.colors) {
        // Map backend theme colors to mobile-friendly format
        const adminColors = data.theme.colors;
        setTheme({
          name: data.theme.name,
          colors: {
            primary: adminColors.primary || defaultTheme.colors.primary,
            primaryHover: adminColors.primaryHover || defaultTheme.colors.primaryHover,
            secondary: adminColors.secondary || defaultTheme.colors.secondary,
            accent: adminColors.accent || defaultTheme.colors.accent,
            bgPrimary: adminColors.bgPrimary || defaultTheme.colors.bgPrimary,
            bgSecondary: adminColors.bgSecondary || defaultTheme.colors.bgSecondary,
            bgCard: adminColors.bgCard || defaultTheme.colors.bgCard,
            bgHover: adminColors.bgHover || defaultTheme.colors.bgHover,
            textPrimary: adminColors.textPrimary || defaultTheme.colors.textPrimary,
            textSecondary: adminColors.textSecondary || defaultTheme.colors.textSecondary,
            textMuted: adminColors.textMuted || defaultTheme.colors.textMuted,
            border: adminColors.border || defaultTheme.colors.border,
            borderLight: adminColors.borderLight || defaultTheme.colors.borderLight,
            success: adminColors.success || defaultTheme.colors.success,
            error: adminColors.error || defaultTheme.colors.error,
            warning: adminColors.warning || defaultTheme.colors.warning,
            info: adminColors.info || defaultTheme.colors.info,
            buyColor: adminColors.buyColor || defaultTheme.colors.buyColor,
            sellColor: adminColors.sellColor || defaultTheme.colors.sellColor,
            profitColor: adminColors.profitColor || defaultTheme.colors.profitColor,
            lossColor: adminColors.lossColor || defaultTheme.colors.lossColor,
            tabBarBg: adminColors.bgCard || defaultTheme.colors.tabBarBg,
            cardBg: adminColors.bgCard || defaultTheme.colors.cardBg,
          }
        });
      }
    } catch (error) {
      console.log('Using default theme - could not fetch from server:', error.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchActiveTheme();
    
    // Refresh theme every 5 minutes to catch admin changes
    const interval = setInterval(fetchActiveTheme, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const refreshTheme = () => {
    fetchActiveTheme();
  };

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      colors: theme.colors, 
      loading,
      refreshTheme 
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
