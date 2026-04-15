import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('error_rate');
const reqLatency = new Trend('req_latency', true);

const TARGET_RPS = 500;
const TEST_DURATION_SECONDS = 2;
const TARGET_TOTAL_REQUESTS = TARGET_RPS * TEST_DURATION_SECONDS;

export const options = {
    scenarios: {
        performance_test: {
            executor: 'constant-arrival-rate',
            rate: TARGET_RPS,
            timeUnit: '1s',
            duration: `${TEST_DURATION_SECONDS}s`,
            preAllocatedVUs: 200,
            maxVUs: 500,
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.05'],
        http_req_duration: ['p(95)<2000'],
        error_rate: ['rate<0.05'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080/api';

// ── Warm cache: gọi 1 lần trước khi test để đưa dữ liệu vào Redis ──
export function setup() {
    const warmRes = http.get(`${BASE_URL}/products?page=1&limit=20`);
    console.log(`🔥 Warm cache: status=${warmRes.status}, source=${warmRes.json().meta?.source || 'unknown'}`);
}

export default function () {
    const res = http.get(`${BASE_URL}/products?page=1&limit=20`);

    reqLatency.add(res.timings.duration);

    const passed = check(res, {
        'status is 200': (r) => r.status === 200,
    });

    errorRate.add(!passed);
}

export function handleSummary(data) {
    const totalReqs = data.metrics.http_reqs?.values?.count ?? 0;
    const avgLatency = data.metrics.http_req_duration?.values?.avg ?? 0;
    const p95Latency = data.metrics.http_req_duration?.values?.['p(95)'] ?? 0;
    const failRate = data.metrics.http_req_failed?.values?.rate ?? 1;

    const throughputPassed = totalReqs >= TARGET_TOTAL_REQUESTS;
    const errorPassed = failRate < 0.05;
    const latencyPassed = p95Latency < 2000;

    const passed = throughputPassed && errorPassed && latencyPassed;

    const report = `
╔══════════════════════════════════════════════════════════╗
║        📊  KẾT QUẢ KIỂM TRA HIỆU NĂNG  📊              ║
╠══════════════════════════════════════════════════════════╣
║  Kịch bản  : ${TARGET_TOTAL_REQUESTS} requests / ${TEST_DURATION_SECONDS} giây (${TARGET_RPS} req/s)      ║
║  API Target: GET /api/products                          ║
╠══════════════════════════════════════════════════════════╣
║  Tổng requests gửi đi : ${String(totalReqs).padStart(10)}                     ║
║  Mục tiêu requests    : ${String(TARGET_TOTAL_REQUESTS).padStart(10)}                     ║
║  Thời gian trung bình : ${String(avgLatency.toFixed(2) + ' ms').padStart(13)}                  ║
║  Thời gian P95        : ${String(p95Latency.toFixed(2) + ' ms').padStart(13)}                  ║
║  Tỉ lệ lỗi            : ${String((failRate * 100).toFixed(2) + ' %').padStart(13)}                  ║
╠══════════════════════════════════════════════════════════╣
║  Throughput đạt?      : ${throughputPassed ? '✅ Có' : '❌ Không'}                               ║
║  Latency đạt?         : ${latencyPassed ? '✅ Có' : '❌ Không'}                               ║
║  Error rate đạt?      : ${errorPassed ? '✅ Có' : '❌ Không'}                               ║
╠══════════════════════════════════════════════════════════╣
║  Kết luận: ${passed ? '✅ ĐẠT – Hệ thống đáp ứng mục tiêu' : '❌ KHÔNG ĐẠT – Chưa đạt target'}        ║
╚══════════════════════════════════════════════════════════╝
`;

    console.log(report);

    return {
        stdout: report,
        'performance-result.json': JSON.stringify(data, null, 2),
    };
}