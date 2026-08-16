// 쿠팡이 연결된 상품의 상세 페이지(비교 화면): 가격 추이의 결론 한 줄·수치표·가격 범위 띠·그래프와 기간 버튼.
// 값은 서버가 심은 <script id="price-compare-data">다(app/site_builder/view_models/store_compare.py의 build_compare가 만든 chart).
// labels는 90일치 한국 날짜(오래된 순)이고, 날짜별 iHerb 판매가·정가와 쿠팡 하루 최저·최고는 labels와 같은 길이이며 값이 없는 날은 null이다.
// 지금 가격·품절 여부(now, available)와 판매처 순서(order), 문턱 상수(thresholds)도 거기 있다. 판정·판매처 행·구매 버튼은 서버가 그린다.
// 결론·수치표 본문·그래프는 기간(30일·90일)에 따라 바뀌므로 서버는 자리만 만들고(#chart-takeaway, #store-stats-body, #priceHistoryChart),
// 여기서 기간 버튼을 누를 때마다 같은 값으로 다시 그린다.
// iHerb 할인코드 적용가가 있는 상품은 JSON에 iherb_code({percent, price, order})도 있다(order는 코드 쪽 판정의 판매처 순서). 가격 보기 설정을 켠
// 방문자(<html data-iherb-code="on">)에게는 수치표를 그 순서로 그리고, iHerb 판매가 선이 끝나는 날에 코드 적용가 점을 더하며 범례 항목과 툴팁 줄을 보인다.
// 결론 한 줄·수치표 숫자·가격 범위 띠는 실제 가격 그대로다. 그 점이 있는 날의 툴팁은 꼬리 문구를 쓰지 않는다(위 판정이 코드 적용가 기준이라 부딪친다).
// iherb_code 키가 없는 페이지(꺼진 사이트, 옛 HTML)와 공통 조각에 코드 적용가 조각이 없을 때(캐시에 남은 옛 price_chart_common.js)는 지금처럼 그린다.
// 축·툴팁 모양·세로 안내선·테마 갱신·할인율 반올림은 단독 차트와 같이 쓰는 price_chart_common.js(window.BLIME_PRICE_CHART)가 맡는다.
(() => {
    const DEFAULT_PERIOD = 30;
    // 불러오지 못했으면(undefined) 그래프만 안내를 보인다. 결론·수치표는 그래프 없이도 그린다.
    const common = window.BLIME_PRICE_CHART;
    const canDrawChart = () => typeof Chart !== 'undefined' && Boolean(common);
    // iHerb 할인코드 적용가 점이 쓰는 공통 조각을 다 갖췄는가. 스크립트 주소에 버전이 없어 브라우저 캐시에 남은 옛 price_chart_common.js가 이 파일과 만날 수 있고,
    // 거기에는 이 조각이 없다. 없는 함수를 부르거나 플러그인 목록에 undefined를 넣으면 Chart.js가 던져 차트가 비어 버린다. 툴팁 위치 이름
    // (iherbCodeTooltipPosition)도 같다: 등록하지 않은 이름을 쓰면 Chart.js가 마우스를 올리는 순간 던진다.
    // 하나라도 없으면 코드 적용가 점·연결선·툴팁 줄·범례 항목·수치표 순서·설정 바뀜 듣기를 모두 건너뛰고 지금처럼 그린다(단독 차트의 product_detail.js와 같은 점검이다).
    const canDrawIherbCode = Boolean(common)
        && ['isIherbCodeOn', 'lastValueIndex', 'iherbCodeDataset', 'iherbCodeTooltipLine', 'iherbCodeTooltipPosition', 'onIherbCodeChange'].every((name) => typeof common[name] === 'function')
        && Boolean(common.iherbCodeConnector);

    const STORE_LABEL = { iherb: 'iHerb', coupang: '쿠팡' };
    const STORE_SUBJECT = { iherb: 'iHerb가', coupang: '쿠팡이' };
    const RANGE_VERDICT = {
        coupang: '쿠팡이 하루 내내 더 저렴',
        iherb: 'iHerb가 하루 내내 더 저렴',
        tie: '두 곳이 거의 같아요'
    };
    const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

    let data = null;
    let iherbCode = null;
    let chart = null;
    let period = DEFAULT_PERIOD;

    // ---------------------------------------------------------------- 형식
    // 원 단위 가격은 기간의 평균처럼 소수가 나올 수 있어 반올림해서 쓴다. 천 단위 쉼표는 공용 형식(format.js)이다.
    const plain = (value) => window.BLIME_FORMAT.price(Math.round(value));
    const won = (value) => `₩${plain(value)}`;

    // 'YYYY-MM-DD' → '9월 12일 (토)'
    const longDate = (iso) => {
        const [, month, day] = iso.split('-').map(Number);
        return `${month}월 ${day}일 (${WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;
    };

    // ---------------------------------------------------------------- iHerb 할인코드 적용가
    // 서버가 구한 코드 쪽 값 {percent, price, order}. 읽을 수 없으면(옛 HTML에는 키가 없다) 없는 것이다. order는 이 페이지의 판매처를 모두 담은 순서여야 한다.
    const readIherbCode = (value) => {
        if (!value || !Number.isFinite(value.percent) || !Number.isFinite(value.price) || !Array.isArray(value.order)) return null;
        const complete = value.order.length === data.order.length && data.order.every((store) => value.order.includes(store));
        return complete ? { percent: value.percent, price: value.price, order: value.order } : null;
    };

    // 코드 적용가 쪽을 보여 줄 때인가: 서버가 코드 쪽 값을 줬고 방문자의 가격 보기 설정이 켜져 있다.
    const showsIherbCode = () => Boolean(iherbCode) && common.isIherbCodeOn();

    // 코드 적용가 점이 서는 칸: iHerb 판매가 선이 끝나는 날. 코드 쪽을 보여 주지 않거나 그런 날이 없으면(기간에 iHerb 판매가가 하나도 없다) -1이다.
    const iherbCodeDay = (windowData) => (showsIherbCode() ? common.lastValueIndex(windowData.iherb) : -1);

    // 그 칸의 코드 적용가. 점이 없는 칸이면 null이다(툴팁이 점 데이터셋을 찾아 읽는다).
    const codePriceAt = (chartInstance, index) => {
        const dataset = chartInstance.data.datasets.find((item) => item.key === 'iherbCode');
        return dataset ? dataset.data[index] : null;
    };

    // ---------------------------------------------------------------- 기간의 값
    // 최근 days일의 값. JSON이 90일치라 뒤에서 days칸을 쓴다. 값이 없는 날은 null이다.
    const buildWindow = (days) => {
        const start = Math.max(0, data.labels.length - days);
        const part = (values) => values.slice(start);
        return {
            labels: part(data.labels),
            iherb: part(data.iherb.sale),
            iherbList: part(data.iherb.list),
            coupang: part(data.coupang.line),
            coupangLow: part(data.coupang.low),
            coupangHigh: part(data.coupang.high)
        };
    };

    // 정가가 판매가보다 높은 날이 할인일이다. 값이 없는 날(null)은 아니다.
    const isDiscounted = (original, price) => Number.isFinite(original) && Number.isFinite(price) && original > price;

    // 쿠팡은 그날 최저~최고를 모두 본다. 하루 내내 싸야 '더 저렴'이다. 문턱은 서버의 판정과 같은 max(300원, 싼 쪽 가격의 1%)이고
    // 값은 서버가 JSON(thresholds)으로 준다. iHerb 판매가나 쿠팡 하루 최저가 중 하나라도 없는 날은 null이다(견줄 수 없다).
    // 하루 최고가만 없으면 최저가를 최고가로 본다.
    const rangeOutcome = (iherb, low, high) => {
        if (!Number.isFinite(iherb) || !Number.isFinite(low)) return null;
        const top = Number.isFinite(high) ? high : low;
        const threshold = Math.max(data.thresholds.tie_min_won, Math.min(iherb, low) * data.thresholds.tie_rate);
        if (top < iherb - threshold) return 'coupang';
        if (iherb < low - threshold) return 'iherb';
        if (Math.abs(iherb - low) <= threshold && Math.abs(iherb - top) <= threshold) return 'tie';
        return 'mixed';
    };

    const summarize = (values) => {
        const present = values.filter(Number.isFinite);
        if (!present.length) return null;
        return {
            min: Math.min(...present),
            max: Math.max(...present),
            avg: present.reduce((sum, value) => sum + value, 0) / present.length
        };
    };

    // ---------------------------------------------------------------- 결론 한 줄
    // 기간 안에서 iHerb 판매가와 쿠팡 하루 최저가가 모두 있는 날만 센다.
    const renderTakeaway = (windowData) => {
        const element = document.getElementById('chart-takeaway');
        if (!element) return;
        const counts = { coupang: 0, iherb: 0 };
        let compared = 0;
        windowData.labels.forEach((_, index) => {
            const outcome = rangeOutcome(windowData.iherb[index], windowData.coupangLow[index], windowData.coupangHigh[index]);
            if (!outcome) return;
            compared += 1;
            if (outcome in counts) counts[outcome] += 1;
        });
        const leader = counts.coupang > counts.iherb ? 'coupang' : 'iherb';
        element.textContent = '';
        // 비교할 날이 적거나, 두 곳의 '하루 내내' 일수가 같으면 쓰지 않는다. 같다는 것에 둘 다 0일인 경우가 들어 있어서,
        // 앞선 쪽이 0일인 경우는 따로 볼 필요가 없다.
        element.hidden = compared < data.thresholds.takeaway_min_days || counts.coupang === counts.iherb;
        if (element.hidden) return;
        const strong = document.createElement('strong');
        strong.textContent = `${counts[leader]}일`;
        element.append(`최근 ${period}일 중 `, strong, `은 ${STORE_SUBJECT[leader]} 하루 내내 더 저렴했어요`);
    };

    // ---------------------------------------------------------------- 수치표와 가격 범위 띠
    // 판매처마다 지금·최저·평균·최고(판매처 순서대로). 쿠팡의 최저·평균은 하루 최저가, 최고는 하루 최고가다(그래프의 옅은 막대 끝).
    // 품절인 곳의 마지막 가격은 품절 전의 낡은 값이라 지금으로 쓰지 않는다(표에는 `품절`, 띠는 점과 눈금에서 뺀다).
    const buildRows = (windowData) => {
        const iherb = summarize(windowData.iherb);
        const lows = summarize(windowData.coupangLow);
        const highs = summarize(windowData.coupangHigh);
        const windowStats = {
            iherb: { min: iherb?.min ?? null, avg: iherb?.avg ?? null, max: iherb?.max ?? null },
            coupang: { min: lows?.min ?? null, avg: lows?.avg ?? null, max: highs?.max ?? lows?.max ?? null }
        };
        // 순서는 보이는 쪽의 판매처 행·구매 버튼과 같다(코드 쪽이 보이면 코드 쪽 순서). 숫자는 늘 실제 가격이다.
        return (showsIherbCode() ? iherbCode.order : data.order).map((store) => ({
            store,
            available: data[store].available,
            now: data[store].available ? data[store].now : null,
            ...windowStats[store]
        }));
    };

    const tableCell = (text, className) => {
        const cell = document.createElement('td');
        if (className) cell.className = className;
        cell.textContent = text;
        return cell;
    };

    const renderStats = (windowData) => {
        const body = document.getElementById('store-stats-body');
        if (!body) return;
        const rows = buildRows(windowData);
        // 가격 범위 띠의 눈금: 두 행의 최저·지금 중 가장 낮은 값 ~ 최고·지금 중 가장 높은 값. 두 판매처가 같은 눈금을 쓴다.
        const values = rows.flatMap((row) => [row.min, row.max, row.now]).filter(Number.isFinite);
        const lowest = Math.min(...values);
        const highest = Math.max(...values);
        // 눈금 위의 위치(%). 소수 둘째 자리까지만 쓴다.
        const percent = (value) => Math.round(((value - lowest) / (highest - lowest || 1)) * 10000) / 100;
        const mark = (className, value, label) => {
            const element = document.createElement('span');
            element.className = className;
            element.style.left = `${percent(value)}%`;
            if (label) element.title = `${label} ${plain(value)}원`;
            return element;
        };

        body.textContent = '';
        rows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            const th = document.createElement('th');
            th.scope = 'row';
            const key = document.createElement('span');
            key.className = `store-key store-key--${row.store}`;
            key.setAttribute('aria-hidden', 'true');
            th.append(key, STORE_LABEL[row.store]);
            tr.append(th);

            tr.append(row.available ? tableCell(plain(row.now), 'is-now') : tableCell('품절', 'is-now is-muted'));
            [row.min, row.avg, row.max].forEach((value) => {
                tr.append(tableCell(Number.isFinite(value) ? plain(value) : '-'));
            });

            // 가격 범위 띠(PC에서만 보인다): 범위(판매처 색 막대), 평균(세로 눈금), 지금(점). 기간의 값이 없는 곳은 지금 점만 있다.
            const rangeCell = document.createElement('td');
            rangeCell.className = `range-cell range-cell--${row.store}`;
            const track = document.createElement('div');
            track.className = 'range-track';
            if (Number.isFinite(row.min) && Number.isFinite(row.max)) {
                const span = mark('range-span', row.min);
                span.style.width = `${Math.round((percent(row.max) - percent(row.min)) * 100) / 100}%`;
                track.append(span);
            }
            if (Number.isFinite(row.avg)) track.append(mark('range-avg', row.avg, '평균'));
            if (Number.isFinite(row.now)) track.append(mark('range-now', row.now, '지금'));
            rangeCell.append(track);
            if (rowIndex === rows.length - 1 && values.length) {
                const scale = document.createElement('div');
                scale.className = 'range-scale';
                [lowest, highest].forEach((value) => {
                    const end = document.createElement('span');
                    end.textContent = plain(value);
                    scale.append(end);
                });
                rangeCell.append(scale);
            }
            tr.append(rangeCell);
            body.append(tr);
        });
    };

    // ---------------------------------------------------------------- 그래프
    const lastIndexOf = (values) => {
        for (let index = values.length - 1; index >= 0; index -= 1) {
            if (Number.isFinite(values[index])) return index;
        }
        return -1;
    };

    // 선: 2px, 끝점(지금 가격)에만 바탕색 테두리를 두른 점. 단조 보간이라 실제로 없던 값으로 넘치지 않고, 값이 없는 날은 이어 그린다.
    const lineDataset = (key, label, values, color, theme, extra) => {
        const last = lastIndexOf(values);
        return {
            key,
            label,
            data: values,
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2,
            borderCapStyle: 'round',
            borderJoinStyle: 'round',
            cubicInterpolationMode: 'monotone',
            spanGaps: true,
            fill: false,
            pointRadius: (context) => (context.dataIndex === last ? 4 : 0),
            pointHoverRadius: 5,
            pointHitRadius: 12,
            pointBackgroundColor: color,
            pointBorderColor: theme.surface,
            pointBorderWidth: 2,
            ...extra
        };
    };

    const hasSaleDay = (windowData) => windowData.iherbList.some((list, index) => isDiscounted(list, windowData.iherb[index]));

    // 정가 점선이 그려지는가: 할인일이 있고(그때 데이터셋을 만든다) 정가 값이 둘 이상이어야 한다. 점 하나로는 선이 되지 않는다(새 상품의
    // 첫 할인일). 값이 없는 날(null)은 값이 아니다. 빈 날은 이어 그리므로(spanGaps) 값이 떨어져 있어도 둘이면 그려진다.
    const drawsListLine = (windowData) => hasSaleDay(windowData) && windowData.iherbList.filter(Number.isFinite).length >= 2;

    // iHerb 판매가·쿠팡 하루 최저가 두 선이 주인공이고, 쿠팡 하루 최저~최고는 옅은 막대로 뒤에 깐다. iHerb 정가는 점선으로 판매가 아래에 그린다.
    // 정가 점선은 보이는 기간에 할인일이 있을 때만 만든다(할인이 없는 날은 판매가와 겹쳐 실선 아래에 숨는다). 코드 적용가 점은 설정이 켜져 있을 때만
    // iHerb 판매가 선이 끝나는 날(마지막으로 판매가가 있는 날)에 더한다. 그런 날이 없으면 점도 없다.
    // 데이터셋은 키(iherb, coupang, coupangRange, iherbList, iherbCode)로 알아본다. 기간이 바뀔 때마다 처음부터 다시 만든다.
    const buildDatasets = (windowData, theme) => {
        const datasets = [
            lineDataset('iherb', 'iHerb', windowData.iherb, theme.iherb, theme, { order: 0 }),
            lineDataset('coupang', '쿠팡', windowData.coupang, theme.coupang, theme, { order: 1 }),
            {
                type: 'bar',
                key: 'coupangRange',
                label: '쿠팡 하루 범위',
                // 떠 있는 막대 [최저, 최고]. 최고가 최저보다 높은 날만 그린다(오늘 최고는 서버가 마지막 수집가까지 넓혀 준다).
                data: windowData.coupangLow.map((low, index) => {
                    const high = windowData.coupangHigh[index];
                    return Number.isFinite(low) && Number.isFinite(high) && high > low ? [low, high] : null;
                }),
                backgroundColor: theme.coupangRange,
                borderWidth: 0,
                borderRadius: 2,
                borderSkipped: false,
                barPercentage: 0.6,
                categoryPercentage: 1,
                maxBarThickness: 5,
                order: 6
            }
        ];
        if (hasSaleDay(windowData)) {
            datasets.push({
                key: 'iherbList',
                label: 'iHerb 정가',
                data: windowData.iherbList,
                borderColor: theme.iherbList,
                borderWidth: 1.5,
                borderDash: [5, 4],
                cubicInterpolationMode: 'monotone',
                spanGaps: true,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 0,
                pointHitRadius: 0,
                order: 2
            });
        }
        const codeDay = iherbCodeDay(windowData);
        if (codeDay >= 0) {
            datasets.push(common.iherbCodeDataset(theme, windowData.iherb.length, codeDay, iherbCode.price));
        }
        return datasets;
    };

    // 툴팁은 같은 날짜의 iHerb·쿠팡 두 선만, 가격 오름차순으로 보여 준다(정가 점선, 하루 범위 막대, 코드 적용가 점은 항목이 아니다).
    // 코드 적용가 점이 있는 날은 iHerb 줄 맨 끝에 한 줄을 더하고, 꼬리 문구는 쓰지 않는다.
    const buildTooltip = (windowData) => {
        const tooltip = common.tooltipBase();
        return {
            ...tooltip,
            // 코드 적용가 점이 그려지는 기간에만: 점도 그날의 활성 요소라 기본 위치(평균)에 들면 꼬리가 선들에서 점 쪽으로 끌려 내려간다. 점을 뺀 평균에 둔다.
            ...(iherbCodeDay(windowData) >= 0 ? { position: common.iherbCodeTooltipPosition() } : {}),
            footerFont: { size: 12, weight: '600' },
            footerMarginTop: 8,
            bodySpacing: 4,
            filter: (item) => ['iherb', 'coupang'].includes(item.dataset.key) && item.raw !== null && item.raw !== undefined,
            itemSort: (a, b) => a.parsed.y - b.parsed.y,
            callbacks: {
                ...tooltip.callbacks,
                // 보이는 항목이 하나도 없는 날(두 선 모두 값이 없고 정가 점선만 있는 날)에도 부르므로 items가 비었을 수 있다.
                title: (items) => {
                    if (!items.length) return [];
                    const date = items[0].label;
                    return date === data.today ? `${longDate(date)} · 오늘` : longDate(date);
                },
                // 쿠팡의 오늘 값은 마지막 수집가다. 품절이면 오늘 선이 일별 최저가라 '지금'이라고 쓰지 않는다.
                label: (item) => {
                    const now = item.dataset.key === 'coupang' && item.label === data.today && data.coupang.available;
                    return `${item.dataset.label}  ${won(item.parsed.y)}${now ? ' (지금)' : ''}`;
                },
                afterLabel: (item) => {
                    const index = item.dataIndex;
                    if (item.dataset.key === 'iherb') {
                        const lines = [];
                        const list = windowData.iherbList[index];
                        if (isDiscounted(list, item.parsed.y)) {
                            lines.push(`  정가 ${won(list)} · ${common.discountPercent(list, item.parsed.y)}% 할인`);
                        }
                        const codePrice = codePriceAt(item.chart, index);
                        if (Number.isFinite(codePrice)) lines.push(common.iherbCodeTooltipLine(iherbCode.percent, codePrice));
                        return lines;
                    }
                    const low = windowData.coupangLow[index];
                    const high = windowData.coupangHigh[index];
                    if (!Number.isFinite(low)) return '';
                    if (item.label === data.today && data.coupang.available) return `  오늘 최저 ${won(low)}`;
                    return Number.isFinite(high) && high > low ? `  하루 중 ${won(low)}~${won(high)}` : '';
                },
                // 하루 범위로 본 판정. 하루 사이 엇갈린 날(mixed)과 견줄 값이 없는 날은 꼬리를 쓰지 않는다(위 두 줄의 가격과 하루 범위로 충분하다).
                // 코드 적용가 점이 있는 날도 쓰지 않는다: 꼬리는 실제 가격으로 본 판정이라, 코드 적용가로 본 위 판정과 다르게 말할 수 있다.
                // 빈 줄이 그려지지 않게 빈 문자열이 아니라 빈 배열을 돌려준다.
                footer: (items) => {
                    if (!items.length) return [];
                    const index = items[0].dataIndex;
                    if (Number.isFinite(codePriceAt(items[0].chart, index))) return [];
                    const outcome = rangeOutcome(windowData.iherb[index], windowData.coupangLow[index], windowData.coupangHigh[index]);
                    return RANGE_VERDICT[outcome] ?? [];
                }
            }
        };
    };

    const buildOptions = (windowData, theme, mobile) => {
        const y = common.yScale(theme, mobile);
        // 선 둘과 막대가 겹치는 그래프라 단독 차트(6·8개)보다 눈금을 덜 둔다(시안: 모바일 5개, 데스크톱 6개).
        y.ticks.maxTicksLimit = mobile ? 5 : 6;
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 350 },
            interaction: { mode: 'index', intersect: false },
            layout: { padding: common.layoutPadding(mobile) },
            plugins: {
                // 범례는 HTML(.chart-legend)이 그린다.
                legend: { display: false },
                tooltip: buildTooltip(windowData)
            },
            scales: {
                y,
                x: common.xScale(theme, mobile, (label) => window.BLIME_FORMAT.compactDate(label))
            }
        };
    };

    // 보이는 기간의 값으로 데이터셋과 옵션을 새로 만들어 차트에 싣는다. 기간 버튼과 테마·768px 경계가 모두 이 하나를 거친다.
    // mode는 chart.update의 모드다. 기간이 바뀔 때는 기본(움직이며 바뀐다), 모양만 바뀔 때는 'none'.
    const drawChart = (mode) => {
        const theme = common.readTheme();
        const windowData = buildWindow(period);
        const datasets = buildDatasets(windowData, theme);
        const options = buildOptions(windowData, theme, common.isMobile());
        if (!chart) {
            const ctx = document.getElementById('priceHistoryChart')?.getContext('2d');
            if (!ctx) return;
            chart = new Chart(ctx, {
                type: 'line',
                data: { labels: windowData.labels, datasets },
                options,
                // 코드 적용가 연결선은 코드 쪽 값이 있는 페이지에서만 단다(공통 조각의 점검을 거쳐 있다). 목록에 undefined를 넣으면 Chart.js가 던진다.
                plugins: iherbCode ? [common.crosshair, common.iherbCodeConnector] : [common.crosshair]
            });
            return;
        }
        chart.data.labels = windowData.labels;
        chart.data.datasets = datasets;
        chart.options = options;
        chart.update(mode);
    };

    // Chart.js는 first-party로 서빙하지만, 네트워크 실패나 콘텐츠 차단기 등으로 로드되지 않는 경우가 있다.
    // 그 때 조용히 빈 영역을 남기지 않고 안내를 보여준다(단독 차트의 안내와 같다).
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

    // ---------------------------------------------------------------- 기간 버튼과 시작
    // 기간이 바뀔 때마다 결론·수치표·범례·그래프를 같은 기간의 값으로 다시 그린다. 가격 보기 설정이 바뀔 때도 같다(수치표 순서와 코드 적용가 점이 바뀐다).
    // mode는 drawChart로 넘어간다(chart.update의 모드). 기본은 움직이며 바뀌고, 설정 바뀜은 모양만 바뀌므로 'none'.
    const render = (mode) => {
        const windowData = buildWindow(period);
        document.querySelectorAll('[data-period-label]').forEach((element) => {
            element.textContent = `${period}일`;
        });
        document.querySelectorAll('.chart-period').forEach((button) => {
            const active = Number(button.dataset.period) === period;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        renderTakeaway(windowData);
        renderStats(windowData);
        // 정가 항목은 보이는 기간에 정가 점선이 그려질 때만 보인다
        const legend = document.querySelector('.chart-legend li[data-legend="iherb-list"]');
        if (legend) legend.hidden = !drawsListLine(windowData);
        // 코드 적용가 항목은 점이 그려질 때만 보인다(코드 쪽 마크업이 없는 옛 HTML에는 항목이 없다)
        const codeLegend = document.querySelector('.chart-legend li[data-legend="iherb-code"]');
        if (codeLegend) codeLegend.hidden = iherbCodeDay(windowData) < 0;
        if (canDrawChart()) drawChart(mode);
    };

    const readCompareData = () => {
        const script = document.getElementById('price-compare-data');
        if (!script) return null;
        try {
            return JSON.parse(script.textContent);
        } catch (error) {
            console.error('가격 비교 데이터를 읽지 못했습니다:', error);
            return null;
        }
    };

    const init = () => {
        data = readCompareData();
        if (!data) {
            showChartUnavailable('표시할 가격 추이 데이터가 아직 없습니다.');
            return;
        }
        iherbCode = canDrawIherbCode ? readIherbCode(data.iherb_code) : null;
        if (!canDrawChart()) {
            console.error('Chart.js 또는 차트 공통 모듈을 불러오지 못해 가격 추이 차트를 표시할 수 없습니다.');
            showChartUnavailable('가격 추이 차트를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
        }
        document.querySelectorAll('.chart-period').forEach((button) => {
            button.addEventListener('click', () => {
                period = Number(button.dataset.period);
                render();
            });
        });
        render();
        if (canDrawChart()) common.onPresentationChange(() => drawChart('none'));
        // 가격 보기 설정이 바뀌면(다른 탭, 로그인 확인) 수치표 순서·범례·코드 적용가 점을 맞춘다. 코드 쪽 값이 없는 상품은 달라질 것이 없다.
        if (iherbCode) common.onIherbCodeChange(() => render('none'));
    };

    document.addEventListener('DOMContentLoaded', init);
})();
