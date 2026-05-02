import useAuthStore from '../../store/useAuthStore';
import { REGION_LABELS } from '../../utils/format';

const ProfilePage = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Tài khoản của tôi</h2>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-4 pb-4 border-b">
          <div className="w-16 h-16 rounded-full bg-shopee text-white flex items-center justify-center text-2xl font-bold">
            {user.fullName?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <p className="text-lg font-semibold">{user.fullName}</p>
            <p className="text-sm text-gray-500">ID: {user.id}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <Row label="Khu vực" value={REGION_LABELS[user.region] || user.region} />
          <Row label="Vai trò" value={(user.roles || ['BUYER']).join(', ')} />
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex justify-between text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
);

export default ProfilePage;
