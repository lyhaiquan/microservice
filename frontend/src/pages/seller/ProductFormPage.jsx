import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { formatVND } from '../../utils/format';

const ProductFormPage = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [form, setForm] = useState({
    _id: `PRD_${Date.now()}`,
    name: '',
    slug: '',
    categoryId: 'CAT_001',
    sellerId: user.id,
    sellerRegion: user.region || 'NORTH',
    status: 'ACTIVE',
    variants: [{ skuId: `SKU_${Date.now()}_001`, price: 0, totalStock: 0, availableStock: 0, reservedStock: 0, version: 1 }],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    const load = async () => {
      try {
        const res = await api.get(`/products/${id}`);
        setForm(res.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Không tải được sản phẩm');
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleVariantChange = (i, field, value) => {
    const variants = [...form.variants];
    variants[i] = { ...variants[i], [field]: field === 'skuId' ? value : Number(value) };
    if (field === 'totalStock') variants[i].availableStock = Number(value);
    setForm({ ...form, variants });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      if (isEdit) {
        await api.put(`/products/${id}`, form);
      } else {
        await api.post('/products', { ...form, slug: form.slug || form.name.toLowerCase().replace(/\s+/g, '-') });
      }
      navigate('/seller/products');
    } catch (err) {
      setError(err.response?.data?.message || 'Lưu thất bại');
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-400">Đang tải...</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        {isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
      </h2>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <h3 className="text-base font-medium border-b pb-2">Thông tin cơ bản</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên sản phẩm *</label>
            <input
              type="text" value={form.name} required
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-shopee"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL)</label>
            <input
              type="text" value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="ten-san-pham"
              className="input-shopee"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Danh mục</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="input-shopee"
              >
                <option value="CAT_001">CAT_001 - Beauty</option>
                <option value="CAT_002">CAT_002 - Electronics</option>
                <option value="CAT_003">CAT_003 - Fashion</option>
                <option value="CAT_004">CAT_004 - Home</option>
                <option value="CAT_005">CAT_005 - Sports</option>
                <option value="CAT_006">CAT_006 - Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="input-shopee"
              >
                <option value="ACTIVE">ACTIVE - Đang bán</option>
                <option value="INACTIVE">INACTIVE - Tạm ngưng</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <h3 className="text-base font-medium border-b pb-2">Phân loại & giá</h3>

          {form.variants.map((v, i) => (
            <div key={i} className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">SKU</label>
                <input
                  type="text" value={v.skuId} required
                  onChange={(e) => handleVariantChange(i, 'skuId', e.target.value)}
                  className="input-shopee"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Giá (VND)</label>
                <input
                  type="number" value={v.price} required min={0}
                  onChange={(e) => handleVariantChange(i, 'price', e.target.value)}
                  className="input-shopee"
                />
                <p className="text-[10px] text-gray-400 mt-1">{formatVND(v.price)}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Tồn kho</label>
                <input
                  type="number" value={v.totalStock} required min={0}
                  onChange={(e) => handleVariantChange(i, 'totalStock', e.target.value)}
                  className="input-shopee"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/seller/products')}
            className="flex-1 py-3 border border-gray-300 rounded text-sm hover:bg-gray-50 cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="submit" disabled={submitting}
            className="flex-1 btn-shopee py-3 text-sm disabled:opacity-50"
          >
            {submitting ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Tạo sản phẩm')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductFormPage;
