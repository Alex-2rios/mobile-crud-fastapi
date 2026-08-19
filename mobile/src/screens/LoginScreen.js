import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '../api/client';
import { useAuth } from '../api/AuthContext';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const submit = async (isRegister) => {
    setError(null);
    setNotice(null);
    if (!email.trim() || password.length < 8) {
      setError('email required, password must be at least 8 characters');
      return;
    }

    setBusy(true);
    try {
      if (isRegister) {
        await signUp(email.trim(), password);
        setNotice('account created, signing you in');
      }
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.subtitle}>{api.baseUrl}</Text>

        <TextInput
          style={styles.input}
          placeholder="email"
          placeholderTextColor="#6e7681"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="password"
          placeholderTextColor="#6e7681"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={() => submit(false)}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign in</Text>}
        </Pressable>

        <Pressable onPress={() => submit(true)} disabled={busy}>
          <Text style={styles.link}>No account yet? Create one</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0d1117', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#161b22', borderRadius: 12, padding: 24, borderWidth: 1, borderColor: '#30363d' },
  title: { color: '#e6edf3', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#6e7681', fontSize: 12, marginTop: 4, marginBottom: 20 },
  input: {
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    color: '#e6edf3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  primary: {
    backgroundColor: '#238636',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  pressed: { opacity: 0.75 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  link: { color: '#58a6ff', textAlign: 'center', marginTop: 16, fontSize: 13 },
  error: { color: '#f85149', fontSize: 13, marginBottom: 8 },
  notice: { color: '#3fb950', fontSize: 13, marginBottom: 8 },
});
