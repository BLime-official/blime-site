// 상품 추가 요청 버튼(FAB)과 요청 모달. 요청 위젯(partials/product_request_widget.html)을 싣는 페이지만 싣는다.
// 요청 함수(supabase/functions/request-product-url)에 상품 URL을 보내고, 워커가 끝낼 때까지 상태를 조회한다.
(() => {
    // 요청 상태(product_intake_requests.status). 원본은 supabase/functions/request-product-url/contract.ts다.
    // 브라우저 스크립트라 import하지 못해 옮겨 적는다. tests/site/test_product_request.py가 계약의 상태를 모두 흘려 본다.
    const Status = {
        PENDING: 'pending',
        FETCHING: 'fetching',
        COMPLETED: 'completed',
        FAILED: 'failed',
    };
    const IN_PROGRESS = [Status.PENDING, Status.FETCHING];
    // 요청 함수가 성공 응답에 붙이는 코드(handler.ts). 실패 응답은 보여 줄 message를 함께 보낸다.
    const Code = {
        ACCEPTED: 'accepted',
        ALREADY_PENDING: 'already_pending',
        READY: 'ready',
    };

    // 결과 칸의 모양. 성공만 잠시 뒤 창을 닫는다. 대기는 아직 끝나지 않은 요청이다(첫 시도 실패, 3분 넘김).
    const ResultKind = {
        SUCCESS: 'success',
        ERROR: 'error',
        INFO: 'info',
    };
    // 대기 안내. 서버가 보낸 오류 코드와 메시지(예: Cloudflare Challenge)는 보여 주지 않는다.
    const RETRY_NOTICE = '요청이 접수되었습니다. iHerb에서 상품 정보를 바로 가져오지 못해 잠시 뒤 자동으로 다시 시도합니다. 창을 닫아도 됩니다.';
    const STILL_PROCESSING = '요청이 접수되었고 아직 처리 중입니다. 창을 닫아도 자동으로 처리됩니다.';

    const STATUS_CHECK_INTERVAL_MS = 2000;
    const MAX_STATUS_CHECKS = 90;
    const CLOSE_AFTER_SUCCESS_MS = 3000;
    // 스크롤하는 동안 버튼을 라벨이 보이게 펼치고, 스크롤이 멈추고 이만큼 지나면 다시 접는다.
    const FAB_FOLD_DELAY_MS = 700;

    const RESULT_ICONS = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    };

    // 입력한 글에서 iHerb 주소를 찾는다. 공유 문구째 붙여 넣어도 된다. 최종 판정은 요청 함수가 다시 한다.
    const extractAndValidateUrl = (input) => {
        const matches = input.match(/https?:\/\/[^\s]+/gi);
        if (!matches) {
            return null;
        }

        for (const url of matches) {
            try {
                // URL 끝에 붙어 온 공백이나 특수문자는 뗀다.
                const cleanUrl = url.trim().replace(/[<>"\s]+$/, '');
                const host = new URL(cleanUrl).hostname.toLowerCase();
                if (host === 'iherb.co' || host === 'iherb.com' || host.endsWith('.iherb.com')) {
                    return cleanUrl;
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    };

    // 성공 응답의 안내 문구. 요청 함수가 문구를 보내면 그것을 쓴다.
    const getSuccessMessage = (payload) => {
        if (payload && typeof payload.message === 'string' && payload.message.trim()) {
            return payload.message.trim();
        }

        const code = payload?.code || payload?.status;
        if (code === Code.ACCEPTED || IN_PROGRESS.includes(code)) {
            return '상품 추가 요청이 접수되었습니다. 가격 추적 준비가 시작됩니다.';
        }
        if (code === Code.ALREADY_PENDING) {
            return '이미 처리 중인 요청입니다.';
        }
        if (code === Code.READY || code === Status.COMPLETED) {
            return '상품이 등록되었습니다. 가격 추적이 시작됩니다.';
        }
        return '상품 추가 요청이 처리되었습니다.';
    };

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const authHeaders = (anonKey) => ({
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
    });

    // 워커가 요청을 끝낼 때까지 상태를 묻는다. 3분(2초 × 90번)이 지나도 진행 중이면 아직 처리 중이라고 대기 안내로 알린다.
    // 오류 코드가 붙은 pending은 앞선 시도가 일시 오류로 실패해 재시도를 기다린다는 뜻이라(워커는 이때만 남기고, 다시 집을 때
    // 지운다) 다음 시도를 기다리지 않고 대기 안내로 멈춘다.
    // 보여 줄 결과({ message, kind })를 돌려준다. 요청이 아예 실패하면 예외가 그대로 올라간다.
    const pollProductRequest = async (config, requestId, statusToken) => {
        for (let attempt = 0; attempt < MAX_STATUS_CHECKS; attempt++) {
            await wait(STATUS_CHECK_INTERVAL_MS);

            const statusUrl = `${config.requestFunctionUrl}?requestId=${encodeURIComponent(requestId)}&statusToken=${encodeURIComponent(statusToken)}`;
            const response = await fetch(statusUrl, {
                method: 'GET',
                headers: authHeaders(config.anonKey),
            });
            const statusPayload = await response.json().catch(() => null);

            if (!response.ok || !statusPayload?.success) {
                return { message: statusPayload?.message || '❌ 상태 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', kind: ResultKind.ERROR };
            }
            if (statusPayload.status === Status.COMPLETED) {
                return { message: `✅ ${getSuccessMessage(statusPayload)}`, kind: ResultKind.SUCCESS };
            }
            if (statusPayload.status === Status.FAILED) {
                return { message: `❌ ${statusPayload.errorMessage || '상품 추가 요청 처리에 실패했습니다. 잠시 후 다시 시도해주세요.'}`, kind: ResultKind.ERROR };
            }
            if (statusPayload.status === Status.PENDING && statusPayload.errorCode) {
                return { message: RETRY_NOTICE, kind: ResultKind.INFO };
            }
        }

        return { message: STILL_PROCESSING, kind: ResultKind.INFO };
    };

    // 상품 URL을 보내고 보여 줄 결과를 돌려준다. 워커가 처리할 요청이면 끝날 때까지 기다린다.
    const requestProduct = async (config, productUrl) => {
        const response = await fetch(config.requestFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders(config.anonKey),
            },
            body: JSON.stringify({
                productUrl: productUrl
            })
        });

        const payload = await response.json().catch(() => null);
        if (!payload) {
            throw new Error('invalid_response');
        }
        if (!response.ok || !payload.success) {
            return { message: payload.message || '❌ 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', kind: ResultKind.ERROR };
        }
        if (payload.requestId && payload.statusToken && IN_PROGRESS.includes(payload.status)) {
            return pollProductRequest(config, payload.requestId, payload.statusToken);
        }
        return { message: `✅ ${getSuccessMessage(payload)}`, kind: ResultKind.SUCCESS };
    };

    const initProductRequest = () => {
        const requestProductFab = document.getElementById('requestProductFab');
        const requestModal = document.getElementById('requestModal');
        const modalOverlay = document.getElementById('modalOverlay');
        const modalClose = document.getElementById('modalClose');
        const cancelBtn = document.getElementById('cancelBtn');
        const productRequestForm = document.getElementById('productRequestForm');
        const productUrlInput = document.getElementById('productUrl');
        const submitBtn = document.getElementById('submitBtn');
        const requestResult = document.getElementById('requestResult');
        const requestGuideToggle = document.getElementById('requestGuideToggle');
        const requestGuidePanel = document.getElementById('requestGuidePanel');

        if (!requestProductFab) return;
        if (!requestModal || !productRequestForm || !productUrlInput || !submitBtn || !requestResult) return;

        const requestConfig = window.BLIME_SUPABASE_CONFIG || {};
        const config = {
            requestFunctionUrl: requestConfig.requestFunctionUrl || '',
            anonKey: requestConfig.anonKey || '',
        };
        let fabScrollTimer = null;
        // 창을 닫을 때마다 오른다. 닫은 뒤에 도착한 지난 요청의 결과는 다시 연 창에 쓰지 않는다.
        let modalSession = 0;

        const handleProductRequestFabScroll = () => {
            requestProductFab.classList.add('is-scrolling');
            clearTimeout(fabScrollTimer);
            fabScrollTimer = setTimeout(() => requestProductFab.classList.remove('is-scrolling'), FAB_FOLD_DELAY_MS);
        };

        const setGuideOpen = (isOpen) => {
            if (!requestGuideToggle || !requestGuidePanel) return;
            requestGuideToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            requestGuidePanel.hidden = !isOpen;
            requestGuideToggle.textContent = isOpen ? '방법 접기' : '방법 확인하기';
        };

        const openModal = () => {
            requestModal.classList.add('modal-open');
            productUrlInput.focus();
        };

        const closeModal = () => {
            modalSession += 1;
            requestModal.classList.remove('modal-open');
            productRequestForm.reset();
            requestResult.innerHTML = '';
            requestResult.className = 'request-result';
            setGuideOpen(false);
        };

        const setLoading = (isLoading) => {
            submitBtn.disabled = isLoading;
            submitBtn.querySelector('.btn-text').style.display = isLoading ? 'none' : 'inline';
            submitBtn.querySelector('.btn-loading').style.display = isLoading ? 'inline-flex' : 'none';
        };

        // 결과를 모달 아래에 보여 준다. 요청 함수가 보낸 문구도 글자 그대로 넣는다. 성공하면 3초 뒤 모달을 닫는다.
        const showResult = (message, kind) => {
            requestResult.className = `request-result ${kind}`;
            requestResult.innerHTML = `
                <div class="result-icon">
                    ${RESULT_ICONS[kind]}
                </div>
                <div class="result-message"></div>
            `;
            requestResult.querySelector('.result-message').textContent = message;

            if (kind === ResultKind.SUCCESS) {
                setTimeout(closeModal, CLOSE_AFTER_SUCCESS_MS);
            }
        };

        const handleFormSubmit = async (e) => {
            e.preventDefault();

            const productUrl = extractAndValidateUrl(productUrlInput.value.trim());
            if (!productUrl) {
                showResult('올바른 iHerb 상품 URL을 입력해주세요.', ResultKind.ERROR);
                return;
            }

            setLoading(true);
            const session = modalSession;
            try {
                if (!config.requestFunctionUrl || !config.anonKey) {
                    showResult('❌ 서비스 준비 중입니다. 관리자에게 문의해주세요. (blime.app.official@gmail.com)', ResultKind.ERROR);
                    setLoading(false);
                    return;
                }

                const result = await requestProduct(config, productUrl);
                if (session === modalSession) {
                    showResult(result.message, result.kind);
                }
            } catch (error) {
                console.error('Error submitting request:', error);
                if (session !== modalSession) {
                    return;
                }
                if (error.message.includes('fetch')) {
                    showResult('❌ 네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.', ResultKind.ERROR);
                } else {
                    showResult('❌ 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', ResultKind.ERROR);
                }
            } finally {
                setLoading(false);
            }
        };

        requestProductFab.addEventListener('click', openModal);
        modalClose?.addEventListener('click', closeModal);
        modalOverlay?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        requestGuideToggle?.addEventListener('click', () => {
            const isOpen = requestGuideToggle.getAttribute('aria-expanded') === 'true';
            setGuideOpen(!isOpen);
        });
        window.addEventListener('scroll', handleProductRequestFabScroll, { passive: true });
        productRequestForm.addEventListener('submit', handleFormSubmit);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && requestModal.classList.contains('modal-open')) {
                closeModal();
            }
        });
    };

    document.addEventListener('DOMContentLoaded', initProductRequest);
})();
