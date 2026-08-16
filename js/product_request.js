// 상품 추가 요청 모달. 요청 위젯(partials/product_request_widget.html)을 싣는 페이지(검색 화면과 홈)만 싣는다.
// 떠 있는 요청 버튼은 없다. 창은 [data-request-open]이 달린 요소를 누르면 열린다(검색 화면의 입구 셋, 3단계부터 홈의 한 줄).
// 요청 함수(supabase/functions/request-product-url)에 상품 URL을 보내고, 워커가 끝낼 때까지 상태를 조회한다.
// 전역 window.BLIME_PRODUCT_REQUEST = { open(prefillUrl), findIherbUrl(text) }는 다른 스크립트(검색 화면의 product_list.js)가 쓴다.
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
    const RETRY_NOTICE = '요청이 접수되었습니다. 잠시 뒤 자동으로 처리되니 창을 닫아도 됩니다.';
    const STILL_PROCESSING = '요청이 접수되었고 아직 처리 중입니다. 창을 닫아도 자동으로 처리됩니다.';

    // 로그인한 사람의 요청 문구. 요청한 상품이 관심상품에도 들어간다(익명 문구는 위의 것을 그대로 쓴다).
    const INVALID_URL_NOTICE = '올바른 iHerb 상품 URL을 입력해주세요.';
    const GENERIC_ERROR = '❌ 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    const MEMBER_ADDED = '✅ 관심상품에 추가했어요. 이미 가격을 추적하고 있는 상품이에요.';
    const MEMBER_ALREADY = '✅ 이미 관심상품에 있는 상품이에요.';
    const MEMBER_REGISTERED = '✅ 상품을 등록하고 관심상품에 추가했어요. 가격은 곧 사이트에 보여요.';
    const MEMBER_WAITING = '요청이 접수되었어요. 추적이 시작되면 관심상품에 넣어 드릴게요. 창을 닫아도 돼요.';
    // 상태 조회가 끝났을 때 보여 줄 문구. null이면 익명 요청의 문구를 쓴다.
    const GUEST_MESSAGES = { completed: null, waiting: null };
    const MEMBER_MESSAGES = { completed: MEMBER_REGISTERED, waiting: MEMBER_WAITING };
    const NOTE_MEMBER = '로그인되어 있어 요청한 상품은 관심상품에도 추가돼요.';
    const NOTE_GUEST = '로그인하면 요청한 상품이 관심상품에도 바로 추가돼요.';

    const STATUS_CHECK_INTERVAL_MS = 2000;
    const MAX_STATUS_CHECKS = 90;
    const CLOSE_AFTER_SUCCESS_MS = 3000;

    const RESULT_ICONS = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    };

    // 입력한 글에서 iHerb 주소를 찾는다. 공유 문구째 붙여 넣어도 된다. 최종 판정은 요청 함수가 다시 한다.
    // 요청 창이 보내기 전에 하는 검사이자, 검색 화면이 붙여 넣은 글을 링크 카드로 보일지 가르는 판정이다(같은 함수라야 둘이 어긋나지 않는다).
    // 링크 문자열 또는 null을 돌려준다.
    const findIherbUrl = (input) => {
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
    // messages = { completed, waiting }: 끝났을 때와 대기로 멈출 때의 문구. null이면 익명 문구다.
    const pollProductRequest = async (config, requestId, statusToken, messages = GUEST_MESSAGES) => {
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
                return { message: messages.completed || `✅ ${getSuccessMessage(statusPayload)}`, kind: ResultKind.SUCCESS };
            }
            if (statusPayload.status === Status.FAILED) {
                return { message: `❌ ${statusPayload.errorMessage || '상품 추가 요청 처리에 실패했습니다. 잠시 후 다시 시도해주세요.'}`, kind: ResultKind.ERROR };
            }
            if (statusPayload.status === Status.PENDING && statusPayload.errorCode) {
                return { message: messages.waiting || RETRY_NOTICE, kind: ResultKind.INFO };
            }
        }

        return { message: messages.waiting || STILL_PROCESSING, kind: ResultKind.INFO };
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
        // 로그인하면 이 상품을 관심상품에 넣을 수 있게 기억할 주소. 서버가 정리한 주소가 있으면 그것이다.
        const sentUrl = payload.normalizedUrl || productUrl;
        if (!response.ok || !payload.success) {
            return { message: payload.message || '❌ 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', kind: ResultKind.ERROR };
        }
        if (payload.requestId && payload.statusToken && IN_PROGRESS.includes(payload.status)) {
            const polled = await pollProductRequest(config, payload.requestId, payload.statusToken);
            return { ...polled, url: sentUrl };
        }
        return { message: `✅ ${getSuccessMessage(payload)}`, kind: ResultKind.SUCCESS, url: sentUrl };
    };

    // 로그인한 사람의 요청. 관심상품에도 넣도록 BLIME_FAVORITES.addFromShare로 보내고, 결과 코드를 보여 줄 결과로 옮긴다.
    // 서버가 로그인을 거절하면 { loginRequired: true }를 돌려, 부른 쪽이 익명으로 다시 보낸다. 함수가 직접 거절했으면 addFromShare가 이 기기의
    // 세션을 이미 지웠고, 게이트웨이의 401이면 세션은 남는다(설계 7.4).
    const requestProductAsMember = async (config, productUrl) => {
        const outcome = await window.BLIME_FAVORITES.addFromShare(productUrl);
        switch (outcome?.result) {
            case 'added':
                return { message: MEMBER_ADDED, kind: ResultKind.SUCCESS };
            case 'already_favorite':
                return { message: MEMBER_ALREADY, kind: ResultKind.SUCCESS };
            case 'pending':
                if (outcome.requestId && outcome.statusToken) {
                    return pollProductRequest(config, outcome.requestId, outcome.statusToken, MEMBER_MESSAGES);
                }
                return { message: MEMBER_WAITING, kind: ResultKind.INFO };
            case 'login_required':
                return { loginRequired: true };
            case 'invalid_url':
                return { message: INVALID_URL_NOTICE, kind: ResultKind.ERROR };
            default:
                return { message: GENERIC_ERROR, kind: ResultKind.ERROR };
        }
    };

    // 창을 여는 함수. 창이 있는 페이지에서 initProductRequest가 채운다. 창이 없는 마크업에서는 아무 일도 하지 않는다.
    let openRequestModal = () => {};

    // 이 스크립트를 실행할 때 정한다(DOMContentLoaded를 기다리지 않는다). 검색 화면의 product_list.js가 DOMContentLoaded 처리기에서 읽는다.
    window.BLIME_PRODUCT_REQUEST = {
        open: (prefillUrl = '') => openRequestModal(prefillUrl),
        findIherbUrl,
    };

    const initProductRequest = () => {
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

        // 요청 창이 없는 페이지(요청 위젯을 싣지 않는 페이지, 창이 없는 옛 마크업)에서는 조용히 지나간다.
        if (!requestModal || !productRequestForm || !productUrlInput || !submitBtn || !requestResult) return;

        // 안내 줄과 로그인 권유. 옛 마크업에는 없을 수 있어 없으면 건너뛴다.
        const favoriteNote = requestModal.querySelector('[data-request-favorite-note]');
        const favoriteNoteText = requestModal.querySelector('[data-request-favorite-note-text]');
        const loginOffer = requestModal.querySelector('[data-request-login-cta]');
        const loginButton = requestModal.querySelector('[data-request-login]');

        const requestConfig = window.BLIME_SUPABASE_CONFIG || {};
        const config = {
            requestFunctionUrl: requestConfig.requestFunctionUrl || '',
            anonKey: requestConfig.anonKey || '',
        };
        // 창을 닫을 때마다 오른다. 닫은 뒤에 도착한 지난 요청의 결과는 다시 연 창에 쓰지 않는다.
        let modalSession = 0;

        const setGuideOpen = (isOpen) => {
            if (!requestGuideToggle || !requestGuidePanel) return;
            requestGuideToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            requestGuidePanel.hidden = !isOpen;
            requestGuideToggle.textContent = isOpen ? '방법 접기' : '방법 확인하기';
        };

        // 안내 줄의 문구를 정하고 보인다. signedIn이 null이면(확인하지 못함) 숨긴다.
        const showNote = (signedIn) => {
            if (!favoriteNote || !favoriteNoteText) return;
            if (signedIn === null) {
                favoriteNote.hidden = true;
                return;
            }
            favoriteNoteText.textContent = signedIn ? NOTE_MEMBER : NOTE_GUEST;
            favoriteNote.hidden = false;
        };

        // 로그인 상태. 확인이 거절되거나 로그인 모듈이 없으면 null(모른다)이다.
        const readSignedIn = async () => {
            try {
                const isSignedIn = window.BLIME_AUTH?.isSignedIn;
                return typeof isSignedIn === 'function' ? Boolean(await isSignedIn()) : null;
            } catch (error) {
                return null;
            }
        };

        // 창을 열 때 안내 줄을 고른다. 확인하는 동안과 확인하지 못했을 때는 숨긴다. 그 사이에 창을 닫았으면 쓰지 않는다.
        // 관심상품 스크립트가 옛것이면(캐시의 옛 favorites.js, addFromShare 없음) 회원 요청도 로그인 뒤 넣기도 하지 못해 두 문구 모두
        // 지킬 수 없으므로 숨긴 채 둔다(2026-11-13 최종 검토).
        const refreshNote = async () => {
            const session = modalSession;
            showNote(null);
            if (!window.BLIME_FAVORITES?.addFromShare) return;
            const signedIn = await readSignedIn();
            if (session === modalSession) showNote(signedIn);
        };

        // prefillUrl이 있으면 입력칸을 그 링크로 채워서 연다(링크 카드의 버튼). 없으면 입력칸은 그대로다. 창을 닫을 때 폼을 비우므로 새로 열면 비어 있다.
        const openModal = (prefillUrl = '') => {
            requestModal.classList.add('modal-open');
            if (prefillUrl) {
                productUrlInput.value = prefillUrl;
            }
            productUrlInput.focus();
            refreshNote();
        };

        const closeModal = () => {
            modalSession += 1;
            requestModal.classList.remove('modal-open');
            productRequestForm.reset();
            requestResult.innerHTML = '';
            requestResult.className = 'request-result';
            if (loginOffer) loginOffer.hidden = true;
            if (favoriteNote) favoriteNote.hidden = true;
            setGuideOpen(false);
        };

        const setLoading = (isLoading) => {
            submitBtn.disabled = isLoading;
            submitBtn.querySelector('.btn-text').style.display = isLoading ? 'none' : 'inline';
            submitBtn.querySelector('.btn-loading').style.display = isLoading ? 'inline-flex' : 'none';
        };

        // 결과를 모달 아래에 보여 준다. 요청 함수가 보낸 문구도 글자 그대로 넣는다. 성공하면 3초 뒤 모달을 닫는다.
        // offer가 true이고 권유 자리가 있으면 로그인 권유를 함께 보이고, 권유가 보이는 동안에는 저절로 닫지 않는다.
        const showResult = (message, kind, offer = false) => {
            requestResult.className = `request-result ${kind}`;
            requestResult.innerHTML = `
                <div class="result-icon">
                    ${RESULT_ICONS[kind]}
                </div>
                <div class="result-message"></div>
            `;
            requestResult.querySelector('.result-message').textContent = message;

            const offerShown = Boolean(offer && loginOffer);
            if (loginOffer) loginOffer.hidden = !offerShown;

            if (kind === ResultKind.SUCCESS && !offerShown) {
                setTimeout(closeModal, CLOSE_AFTER_SUCCESS_MS);
            }
        };

        const handleFormSubmit = async (e) => {
            e.preventDefault();

            const productUrl = findIherbUrl(productUrlInput.value.trim());
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

                let result = null;
                // 로그인 확인: true(로그인), false(로그아웃), null(모름: 확인이 거절됐거나 로그인 모듈이 없다).
                const signedIn = await readSignedIn();
                // 로그아웃이 확실한 사람. 로그인 권유와 로그인 뒤 넣기는 이 사람에게만 한다.
                let signedOut = signedIn === false;
                if (signedIn && window.BLIME_FAVORITES?.addFromShare) {
                    result = await requestProductAsMember(config, productUrl);
                    if (result.loginRequired) {
                        // 서버가 토큰을 거절했다. 아무것도 하지 않았으므로 같은 URL을 익명으로 다시 보내고 로그아웃한 사람처럼 처리한다.
                        if (session === modalSession) showNote(false);
                        signedOut = true;
                        result = null;
                    }
                }
                if (!result) {
                    result = await requestProduct(config, productUrl);
                }
                if (session === modalSession) {
                    // 로그아웃한 사람의 익명 요청이 성공·대기로 끝나면 로그인 권유를 붙이고, 로그인한 뒤 자동으로 넣도록 URL을 기억한다. 오류에는 붙이지 않는다.
                    // 회원이 익명으로 보낸 경우(옛 favorites.js, 로그인 확인 거절)에는 붙이지 않는다. 로그인한 사람에게 로그인을 권하게 된다.
                    // 로그인 창(showLogin)이나 기억 장치(rememberForLogin)가 없으면 권유가 약속을 지킬 수 없어 붙이지 않는다(2026-11-13 최종 검토).
                    const offer = signedOut && Boolean(result.url) && result.kind !== ResultKind.ERROR
                        && typeof window.BLIME_AUTH?.showLogin === 'function'
                        && typeof window.BLIME_FAVORITES?.rememberForLogin === 'function';
                    if (offer) {
                        window.BLIME_FAVORITES.rememberForLogin(result.url);
                    }
                    showResult(result.message, result.kind, offer);
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

        openRequestModal = openModal;
        // 위임 클릭: [data-request-open]이 달린 요소를 누르면 창이 열리고, data-request-url에 값이 있으면 입력칸을 채운다.
        // 문서에 한 번만 걸어 나중에 붙은 요소(검색 결과를 그린 뒤의 입구)도 열고, 요소 안쪽(아이콘 등)을 눌러도 연다.
        document.addEventListener('click', (event) => {
            const trigger = event.target instanceof Element ? event.target.closest('[data-request-open]') : null;
            if (!trigger) return;
            event.preventDefault();
            openModal(trigger.dataset.requestUrl || '');
        });
        modalClose?.addEventListener('click', closeModal);
        modalOverlay?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        requestGuideToggle?.addEventListener('click', () => {
            const isOpen = requestGuideToggle.getAttribute('aria-expanded') === 'true';
            setGuideOpen(!isOpen);
        });
        loginButton?.addEventListener('click', () => {
            window.BLIME_AUTH?.showLogin?.();
        });
        productRequestForm.addEventListener('submit', handleFormSubmit);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && requestModal.classList.contains('modal-open')) {
                closeModal();
            }
        });
    };

    document.addEventListener('DOMContentLoaded', initProductRequest);
})();
