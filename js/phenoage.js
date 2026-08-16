// 생체나이 계산기(health/phenoage/)의 스크립트. 만 나이와 혈액 수치 9가지로 생체나이(PhenoAge)를 계산해 결과와 나이 막대를 보인다.
// 계산기 페이지에만 싣는다(phenoage.html의 page_scripts). 전역은 남기지 않는다.
//
// 마크업(phenoage.html, 승인된 시안 mock/calc-main.html 그대로):
//   폼 #pheno-form 안에 칸 상자 .pheno-field[data-field=이름]가 있고 입력은 #f-이름이다. 이름은 age, albumin, alp, creatinine, glucose, crp,
//   wbc, lymph, mcv, rdw다. 단위를 고르는 칸은 #f-crp-unit(""·mg/dL·mg/L)과 #f-wbc-unit(10³/µL·/µL), '미만' 체크는 #f-crp-lt다.
//   칸마다 오류 줄(.pheno-error)이 있고, 단추 위에 오류 요약(.pheno-summary)이 있다.
//   결과(.pheno-result)의 data-out(age 생체나이, diff 만 나이와의 차이, crp CRP 한 줄, big 차이가 아주 클 때의 안내)과 나이 막대(.pheno-bar)를 채운다.
//   화면 낭독기에는 결과 상자 밖의 늘 보이는 상태 줄(data-out="status", role="status")이 '생체나이 N세, 차이'를 읽는다. 숨었다 드러나는 결과 상자의
//   aria-live는 읽히지 않을 때가 많기 때문이다. '다시 계산' 단추는 결과와 함께 숨으므로, 누른 뒤 포커스를 결과 머리나 계산하기 단추로 옮긴다.
//
// 식(Levine ME 등, Aging 2018;10(4):573–591). 수치는 식의 단위로 바꿔 넣는다(아래 FIELDS의 to).
//   xb = −19.907 − 0.0336 × 알부민(g/L) + 0.0095 × 크레아티닌(µmol/L) + 0.1953 × 혈당(mmol/L) + 0.0954 × ln(CRP mg/dL) − 0.0120 × 림프구(%)
//        + 0.0268 × MCV(fL) + 0.3306 × RDW(%) + 0.00188 × ALP(U/L) + 0.0554 × 백혈구(10³/µL) + 0.0804 × 나이
//   생체나이 = 141.50225 + ln(0.00553 × H) ÷ 0.090165, H = e^xb × (e^(120 × 0.0076927) − 1) ÷ 0.0076927
//   결과는 소수 첫째 자리로 반올림해 보이고, 만 나이와의 차이도 반올림한 값으로 센다.
//
// 개인정보: 넣은 수치와 결과는 이 IIFE의 변수와 화면에만 있다. 저장소(쿠키, localStorage, sessionStorage, IndexedDB), 주소(쿼리·해시·history),
//   문서 제목에 쓰지 않고 어디로도 보내지 않는다(GA에는 아래 이벤트 이름만 간다). 폼은 보내지 않고(submit을 막는다) 계산만 한다.
//
// 이용 횟수(GA): 결과가 보일 때마다(다시 계산 포함) gtag("event", "phenoage_calculate")를 매개변수 없이 한 번 보낸다. 수치와 결과는 담지 않는다.
//   예시 수치로 낸 결과는 세지 않는다. 예시를 고친 뒤 다시 계산한 결과는 사람이 넣은 값의 계산이라 센다.
//   window.gtag가 함수가 아니면(차단 확장이 인라인 조각까지 막은 경우 등) 건너뛴다.
(() => {
    const form = document.getElementById("pheno-form");
    // 계산기 마크업이 없으면 아무것도 하지 않는다.
    if (!form) return;

    // to: 식이 쓰는 단위로 바꾸는 곱수. min·max는 식의 단위로 본 '나올 수 있는 값'의 범위다(정상 범위가 아니다).
    // swap: 다른 단위로 넣었을 때 알아보는 단위와, 단위를 고를 수 없는 칸에서 보일 바꾸는 법.
    const FIELDS = {
        age: { to: { "세": 1 }, min: 20, max: 100 },
        albumin: { to: { "g/dL": 10, "g/L": 1 }, min: 10, max: 65, swap: { from: "g/L", text: "검진표가 g/L이면 10으로 나눠 넣어 주세요." } },
        alp: { to: { "U/L": 1 }, min: 10, max: 2000 },
        creatinine: { to: { "mg/dL": 88.4, "µmol/L": 1 }, min: 17.68, max: 1326, swap: { from: "µmol/L", text: "eGFR 값이 아닌지 먼저 확인하고, 크레아티닌이 µmol/L로 적혀 있으면 88.4로 나눠 넣어 주세요." } },
        glucose: { to: { "mg/dL": 0.0555, "mmol/L": 1 }, min: 1.665, max: 33.3, swap: { from: "mmol/L", text: "당화혈색소(%)가 아닌지 먼저 확인하고, 혈당이 mmol/L로 적혀 있으면 18을 곱해 넣어 주세요." } },
        crp: { to: { "mg/dL": 1, "mg/L": 0.1 }, min: 0, max: 30 },
        wbc: { to: { "10³/µL": 1, "/µL": 0.001 }, min: 0.5, max: 200, swap: { from: "/µL" } },
        // 5% 아래는 개수(10³/µL, 보통 1.0~4.0)를 비율 칸에 넣은 경우로 본다(11-03 결정 14).
        lymph: { to: { "%": 1 }, min: 5, max: 90, low: "림프구 비율이 5%보다 낮습니다. 개수(10³/µL)가 아니라 비율(%)인지 확인해 주세요." },
        mcv: { to: { "fL": 1 }, min: 50, max: 150 },
        rdw: { to: { "%": 1 }, min: 8, max: 35 },
    };
    const ORDER = ["age", "albumin", "alp", "creatinine", "glucose", "crp", "wbc", "lymph", "mcv", "rdw"];
    const EXAMPLE = { age: "52", albumin: "4.4", alp: "70", creatinine: "0.9", glucose: "98", crp: "0.08", crpUnit: "mg/dL", wbc: "5.8", lymph: "33", mcv: "91", rdw: "13.0" };

    const root = document.querySelector(".pheno-main");
    const resultBox = root.querySelector(".pheno-result");
    const placeholder = root.querySelector(".pheno-placeholder");
    const summaryBox = root.querySelector(".pheno-summary");
    const limitBox = document.getElementById("f-crp-lt");
    const crpUnit = document.getElementById("f-crp-unit");
    const wbcUnit = document.getElementById("f-wbc-unit");
    const out = {
        age: resultBox.querySelector('[data-out="age"]'),
        diff: resultBox.querySelector('[data-out="diff"]'),
        crp: resultBox.querySelector('[data-out="crp"]'),
        big: resultBox.querySelector('[data-out="big"]'),
        bar: resultBox.querySelector(".pheno-bar"),
        tag: resultBox.querySelector(".pheno-tag"),
        stale: resultBox.querySelector(".pheno-stale"),
        status: root.querySelector('[data-out="status"]'),
    };
    const resultLabel = resultBox.querySelector(".pheno-result-label");
    const submitButton = form.querySelector(".pheno-submit");
    // 결과가 보이는지
    let shown = false;
    // 예시 단추로 채운 뒤 아직 고치지 않았는지. 결과의 '예시 수치' 표를 정한다.
    let example = false;

    // CRP 단위를 아직 고르지 않았으면 흐린 글자로 보인다(phenoage.css의 .is-empty).
    const markEmptyUnit = () => crpUnit.classList.toggle("is-empty", crpUnit.value === "");

    const fieldBox = (name) => root.querySelector(`.pheno-field[data-field="${name}"]`);
    const inputOf = (name) => document.getElementById(`f-${name}`);
    // 단위를 고르는 칸은 고른 단위, 아니면 그 칸의 단위 하나(FIELDS의 첫 단위)다.
    const unitOf = (name) => {
        const select = fieldBox(name).querySelector("select");
        return select ? select.value : Object.keys(FIELDS[name].to)[0];
    };
    const hasSelect = (name) => Boolean(fieldBox(name).querySelector("select"));

    // 앞뒤 빈칸을 빼고 전각 숫자·기호를 반각으로 읽는다(NFKC). 쉼표는 천 단위 묶음(5,500)일 때만 뺀다. 첫 묶음은 0으로 시작하지 않는다.
    // 소수 쉼표(0,9, 0,025)를 그냥 빼면 9, 25가 되어 범위 안에서 조용히 틀린 값이 되므로 숫자가 아닌 것으로 본다.
    const parse = (raw) => {
        let text = String(raw).normalize("NFKC").trim();
        if (text === "") return { empty: true };
        const less = /^</.test(text) || /미만$/.test(text);
        text = text.replace(/^<\s*/, "").replace(/\s*미만$/, "");
        if (text.includes(",")) {
            if (!/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(text)) return { invalid: true };
            text = text.replace(/,/g, "");
        }
        if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return { invalid: true };
        return { value: parseFloat(text), less };
    };

    // 칸 하나를 읽어 식의 단위로 바꾼다. 오류면 { error }, 나이는 { value }, 나머지는 { value, less, raw, unit }이다.
    const check = (name) => {
        const field = FIELDS[name];
        const parsed = parse(inputOf(name).value);
        if (parsed.empty) return { error: "값을 넣어 주세요." };
        if (parsed.invalid) return { error: "숫자로 넣어 주세요." };
        const unit = unitOf(name);
        if (!unit) return { error: "단위를 골라 주세요." };
        let less = false;
        if (name === "crp") {
            less = parsed.less || limitBox.checked;
            if (parsed.value <= 0) {
                return { error: "0보다 큰 수치가 필요합니다. ‘0.03 미만’처럼 적혀 있으면 그 숫자를 넣고 아래 칸을 체크하세요." };
            }
        } else if (parsed.less) {
            // '미만'(<)은 CRP에만 받는다.
            return { error: "숫자로 넣어 주세요." };
        }
        if (name === "age") {
            if (parsed.value < 20) return { error: "만 20세 이상만 계산할 수 있습니다." };
            if (parsed.value > 100) return { error: "나이를 확인해 주세요." };
            return { value: parsed.value };
        }
        const value = parsed.value * field.to[unit];
        if (field.low && value < field.min) return { error: field.low };
        if (value < field.min || value > field.max || value <= 0) {
            // 다른 단위로 보면 범위 안이면 그 단위로 넣은 것으로 보고 바꾸는 법을 알린다.
            const swap = field.swap;
            if (swap && swap.from !== unit) {
                const other = parsed.value * field.to[swap.from];
                if (other >= field.min && other <= field.max) {
                    const how = hasSelect(name) ? `검진표 단위가 ${swap.from}이면 그 단위를 고르세요.` : swap.text;
                    return { error: `${unit} 단위로는 나오기 어려운 값입니다. ${how}` };
                }
            }
            return { error: `${unit} 단위로는 나오기 어려운 값입니다. 검진표의 수치와 단위를 확인해 주세요.` };
        }
        return { value, less, raw: parsed.value, unit };
    };

    // 칸은 단위와 도움말을 늘 가리키고(템플릿의 aria-describedby), 오류 줄은 보일 때만 맨 앞에 가리킨다(product_report.js의 링크 오류와 같다).
    // 화면 낭독기가 칸에 왔을 때 오류 이유와 단위·도움말을 함께 읽게 하려는 것이다.
    const showError = (name, message) => {
        const box = fieldBox(name);
        const line = box.querySelector(".pheno-error");
        const input = inputOf(name);
        box.classList.toggle("is-error", Boolean(message));
        line.hidden = !message;
        line.textContent = message || "";
        input.setAttribute("aria-invalid", message ? "true" : "false");
        const described = (input.getAttribute("aria-describedby") || "").split(" ").filter((id) => id && id !== line.id);
        if (message) described.unshift(line.id);
        if (described.length) input.setAttribute("aria-describedby", described.join(" "));
        else input.removeAttribute("aria-describedby");
    };

    // v는 식의 단위로 바꾼 값이다. 사망 확률 M을 거치지 않고 ln(1 − M) = −H 꼴로 계산한다(M이 0이나 1에 가까워도 값이 무너지지 않는다).
    const phenoAge = (v) => {
        const xb = -19.907 - 0.0336 * v.albumin + 0.0095 * v.creatinine + 0.1953 * v.glucose + 0.0954 * Math.log(v.crp)
            - 0.0120 * v.lymph + 0.0268 * v.mcv + 0.3306 * v.rdw + 0.00188 * v.alp + 0.0554 * v.wbc + 0.0804 * v.age;
        const gamma = 0.0076927;
        const hazard = Math.exp(xb) * (Math.exp(120 * gamma) - 1) / gamma;
        return 141.50225 + Math.log(0.00553 * hazard) / 0.090165;
    };

    const oneDecimal = (value) => (Math.round(value * 10) / 10).toFixed(1);
    // 만 나이는 넣은 꼴대로 보인다(52, 52.5).
    const ageText = (age) => (age % 1 === 0 ? String(age) : oneDecimal(age));

    // 나이 막대: 두 나이를 10살 여유를 두고 10 단위로 감싼 눈금 위에 점으로 찍고 사이를 칠한다.
    // 점이 막대의 14%보다 왼쪽이거나 86%보다 오른쪽이면 글자를 막대 끝에 맞춰(is-start, is-end) 카드 밖으로 나가지 않게 한다.
    // 막대에 넣는 값은 계산한 숫자뿐이다.
    const drawBar = (pheno, age) => {
        const low = Math.max(0, Math.floor((Math.min(pheno, age) - 10) / 10) * 10);
        const high = Math.ceil((Math.max(pheno, age) + 10) / 10) * 10;
        const at = (value) => (value - low) / (high - low) * 100;
        const edge = (percent) => (percent < 14 ? " is-start" : percent > 86 ? " is-end" : "");
        const p = at(pheno);
        const a = at(age);
        out.bar.innerHTML =
            '<div class="pheno-bar-track">' +
            `<span class="pheno-bar-span" style="left:${Math.min(p, a)}%;width:${Math.abs(p - a)}%"></span>` +
            `<span class="pheno-bar-mark is-pheno${edge(p)}" style="left:${p}%"><span>생체나이 ${oneDecimal(pheno)}</span></span>` +
            `<span class="pheno-bar-mark is-age${edge(a)}" style="left:${a}%"><span>만 나이 ${ageText(age)}</span></span>` +
            `</div><div class="pheno-bar-scale"><span>${low}세</span><span>${high}세</span></div>`;
        out.bar.hidden = false;
    };

    const render = (pheno, age, crpNote) => {
        const shownAge = Math.round(pheno * 10) / 10;
        // 차이는 보이는 나이(반올림한 값)로 센다. 그래야 화면의 두 숫자가 서로 맞는다(44.5세, 7.5년 낮음).
        const diff = Math.round((shownAge - age) * 10) / 10;
        out.age.textContent = shownAge.toFixed(1);
        if (diff === 0) out.diff.innerHTML = `만 나이 ${ageText(age)}세와 <b>같음</b>`;
        else out.diff.innerHTML = `만 나이 ${ageText(age)}세보다 <b>${Math.abs(diff).toFixed(1)}년 ${diff < 0 ? "낮음" : "높음"}</b>`;
        out.status.textContent = `생체나이 ${shownAge.toFixed(1)}세, ${out.diff.textContent}`;
        out.crp.hidden = !crpNote;
        if (crpNote) out.crp.textContent = `CRP를 ${crpNote}로 넣어 계산했습니다. 실제 값은 이보다 낮아, 생체나이가 실제보다 높게 나왔을 수 있습니다. hs-CRP 결과가 있으면 그 값을 넣으세요.`;
        out.big.hidden = Math.abs(diff) < 20;
        drawBar(shownAge, age);
        out.tag.hidden = !example;
        resultBox.classList.remove("is-stale");
        out.stale.hidden = true;
        resultBox.hidden = false;
        placeholder.hidden = true;
        shown = true;
    };

    const hideResult = () => {
        resultBox.hidden = true;
        placeholder.hidden = false;
        out.status.textContent = "";
        shown = false;
    };

    // fromUser: 사람이 누른 계산(계산하기·Enter, 다시 계산, 예시 단추)이다. 첫 오류 칸이나 결과로 화면을 옮긴다.
    const calculate = (fromUser) => {
        const errors = [];
        const values = {};
        let crpNote = null;
        ORDER.forEach((name) => {
            const result = check(name);
            showError(name, result.error);
            if (result.error) {
                errors.push(name);
                return;
            }
            values[name] = result.value;
            if (name === "crp" && result.less) crpNote = `${result.raw} ${result.unit}`;
        });
        if (errors.length) {
            summaryBox.textContent = `${errors.length}개 항목을 확인해 주세요.`;
            summaryBox.hidden = false;
            hideResult();
            if (fromUser) {
                fieldBox(errors[0]).scrollIntoView({ block: "center", behavior: "smooth" });
                inputOf(errors[0]).focus({ preventScroll: true });
            }
            return;
        }
        const pheno = phenoAge(values);
        if (!Number.isFinite(pheno) || pheno < 0) {
            summaryBox.textContent = "넣은 수치 조합으로는 생체나이를 계산할 수 없습니다. 수치와 단위를 다시 확인해 주세요.";
            summaryBox.hidden = false;
            hideResult();
            return;
        }
        summaryBox.hidden = true;
        render(pheno, values.age, crpNote);
        // 이용 횟수: 결과가 보일 때마다 이름만 보낸다(수치·결과 없음). 예시 수치의 결과는 세지 않는다.
        if (!example && typeof window.gtag === "function") window.gtag("event", "phenoage_calculate");
        // 한 줄 배치(959px 이하)에서는 결과가 폼 아래에 있어 결과로 내려간다. PC는 오른쪽 칸에 바로 보인다.
        if (fromUser && window.matchMedia("(max-width: 959px)").matches) {
            resultBox.scrollIntoView({ block: "start", behavior: "smooth" });
        }
    };

    // 예시 단추가 칸을 채운다(예시 값만 쓴다). 백혈구 단위는 10³/µL로 돌린다.
    const fill = (values) => {
        ORDER.forEach((name) => {
            inputOf(name).value = values[name] == null ? "" : values[name];
        });
        crpUnit.value = values.crpUnit == null ? "" : values.crpUnit;
        markEmptyUnit();
        limitBox.checked = Boolean(values.crpLess);
        wbcUnit.value = "10³/µL";
    };

    const clearAll = () => {
        form.reset();
        markEmptyUnit();
        ORDER.forEach((name) => showError(name, null));
        summaryBox.hidden = true;
        example = false;
        hideResult();
    };

    // 결과가 보이는 동안 칸·단위·체크가 바뀌면 결과를 흐리고 '다시 계산'을 보인다. 저절로 다시 계산하지 않는다.
    // 고친 뒤의 결과는 사람이 넣은 값이라 예시 표를 뗀다. input과 change가 함께 와도 결과는 같다.
    const markStale = () => {
        if (!shown) return;
        example = false;
        out.tag.hidden = true;
        resultBox.classList.add("is-stale");
        out.stale.hidden = false;
    };

    // 계산은 폼 submit에 건다. 칸에서 Enter를 눌러도 이 길로 온다. 폼을 실제로 보내면 페이지가 다시 열려 값이 사라지고 주소에 ?가 붙는다.
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        calculate(true);
    });
    form.addEventListener("input", markStale);
    form.addEventListener("change", markStale);
    crpUnit.addEventListener("change", markEmptyUnit);
    root.querySelector(".pheno-recalc").addEventListener("click", () => {
        calculate(true);
        // 이 단추는 결과와 함께 숨는다. 포커스가 숨은 단추에 남아 body로 떨어지지 않게, 결과가 보이면 결과 머리로, 계산할 수 없는 조합이면
        // 계산하기 단추로 옮긴다. 오류가 나면 calculate가 이미 첫 오류 칸으로 옮겼다.
        if (shown) resultLabel.focus({ preventScroll: true });
        else if (resultBox.contains(document.activeElement)) submitButton.focus({ preventScroll: true });
    });
    root.querySelector(".pheno-example").addEventListener("click", () => {
        clearAll();
        fill(EXAMPLE);
        example = true;
        calculate(true);
    });
    root.querySelector(".pheno-clear").addEventListener("click", clearAll);
    markEmptyUnit();
})();
