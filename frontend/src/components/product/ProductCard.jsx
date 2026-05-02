import { Link } from 'react-router-dom';
import { formatVND } from '../../utils/format';

const ProductCard = ({ product }) => {
  const variant = product.variants?.[0];
  const price = variant?.price || 0;

  return (
    <Link
      to={`/products/${product._id}`}
      className="bg-white border border-gray-100 rounded-lg overflow-hidden hover:shadow-lg hover:border-shopee/20 transition-all group"
    >
      <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-20 group-hover:scale-110 transition-transform">
          📦
        </div>
        {product.status === 'ACTIVE' && variant?.availableStock === 0 && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white font-bold text-sm">Hết hàng</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs text-gray-700 line-clamp-2 mb-2 leading-relaxed min-h-[32px]">
          {product.name}
        </p>
        <div className="flex items-baseline gap-1">
          <span className="text-shopee font-bold text-base">{formatVND(price)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
          <span>Đã bán {product.numReviews || 0}</span>
          {product.rating > 0 && <span>★ {product.rating.toFixed(1)}</span>}
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;
