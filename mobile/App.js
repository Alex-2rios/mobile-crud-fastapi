import React from 'react';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthProvider, useAuth } from './src/api/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import ItemListScreen from './src/screens/ItemListScreen';
import ItemFormScreen from './src/screens/ItemFormScreen';

const Stack = createNativeStackNavigator();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0d1117',
    card: '#161b22',
    text: '#e6edf3',
    border: '#30363d',
    primary: '#58a6ff',
  },
};

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <Pressable onPress={signOut} hitSlop={10}>
      <Text style={styles.signOut}>Sign out</Text>
    </Pressable>
  );
}

function Routes() {
  const { token, restoring } = useAuth();

  if (restoring) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color="#58a6ff" />
      </View>
    );
  }

  return (
    <Stack.Navigator>
      {token ? (
        <>
          <Stack.Screen
            name="Items"
            component={ItemListScreen}
            options={{ title: 'Inventory', headerRight: () => <SignOutButton /> }}
          />
          <Stack.Screen name="ItemForm" component={ItemFormScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer theme={theme}>
        <StatusBar barStyle="light-content" />
        <Routes />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#0d1117', alignItems: 'center', justifyContent: 'center' },
  signOut: { color: '#58a6ff', fontSize: 14 },
});
