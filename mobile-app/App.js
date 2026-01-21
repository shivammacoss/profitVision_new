import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';

import SignupScreen from './src/screens/SignupScreen';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import MainTradingScreen from './src/screens/MainTradingScreen';
import WalletScreen from './src/screens/WalletScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SupportScreen from './src/screens/SupportScreen';
import CopyTradeScreen from './src/screens/CopyTradeScreen';
import IBScreen from './src/screens/IBScreen';
import AccountsScreen from './src/screens/AccountsScreen';
import OrderBookScreen from './src/screens/OrderBookScreen';
import InstructionsScreen from './src/screens/InstructionsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <NavigationContainer>
            <StatusBar style="light" />
            <Stack.Navigator 
              initialRouteName="Login"
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#0a0a0a' }
              }}
            >
              <Stack.Screen name="Signup" component={SignupScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Dashboard" component={DashboardScreen} />
              <Stack.Screen name="MainTrading" component={MainTradingScreen} />
              <Stack.Screen name="Wallet" component={WalletScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="Support" component={SupportScreen} />
              <Stack.Screen name="CopyTrade" component={CopyTradeScreen} />
              <Stack.Screen name="IB" component={IBScreen} />
              <Stack.Screen name="Accounts" component={AccountsScreen} />
              <Stack.Screen name="OrderBook" component={OrderBookScreen} />
              <Stack.Screen name="Instructions" component={InstructionsScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
