export const formatVND = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

export const formatDate = (date) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date));

export const ORDER_STATUS = {
  PENDING_PAYMENT: { label: 'Chờ thanh toán', color: 'text-yellow-600 bg-yellow-50' },
  PAID: { label: 'Đã thanh toán', color: 'text-blue-600 bg-blue-50' },
  SHIPPING: { label: 'Đang giao', color: 'text-purple-600 bg-purple-50' },
  COMPLETED: { label: 'Hoàn thành', color: 'text-green-600 bg-green-50' },
  CANCELLED: { label: 'Đã hủy', color: 'text-red-600 bg-red-50' },
};

export const REGION_LABELS = {
  NORTH: 'Miền Bắc',
  CENTRAL: 'Miền Trung',
  SOUTH: 'Miền Nam',
};
