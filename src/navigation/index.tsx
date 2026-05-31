import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import DashboardScreen from '../screens/DashboardScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import ImportScreen from '../screens/ImportScreen';
import ImportReviewScreen from '../screens/ImportReviewScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import PlanningScreen from '../screens/PlanningScreen';
import { TransactionsStackParamList, ImportStackParamList, PlanningStackParamList } from '../types';

const Tab = createBottomTabNavigator();
const TxStack = createNativeStackNavigator<TransactionsStackParamList>();
const PlStack = createNativeStackNavigator<PlanningStackParamList>();
const ImpStack = createNativeStackNavigator<ImportStackParamList>();

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

const stackScreenOptions = {
  headerStyle: { backgroundColor: DARK_NAV.header },
  headerTintColor: DARK_NAV.headerText,
};

function TransactionsStack() {
  return (
    <TxStack.Navigator screenOptions={stackScreenOptions}>
      <TxStack.Screen name="TransactionsList" component={TransactionsScreen} options={{ title: 'Buchungen' }} />
      <TxStack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={({ route }) =>
          ({ title: route.params?.transaction ? 'Buchung bearbeiten' : 'Buchung hinzufügen' })
        }
      />
    </TxStack.Navigator>
  );
}

function PlanningStack() {
  return (
    <PlStack.Navigator screenOptions={stackScreenOptions}>
      <PlStack.Screen name="PlanningMain" component={PlanningScreen} options={{ title: 'Planung' }} />
      <PlStack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={({ route }) =>
          ({ title: route.params?.transaction ? 'Position bearbeiten' : 'Position hinzufügen' })
        }
      />
    </PlStack.Navigator>
  );
}

function ImportStack() {
  return (
    <ImpStack.Navigator screenOptions={stackScreenOptions}>
      <ImpStack.Screen name="ImportMain" component={ImportScreen} options={{ title: 'Importieren' }} />
      <ImpStack.Screen name="ImportReview" component={ImportReviewScreen} options={{ title: 'Kategorisieren' }} />
    </ImpStack.Navigator>
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
        <Tab.Screen name="Dashboard"    component={DashboardScreen}   options={{ title: 'Übersicht' }} />
        <Tab.Screen name="Transactions" component={TransactionsStack}  options={{ title: 'Buchungen',   headerShown: false }} />
        <Tab.Screen name="Planning"     component={PlanningStack}      options={{ title: 'Planung',     headerShown: false }} />
        <Tab.Screen name="Import"       component={ImportStack}        options={{ title: 'Importieren', headerShown: false }} />
        <Tab.Screen name="Categories"   component={CategoriesScreen}   options={{ title: 'Kategorien' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
