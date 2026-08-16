// 상품 상세 페이지: iHerb 단독 가격 추이 차트와 기간 버튼, 이미지 확대, 버튼 물결 효과.
// 차트 값은 페이지가 심은 <script id="price-chart-data">(날짜별 labels·prices·original_prices)다. iHerb 할인코드 적용가가 있는 상품은
// iherb_code({percent, price})도 있다. 가격 보기 설정을 켠 방문자(<html data-iherb-code="on">)에게는 이 값으로 판매가 선이 끝나는 날에 코드 적용가
// 점을 더하고 범례 항목과 툴팁 줄을 보인다. iherb_code 키나 범례 항목이 없는 페이지(꺼진 사이트, 옛 HTML)는 지금처럼 그린다. 공통 조각에 코드 적용가
// 조각이 없을 때(캐시에 남은 옛 price_chart_common.js)도 마찬가지다.
// 쿠팡이 연결된 상품의 비교 화면에는 이 값이 없다(<script id="price-compare-data">). 그래프와 기간 버튼은 비교 화면 전용 스크립트가 맡으니
// 여기서는 이미지 확대와 버튼 효과만 시작한다.
// 축·툴팁 모양·테마 갱신·할인율 반올림은 비교 차트와 같이 쓰는 price_chart_common.js(window.BLIME_PRICE_CHART)가 맡는다.
(() => {
    const DEFAULT_PERIOD = 30;
    // 축·툴팁·테마 갱신 조각. 불러오지 못했으면(undefined) initPriceChart가 안내를 보여 준다.
    const common = window.BLIME_PRICE_CHART;
    // iHerb 할인코드 적용가 점이 쓰는 공통 조각을 다 갖췄는가. 스크립트 주소에 버전이 없어 브라우저 캐시에 남은 옛 price_chart_common.js가 이 파일과 만날 수 있고,
    // 거기에는 이 조각이 없다. 없는 함수를 부르거나 플러그인 목록에 undefined를 넣으면 Chart.js가 던져 차트가 소리 없이 빈다(runSafely는 console.error만 남긴다).
    // 툴팁 위치 이름(iherbCodeTooltipPosition)도 같다: 등록하지 않은 이름을 쓰면 Chart.js가 마우스를 올리는 순간 던진다.
    // 하나라도 없으면 코드 적용가 점·연결선·툴팁 줄·범례 항목·설정 바뀜 듣기를 모두 건너뛰고 지금처럼 그린다.
    const canDrawIherbCode = Boolean(common)
        && ['isIherbCodeOn', 'lastValueIndex', 'iherbCodeDataset', 'iherbCodeTooltipLine', 'iherbCodeTooltipPosition', 'onIherbCodeChange'].every((name) => typeof common[name] === 'function')
        && Boolean(common.iherbCodeConnector);

    let priceChart = null;
    let fullChartData = null;
    let currentPeriod = DEFAULT_PERIOD;

    // Chart.js는 first-party로 서빙하지만, 네트워크 실패나 콘텐츠 차단기 등으로
    // 로드되지 않는 경우가 있다. 그 때 조용히 빈 영역을 남기지 않고 안내를 보여준다.
    const showChartUnavailable = (message) => {
        const container = document.querySelector('.chart-container');
        if (!container || container.querySelector('.chart-fallback')) return;

        const canvas = container.querySelector('canvas');
        if (canvas) canvas.hidden = true;

        const notice = document.createElement('p');
        notice.className = 'chart-fallback';
        notice.setAttribute('role', 'status');
        notice.textContent = message;
        container.appendChild(notice);
    };

    // 서버가 구한 코드 적용가 {percent, price}. 읽을 수 없으면(옛 HTML에는 키가 없다) 없는 것이다. 이 값이 없으면 코드 쪽 그림은 하나도 나오지 않는다.
    const readIherbCode = (value) => (
        value && Number.isFinite(value.percent) && Number.isFinite(value.price) ? { percent: value.percent, price: value.price } : null
    );

    // 코드 적용가 점을 그릴 때인가: 서버가 코드 적용가를 줬고 방문자의 가격 보기 설정이 켜져 있다.
    const showsIherbCode = () => Boolean(fullChartData.iherbCode) && common.isIherbCodeOn();

    // 정가가 판매가보다 높은 날이 할인일이다. 값이 없는 날(null)은 아니다.
    const isDiscounted = (original, price) => Number.isFinite(original) && Number.isFinite(price) && original > price;

    // 점선은 값이 둘 이상이어야 그려진다. 점 하나로는 선이 되지 않는다(새 상품의 첫 할인일, 정가를 못 읽은 날이 많은 기록). 값이 없는 날(null)은 값이 아니다.
    const hasTwoValues = (values) => values.filter(Number.isFinite).length >= 2;

    // 기간(최근 N개 기록)의 값. 데이터는 지금처럼 기록이 있는 날짜만 쓴다.
    const buildWindow = (days) => {
        const start = Math.max(0, fullChartData.labels.length - days);
        return {
            labels: fullChartData.labels.slice(start),
            prices: fullChartData.prices.slice(start),
            originals: fullChartData.originals.slice(start)
        };
    };

    // 판매가는 늘 그린다(초록 실선, 아래로 옅어지는 면, 끝점에만 점). 정가 점선은 보이는 기간에 할인일이 있을 때만 그린다.
    // 할인이 없는 날은 정가가 판매가와 겹쳐 실선 아래에 숨는다. 코드 적용가 점은 설정이 켜져 있을 때만 판매가 선이 끝나는 날(마지막으로 판매가가
    // 있는 날)에 더한다. 그 날이 없으면 점도 없다. 데이터셋은 키(sale, list, iherbCode)로 만들어, 기간이 바뀔 때마다 처음부터 다시 만든다.
    const buildDatasets = (windowData, theme) => {
        const last = windowData.prices.length - 1;
        const datasets = [{
            key: 'sale',
            label: '판매가',
            data: windowData.prices,
            borderColor: theme.iherb,
            backgroundColor: common.areaFill(theme.iherb),
            fill: 'origin',
            borderWidth: 2,
            cubicInterpolationMode: 'monotone',
            // 점은 끝점(지금 가격)에만 그리고, 나머지는 터치/호버 시에만 보여 준다. 점을 다 그리면 선이 점에 가려진다.
            pointRadius: (context) => (context.dataIndex === last ? 4 : 0),
            pointHoverRadius: 5,
            pointHitRadius: 16,
            pointBackgroundColor: theme.iherb,
            pointBorderColor: theme.surface,
            pointBorderWidth: 2,
            order: 0
        }];
        if (windowData.originals.some((original, index) => isDiscounted(original, windowData.prices[index]))) {
            datasets.push({
                key: 'list',
                label: '정가',
                data: windowData.originals,
                borderColor: theme.iherbList,
                borderWidth: 1.5,
                borderDash: [5, 4],
                cubicInterpolationMode: 'monotone',
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointHitRadius: 0,
                order: 1
            });
        }
        const codeDay = showsIherbCode() ? common.lastValueIndex(windowData.prices) : -1;
        if (codeDay >= 0) {
            datasets.push(common.iherbCodeDataset(theme, windowData.prices.length, codeDay, fullChartData.iherbCode.price));
        }
        return datasets;
    };

    // drawsCode: 이번 차트에 코드 적용가 점을 그리는가. 그릴 때만 툴팁 꼬리의 위치 계산을 점을 뺀 것으로 바꾼다(점이 없으면 지금처럼 Chart.js 기본값이다).
    const buildChartOptions = (theme, mobile, drawsCode) => {
        const tooltip = common.tooltipBase();
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            layout: { padding: common.layoutPadding(mobile) },
            plugins: {
                // 범례는 HTML(.chart-legend--single)이 그린다.
                legend: { display: false },
                tooltip: {
                    ...tooltip,
                    // 점도 그날의 활성 요소라 기본 위치(평균)에 들면 꼬리가 판매가 점에서 점 쪽으로 끌려 내려간다. 점을 뺀 평균에 둔다.
                    ...(drawsCode ? { position: common.iherbCodeTooltipPosition() } : {}),
                    // 정가 점선과 코드 적용가 점은 툴팁 항목이 아니다. 정가는 판매가 줄 아래에 덧붙이고, 코드 적용가 점이 있는 날은 그 맨 끝에 한 줄을 더한다.
                    filter: (item) => item.dataset.key === 'sale',
                    callbacks: {
                        ...tooltip.callbacks,
                        label: (item) => `판매가  ₩${window.BLIME_FORMAT.price(item.parsed.y)}`,
                        afterLabel: (item) => {
                            const lines = [];
                            const list = item.chart.data.datasets.find((dataset) => dataset.key === 'list');
                            const original = list ? list.data[item.dataIndex] : null;
                            if (isDiscounted(original, item.parsed.y)) {
                                lines.push(`  정가 ₩${window.BLIME_FORMAT.price(original)} · ${common.discountPercent(original, item.parsed.y)}% 할인`);
                            }
                            const code = item.chart.data.datasets.find((dataset) => dataset.key === 'iherbCode');
                            const codePrice = code ? code.data[item.dataIndex] : null;
                            if (Number.isFinite(codePrice)) {
                                lines.push(common.iherbCodeTooltipLine(fullChartData.iherbCode.percent, codePrice));
                            }
                            return lines;
                        }
                    }
                }
            },
            scales: {
                y: common.yScale(theme, mobile),
                x: common.xScale(theme, mobile, (label) => (mobile ? window.BLIME_FORMAT.compactDate(label) : label))
            }
        };
    };

    // 범례(.chart-legend--single)는 정가 점선이나 코드 적용가 점이 그려질 때 보인다(시리즈가 하나면 제목이 이미 무엇인지 말해 준다). 정가 데이터셋은
    // 할인일이 있으면 만들지만(툴팁이 그날의 정가를 알려 준다), 정가 값이 하루뿐이면 점선이 그려지지 않으므로 정가 항목은 없다. 항목은 그려지는
    // 것만 보인다: 정가 항목은 점선이 그려질 때, 코드 적용가 항목(data-legend="iherb-code")은 점이 그려질 때. 정가 항목은 키 모양으로 찾는다.
    // 코드 적용가 항목이 없는 옛 HTML에서는 그 조회가 비어, 지금처럼 정가 점선이 그려질 때만 범례가 보인다.
    const updateLegend = (datasets) => {
        const legend = document.querySelector('.chart-legend--single');
        if (!legend) return;
        const list = datasets.find((dataset) => dataset.key === 'list');
        const drawsList = Boolean(list && hasTwoValues(list.data));
        const drawsCode = datasets.some((dataset) => dataset.key === 'iherbCode');
        legend.hidden = !(drawsList || drawsCode);
        const listItem = legend.querySelector('.store-key--iherb-list')?.closest('li');
        const codeItem = legend.querySelector('[data-legend="iherb-code"]');
        if (listItem) listItem.hidden = !drawsList;
        if (codeItem) codeItem.hidden = !drawsCode;
    };

    // 보이는 기간의 값으로 데이터셋과 옵션을 새로 만들어 차트에 싣는다. 기간 버튼과 테마·768px 경계가 모두 이 하나를 거친다.
    // mode는 chart.update의 모드다. 기간이 바뀔 때는 기본(움직이며 바뀐다. 'active'로 갱신하면 모든 점이 호버 상태(hoverRadius)로
    // 그려진다), 모양만 바뀔 때는 'none'.
    const drawChart = (mode) => {
        const theme = common.readTheme();
        const windowData = buildWindow(currentPeriod);
        const datasets = buildDatasets(windowData, theme);

        updateLegend(datasets);
        document.querySelectorAll('.chart-period').forEach((button) => {
            button.classList.toggle('active', Number(button.dataset.period) === currentPeriod);
        });

        const options = buildChartOptions(theme, common.isMobile(), datasets.some((dataset) => dataset.key === 'iherbCode'));
        if (!priceChart) {
            const ctx = document.getElementById('priceHistoryChart')?.getContext('2d');
            if (!ctx) return;
            const config = { type: 'line', data: { labels: windowData.labels, datasets }, options };
            // 코드 적용가 연결선은 공통 조각에 있을 때만 단다. 옛 공통 조각에서는 undefined라 목록에 넣으면 Chart.js가 던진다.
            if (canDrawIherbCode) config.plugins = [common.iherbCodeConnector];
            priceChart = new Chart(ctx, config);
            return;
        }
        priceChart.data.labels = windowData.labels;
        priceChart.data.datasets = datasets;
        priceChart.options = options;
        priceChart.update(mode);
    };

    const readChartData = () => {
        const script = document.getElementById('price-chart-data');
        if (!script) return null;
        try {
            return JSON.parse(script.textContent);
        } catch (error) {
            console.error('가격 추이 데이터를 읽지 못했습니다:', error);
            return null;
        }
    };

    const initPriceChart = () => {
        if (typeof Chart === 'undefined' || !common) {
            console.error('Chart.js 또는 차트 공통 모듈을 불러오지 못해 가격 추이 차트를 표시할 수 없습니다.');
            showChartUnavailable('가격 추이 차트를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
            return;
        }

        const chartData = readChartData();
        if (!chartData || !chartData.labels || chartData.labels.length === 0) {
            console.log('No chart data available');
            showChartUnavailable('표시할 가격 추이 데이터가 아직 없습니다.');
            return;
        }

        fullChartData = {
            labels: [...chartData.labels],
            prices: [...chartData.prices],
            originals: Array.isArray(chartData.original_prices) ? [...chartData.original_prices] : [],
            iherbCode: canDrawIherbCode ? readIherbCode(chartData.iherb_code) : null
        };

        drawChart();
        common.onPresentationChange(() => drawChart('none'));
        // 가격 보기 설정이 바뀌면(다른 탭, 로그인 확인) 코드 적용가 점과 범례 항목을 넣거나 뺀다. 코드 적용가가 없는 상품은 달라질 것이 없다.
        if (fullChartData.iherbCode) common.onIherbCodeChange(() => drawChart('none'));
    };

    // Chart Period Controls
    const initChartControls = () => {
        document.querySelectorAll('.chart-period').forEach((button) => {
            button.addEventListener('click', () => {
                currentPeriod = Number(button.dataset.period);
                if (priceChart) drawChart();
            });
        });
    };

    // Image zoom effect
    const initImageZoom = () => {
        const mainImage = document.querySelector('.main-image img');
        if (!mainImage) return;

        let isZoomed = false;

        mainImage.style.cursor = 'zoom-in';
        mainImage.style.transition = 'transform 0.3s ease';

        mainImage.addEventListener('click', () => {
            if (!isZoomed) {
                mainImage.style.transform = 'scale(1.5)';
                mainImage.style.cursor = 'zoom-out';
                isZoomed = true;
            } else {
                mainImage.style.transform = 'scale(1)';
                mainImage.style.cursor = 'zoom-in';
                isZoomed = false;
            }
        });

        // Reset zoom on mouse leave
        mainImage.addEventListener('mouseleave', () => {
            if (isZoomed) {
                mainImage.style.transform = 'scale(1)';
                mainImage.style.cursor = 'zoom-in';
                isZoomed = false;
            }
        });
    };

    // 버튼에 마우스를 올리면 물결을 그린다. 모양은 product_detail.css의 .ripple이다.
    const initButtonEffects = () => {
        const buttons = document.querySelectorAll('.btn-primary, .btn-secondary');

        buttons.forEach(button => {
            button.addEventListener('mouseenter', (e) => {
                const rect = e.target.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const ripple = document.createElement('span');
                ripple.className = 'ripple';
                ripple.style.left = x + 'px';
                ripple.style.top = y + 'px';

                button.appendChild(ripple);

                setTimeout(() => ripple.remove(), 600);
            });
        });
    };

    // 한 초기화가 실패해도 나머지 UI 기능까지 함께 죽지 않도록 격리한다.
    const runSafely = (name, fn) => {
        try {
            fn();
        } catch (error) {
            console.error(`[product_detail] ${name} 초기화 실패:`, error);
        }
    };

    // Initialize everything when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        // 단독 차트 값이 없으면 비교 화면이다. 단독 차트를 시작하면 "데이터 없음" 안내가 뜨고 기간 버튼이 엉뚱한 차트를 건드린다.
        if (document.getElementById('price-chart-data')) {
            runSafely('priceChart', initPriceChart);
            runSafely('chartControls', initChartControls);
        }
        runSafely('imageZoom', initImageZoom);
        runSafely('buttonEffects', initButtonEffects);
    });
})();
