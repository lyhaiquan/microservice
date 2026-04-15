import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom Metrics ──────────────────────────────────────────────
const errorRate = new Rate('error_rate');
const reqLatency = new Trend('req_latency', true);

// ── Cấu hình: 5000 requests, đo xem hoàn thành trong bao lâu ──
const TOTAL_REQUESTS = 5000;
const VUS = 200;

export const options = {
    scenarios: {
        performance_test: {
            executor: 'shared-iterations',
            vus: VUS,
            iterations: TOTAL_REQUESTS,
            maxDuration: '60s',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.05'],   // Tỷ lệ lỗi < 5%
        http_req_duration: ['p(95)<3000'], // P95 < 3 giây
        error_rate: ['rate<0.05'],
    },
};

// ── Base URL ────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5001/api';

// ── Kịch bản test ───────────────────────────────────────────────
export default function () {
    const res = http.get(`${BASE_URL}/products`);

    reqLatency.add(res.timings.duration);

    const passed = check(res, {
        'status is 200': (r) => r.status === 200,
    });

    errorRate.add(!passed);
}

// ── Báo cáo tổng hợp sau khi chạy xong ─────────────────────────
export function handleSummary(data) {
    const totalReqs = data.metrics.http_reqs?.values?.count ?? 0;
    const avgLatency = data.metrics.http_req_duration?.values?.avg ?? 0;
    const p95Latency = data.metrics.http_req_duration?.values?.['p(95)'] ?? 0;
    const failRate = data.metrics.http_req_failed?.values?.rate ?? 0;

    // Tổng thời gian test chạy (ms -> s)
    const durationMs = data.state?.testRunDurationMs ?? 0;
    const totalDurationSec = durationMs > 0 ? durationMs / 1000 : 0;

    // Throughput thực tế
    const actualRps =
        totalDurationSec > 0 ? totalReqs / totalDurationSec : 0;

    // Đánh giá
    const successReqs = Math.round(totalReqs * (1 - failRate));
    const passed = failRate < 0.05;

    const report = `
╔══════════════════════════════════════════════════════════╗
║        📊  KẾT QUẢ KIỂM TRA HIỆU NĂNG  📊              ║
╠══════════════════════════════════════════════════════════╣
║  Kịch bản   : ${TOTAL_REQUESTS} requests, ${VUS} VUs song song             ║
║  API Target : GET /api/products                         ║
╠══════════════════════════════════════════════════════════╣
║  Tổng requests       : ${String(totalReqs).padStart(10)}                   ║
║  Request thành công  : ${String(successReqs).padStart(10)}                   ║
║  Tổng thời gian chạy : ${String(totalDurationSec.toFixed(2) + ' s').padStart(10)}                   ║
║  Throughput thực tế  : ${String(actualRps.toFixed(2) + ' req/s').padStart(10)}              ║
║  Latency trung bình  : ${String(avgLatency.toFixed(2) + ' ms').padStart(10)}                 ║
║  Latency P95         : ${String(p95Latency.toFixed(2) + ' ms').padStart(10)}                 ║
║  Tỉ lệ lỗi           : ${String((failRate * 100).toFixed(2) + ' %').padStart(10)}                 ║
╠══════════════════════════════════════════════════════════╣
║  Kết luận: ${passed ? '✅ Test chạy ổn, xem thời gian hoàn thành ở trên' : '❌ Có lỗi đáng kể, cần tối ưu'} ║
╚══════════════════════════════════════════════════════════╝
`;

    return {
        stdout: report,
        'performance-5000-result.json': JSON.stringify(data, null, 2),
    };
}