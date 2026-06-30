# static/js/vendor

서드파티 브라우저 번들을 **자체 호스팅**하기 위한 디렉토리다.

## 왜 self-host 인가

과거에는 `cdn.jsdelivr.net`에서 직접 로드했는데, AdGuard 등 콘텐츠 차단기를 켠
모바일 브라우저에서 jsDelivr 요청이 차단되어 다음 기능이 통째로 죽었다.

- 가격 추이 차트 (Chart.js 미로드 → `new Chart()` 에서 ReferenceError)
- 로그인 / 즐겨찾기 (supabase-js 미로드 → `window.supabase` 없음 → 인증 클라이언트 null)

first-party 경로(`/js/vendor/...`)로 서빙하면 차단기 필터의 서드파티 도메인
규칙에 걸리지 않고, 방문자가 AdGuard 예외를 직접 설정할 필요도 없다.

## 파일 목록

| 파일 | 패키지 | 버전 | 출처 |
| --- | --- | --- | --- |
| `chart.umd.min.js` | `chart.js` | 4.4.0 | `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js` |
| `supabase.umd.min.js` | `@supabase/supabase-js` | 2.112.3 | `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js` |

두 파일 모두 UMD 번들이며 전역(`window.Chart`, `window.supabase`)을 정의한다.
템플릿의 로드 순서에 의존하는 코드가 있으므로 `type="module"` 로 바꾸지 말 것.

## 업데이트 방법

버전을 올릴 때는 아래처럼 **고정 버전 URL**로 내려받고 위 표를 함께 갱신한다.
`@2` 같은 range 태그는 재현이 불가능하므로 쓰지 않는다.

```bash
curl -sSL -o static/js/vendor/chart.umd.min.js \
  "https://cdn.jsdelivr.net/npm/chart.js@<version>/dist/chart.umd.min.js"

curl -sSL -o static/js/vendor/supabase.umd.min.js \
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@<version>/dist/umd/supabase.js"
```

교체 후 `pytest tests/test_no_external_cdn_assets.py` 로 계약을 확인한다.
