import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '../api/client';
import { useAuth } from '../api/AuthContext';

export default function ItemListScreen({ navigation }) {
  const { token, signOut } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (search) => {
      try {
        setError(null);
        const page = await api.listItems(token, search);
        setItems(page.items);
        setTotal(page.total);
      } catch (e) {
        if (e.status === 401) {
          await signOut();
          return;
        }
        setError(e.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, signOut],
  );

  useFocusEffect(
    useCallback(() => {
      load(query);
    }, [load, query]),
  );

  const confirmDelete = (item) => {
    Alert.alert('Delete item', `Remove ${item.sku} from the inventory?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteItem(token, item.id);
            load(query);
          } catch (e) {
            Alert.alert('Could not delete', e.message);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => navigation.navigate('ItemForm', { item })}
      onLongPress={() => confirmDelete(item)}
    >
      <View style={styles.rowMain}>
        <Text style={styles.sku}>{item.sku}</Text>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.location}>{item.location}</Text>
      </View>
      <View style={[styles.qtyBadge, item.quantity === 0 && styles.qtyZero]}>
        <Text style={styles.qtyText}>{item.quantity}</Text>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#58a6ff" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TextInput
        style={styles.search}
        placeholder="search sku, name or location"
        placeholderTextColor="#6e7681"
        autoCapitalize="none"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => load(query)}
        returnKeyType="search"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={items.length ? null : styles.emptyWrap}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#58a6ff"
            onRefresh={() => {
              setRefreshing(true);
              load(query);
            }}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query ? 'nothing matches that search' : 'no items yet, add the first one'}
          </Text>
        }
        ListFooterComponent={
          items.length ? <Text style={styles.footer}>{total} items</Text> : null
        }
      />

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        onPress={() => navigation.navigate('ItemForm', {})}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0d1117', padding: 16 },
  center: { flex: 1, backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center' },
  search: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    color: '#e6edf3',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  row: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: { opacity: 0.75 },
  rowMain: { flex: 1 },
  sku: { color: '#58a6ff', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  name: { color: '#e6edf3', fontSize: 16, marginTop: 2 },
  location: { color: '#8b949e', fontSize: 12, marginTop: 4 },
  qtyBadge: {
    minWidth: 44,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1f6feb22',
    borderWidth: 1,
    borderColor: '#1f6feb',
    alignItems: 'center',
  },
  qtyZero: { backgroundColor: '#f8514922', borderColor: '#f85149' },
  qtyText: { color: '#e6edf3', fontWeight: '700' },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { color: '#6e7681', textAlign: 'center' },
  footer: { color: '#6e7681', fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  error: { color: '#f85149', marginBottom: 10 },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#238636',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 34 },
});
