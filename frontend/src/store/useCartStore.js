import { create } from 'zustand';
import api from '../api/axios';

const useCartStore = create((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  fetchCart: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get('/cart');
      set({ items: res.data.data?.items || [], isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addToCart: async (productId, quantity = 1) => {
    set({ isLoading: true, error: null });
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await api.post('/cart', { userId: user.id, productId, quantity });
      set({ items: res.data.data?.items || [], isLoading: false });
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Lỗi thêm vào giỏ';
      set({ isLoading: false, error: message });
      return { success: false, message };
    }
  },

  updateQuantity: (skuId, quantity) => {
    set((s) => ({
      items: s.items.map((item) =>
        item.skuId === skuId ? { ...item, quantity: Math.max(1, quantity) } : item
      ),
    }));
  },

  removeItem: (skuId) => {
    set((s) => ({ items: s.items.filter((item) => item.skuId !== skuId) }));
  },

  toggleSelect: (skuId) => {
    set((s) => ({
      items: s.items.map((item) =>
        item.skuId === skuId ? { ...item, selected: !item.selected } : item
      ),
    }));
  },

  clearCart: () => set({ items: [], error: null }),

  getSelectedItems: () => get().items.filter((i) => i.selected !== false),

  getTotal: () =>
    get()
      .items.filter((i) => i.selected !== false)
      .reduce((sum, item) => sum + (item.priceSnapshot || 0) * item.quantity, 0),

  getItemCount: () => get().items.reduce((n, item) => n + item.quantity, 0),
}));

export default useCartStore;
