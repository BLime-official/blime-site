// 스크래핑 대시보드의 최근 30일 신규 상품 차트. 값은 페이지가 심은 window.BLIME_NEW_PRODUCTS_DAILY다.
(() => {
    const initNewProductsChart = async () => {
        const canvas = document.getElementById('newProductsChart');
        if (!canvas || typeof Chart === 'undefined') return;

        let rows = Array.isArray(window.BLIME_NEW_PRODUCTS_DAILY)
            ? window.BLIME_NEW_PRODUCTS_DAILY
            : [];
        if (rows.length === 0) {
            try {
                const response = await fetch('dashboard_data.json');
                const payload = await response.json();
                rows = Array.isArray(payload.new_products_daily)
                    ? payload.new_products_daily
                    : [];
            } catch (error) {
                rows = [];
            }
        }

        const labels = rows.map(row => row.date);
        const counts = rows.map(row => row.count);

        // 상품 상세 가격 차트와 같은 모바일 기준. 좁은 화면의 X축은 연도까지 쓰면 라벨이 서로 붙어
        // 'M/D'로 줄인다(툴팁 제목은 원래 날짜 그대로).
        const mobileQuery = window.matchMedia('(max-width: 768px)');
        const buildXTicks = (mobile) => ({
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 16,
            maxTicksLimit: mobile ? 4 : 8,
            callback: function (value) {
                const label = this.getLabelForValue(value);
                return mobile ? window.BLIME_FORMAT.compactDate(label) : label;
            }
        });

        const chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '신규 상품',
                    data: counts,
                    borderColor: '#004E89',
                    backgroundColor: 'rgba(0, 78, 137, 0.12)',
                    borderWidth: 2,
                    // 점은 숨기고 터치/호버 때만 보여 준다. 30개 점을 좁은 폭에 다 그리면 서로 겹쳐 선이 가려진다.
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHitRadius: 16,
                    pointBackgroundColor: '#004E89',
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 2,
                    tension: 0.35,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // 점이 없으니 가장 가까운 날짜를 잡는다. 손가락이 선에 정확히 닿지 않아도 툴팁이 뜬다.
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: context => `신규 상품 ${context.parsed.y}개`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: buildXTicks(mobileQuery.matches),
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                }
            }
        });

        // 태블릿을 돌리거나 창 폭을 바꿔 768px 경계를 넘으면 X축 표기를 다시 만든다.
        const refreshXTicks = (event) => {
            chart.options.scales.x.ticks = buildXTicks(event.matches);
            chart.update('none');
        };
        if (typeof mobileQuery.addEventListener === 'function') {
            mobileQuery.addEventListener('change', refreshXTicks);
        } else if (typeof mobileQuery.addListener === 'function') {
            mobileQuery.addListener(refreshXTicks);
        }
    };

    document.addEventListener('DOMContentLoaded', initNewProductsChart);
})();
