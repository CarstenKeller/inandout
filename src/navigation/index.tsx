import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import DashboardScreen from '../screens/DashboardScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import ImportScreen from '../screens/ImportScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import PlanningScreen from '../screens/PlanningScreen';
import { TransactionsStackParamList } from '../types';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<TransactionsStackParamList>();

const DARK_NAV = {
  background: '#1E1E1E',
  border: '#2C2C2C',
  active: '#BB86FC',
  inactive: '#666666',
  header: '#121212',
  headerText: '#FFFFFF',
};

const TAB_ICONS: Record<string, { focused: keyof typeof Ionicons.glyphMap; default: keyof typeof Ionicons.glyphMap }> = {
  Dashboard:   { focused: 'home',         default: 'home-outline' },
  Transactions:{ focused: 'list',         default: 'list-outline' },
  Planning:    { focused: 'calendar',     default: 'calendar-outline' },
  Import:      { focused: 'cloud-upload', default: 'cloud-upload-outline' },
  Categories:  { focused: 'pricetags',   default: 'pricetags-outline' },
};

function TransactionsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: DARK_NAV.header },
        headerTintColor: DARK_NAV.headerText,
      }}
    >
      <Stack.Screen name="TransactionsList" component={TransactionsScreen} options={{ title: 'Buchungen' }} />
      <Stack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={({ route }) =>
          ({ title: route.params?.transaction ? 'Buchung bearbeiten' : 'Buchung hinzufügen' })
        }
      />
    </Stack.Navigator>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            const icons = TAB_ICONS[route.name];
            const name = icons ? (focused ? icons.focused : icons.default) : 'help-outline';
            return <Ionicons name={name} size={size} color={color} />;
          },
          tabBarActiveTintColor: DARK_NAV.active,
          tabBarInactiveTintColor: DARK_NAV.inactive,
          tabBarStyle: { backgroundColor: DARK_NAV.background, borderTopColor: DARK_NAV.border },
          headerStyle: { backgroundColor: DARK_NAV.header },
          headerTintColor: DARK_NAV.headerText,
        })}
      >
        <Tab.Screen name="Dashboard"    component={DashboardScreen}    options={{ title: 'Übersicht' }} />
        <Tab.Screen name="Transactions" component={TransactionsStack}   options={{ title: 'Buchungen', headerShown: false }} />
        <Tab.Screen name="Planning"     component={PlanningScreen}      options={{ title: 'Planung' }} />
        <Tab.Screen name="Import"       component={ImportScreen}        options={{ title: 'Importieren' }} />
        <Tab.Screen name="Categories"   component={CategoriesScreen}    options={{ title: 'Kategorien' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
