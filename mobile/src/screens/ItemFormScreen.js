import React, { useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '../api/client';
import { useAuth } from '../api/AuthContext';

export default function ItemFormScreen({ navigation, route }) {
  const { token } = useAuth();
  const existing = route.params?.item;

  const [sku, setSku] = useState(existing?.sku ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: existing ? `Edit ${existing.sku}` : 'New item' });
  }, [navigation, existing]);

  const save = async () => {
    setError(null);
    const parsed = parseInt(quantity, 10);

    if (!sku.trim() || !name.trim()) {
      setError('sku and name are required');
      return;
    }
    if (Number.isNaN(parsed) || parsed < 0) {
      setError('quantity has to be zero or more');
      return;
    }

    const payload = {
      sku: sku.trim(),
      name: name.trim(),
      location: location.trim() || 'unassigned',
      quantity: parsed,
    };

    setBusy(true);
    try {
      if (existing) {
        await api.updateItem(token, existing.id, payload);
      } else {
        await api.createItem(token, payload);
      }
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Field label="SKU" value={sku} onChangeText={setSku} autoCapitalize="characters" />
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Location" value={location} onChangeText={setLocation} placeholder="unassigned" />
      <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        onPress={save}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>{existing ? 'Save changes' : 'Create item'}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor="#6e7681"
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0d1117' },
  content: { padding: 20 },
  field: { marginBottom: 16 },
  label: { color: '#8b949e', fontSize: 12, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    color: '#e6edf3',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  error: { color: '#f85149', marginBottom: 12 },
});
