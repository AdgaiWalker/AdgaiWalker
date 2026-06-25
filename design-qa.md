# Walker 登录与本地后台入口 Design QA

- source visual truth: `C:\Users\26296\.codex\generated_images\019edf9b-9874-7380-a0b9-63e0ae9ff8d8\exec-5098f107-85d2-4af9-8388-587215637178.png`
- problem-state screenshot: `C:\Users\26296\AppData\Local\Temp\codex-clipboard-0861acea-14ec-42fd-bd5f-fed515c2ece0.png`
- implementation: `http://127.0.0.1:4322/login`
- intended viewport: desktop 1600 × 1000, plus 900 px and 390 px responsive checks
- state: first local development visit, no account exists

## Full-view comparison evidence

The original problem-state screenshot shows a narrow deployment form with public navigation still visible. The implementation replaces it with the approved backend visual language: a spacious two-part glass surface, Walker emerald accent, direct product copy, real favicon, real atmospheric background, and no public navigation.

Implementation capture is still required before visual fidelity can be graded from rendered evidence.

## Focused comparison evidence

Not yet available. The required focused captures are the local-preview primary action, the collapsed production setup disclosure, and mobile input/tap-target layout.

## Findings

- [P0] Rendered screenshot comparison is missing.
  - Impact: typography, opacity, spacing, wrapping and responsive behavior cannot be honestly passed from code inspection alone.
  - Fix: capture the refreshed local login page and compare it beside the approved backend reference.

## Functional checks completed

- Development preview endpoint returns a signed owner preview session only in `DEV` and only for loopback hosts.
- The preview session opens `/admin` without creating an account or writing account data.
- Production builds do not expose the local preview endpoint.
- Login, registration, bootstrap, logout, password visibility and tab interactions remain implemented.
- `npm run build` passed.
- Modified login/auth files have no Astro diagnostics; repository-wide unrelated diagnostics remain.

## Patches made

- Rebuilt `/login` around a sparse Walker glass layout.
- Made local preview the primary first-run action; moved permanent owner setup into a secondary disclosure.
- Added a development-only preview session and a development-only fallback signing secret.
- Added explicit role-aware redirects after authentication.

final result: blocked
