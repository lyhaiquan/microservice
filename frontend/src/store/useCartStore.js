import { create } from 'zustand';
import api from '../api/axios';

const useCartStore = create((set, get) => ({
  // State
  items: [],
  isLoading: false,
  error: null,

  // Actions
  fetchCart: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get('/cart');
      const items = res.data.data?.items || res.data.items || [];
      set({ items, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err.response?.data?.message || 'Lỗi tải giỏ hàng' });
    }
  },

  addToCart: async (productId, quantity = 1) => {
    set({ isLoading: true, error: null });
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      await api.post('/cart', {
        userId: user.id,
        productId,
        quantity,
      });
      // Refresh cart
      await get().fetchCart();
      set({ isLoading: false });
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Lỗi thêm vào giỏ';
      set({ isLoading: false, error: message });
      return { success: false, message };
    }
  },

  removeFromCart: async (productId) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/cart/${productId}`);
      await get().fetchCart();
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err.response?.data?.message || 'Lỗi xóa sản phẩm' });
    }
  },

  clearCart: () => set({ items: [], error: null }),

  getTotal: () => {
    return get().items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  },

  getItemCount: () => {
    return get().items.reduce((count, item) => count + item.quantity, 0);
  },
}));

export default useCartStore;
