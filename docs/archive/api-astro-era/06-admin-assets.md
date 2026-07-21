> **历史文档**：本文描述的是已退役的 Astro 单应用时代方案/记录。  
> **当前运行栈**见 `README.md`、`docs/architecture-modules.md`（React monorepo）。  
> 请勿按本文路径（`src/pages/*.astro`、`npx astro check`）施工。

# 06 · 能力资产(admin)

从真实经验沉淀到规则、Skill 准入的完整能力资产生命周期。全部需要 admin+ 权限。

> 鉴权细节见 [01-auth.md](./01-auth.md)。

## 经验验证(U10)

### GET/POST /api/admin/experience-events — 经验事件
- **鉴权**:**isAdminAsync**
- **GET**:query `limit`(1..100,默认 50)→ `{ events:[] }`(响应**无 Cache-Control**)
- **POST**(默认):体 `{ source?, rawQuote(必填,截断1000), surfaceNeed?, scenarioNote?, initialHypothesis?, helpAction?, feedbackResult?("success"|"failure"|"no-feedback"|"pending") }` → `{ ok:true, experienceId }`
- **POST `?action=update`**:体 `{ experienceId(必填), reflection?(截断2000), patternMarked?(bool), maturity?, feedbackResult? }` → `{ ok:true }`
- **不走审计**;无 storage-unavailable 分支
- **前端调用方**:`src/pages/admin/experiences.astro:220/239/245/257`

## 规则候选池(U9)

### GET/POST /api/admin/rules — 规则候选
- **鉴权**:**isAdminAsync**
- **GET**:`?limit=1..200`(默认 100)→ `{ rules:[] }`(响应**无 Cache-Control**)
- **POST**(默认):体 `{ ruleId?, description(必填,截断500), status?, positiveExamples?, negativeExamples?, sourceIds?, accuracy?, note?, createdAt? }` → `{ ok:true, ruleId }`(更新时合并保留 createdAt/正反例/来源)
- **POST `?action=status`**:体 `{ ruleId, status("observed"|"candidate"|"validated"|"stable"|"retired"), note? }` → `{ ok:true }`
- **状态机**:`observed → candidate → validated → stable → retired`(五态完整,见 `STATUS_FLOW`)
- **不走审计**
- **前端调用方**:`src/pages/admin/rules.astro:185/204/207/213`

## Skill 准入(U11)

### GET/POST /api/admin/skills — Skill 候选 + 准入 + 生命周期
- **鉴权**:**isAdminAsync**
- **GET**:`?limit=1..200`(默认 100)→ `{ skills:[] }`
- **POST `?action=admission`**:体 `{ skillId, admissionStatus("candidate"|"admitted"|"demoted-to-method"), skillRegistration? }`
  - admitted 时必须校验 boundary/反例/evalSet(`validateSkillRegistration`)
  - **走 `requireHighRiskAudit`** action=`skill.admission`
- **POST `?action=pause|resume|rollback`**:体 `{ skillId, reason(必填), toVersion? }`(不显式审计,但 service 内可能审计)
- **POST**(默认 create/update):体 `{ skillId?, name(必填,截断120), description?, admissionStatus?, domain?, inputConditions?, outputForm?, validationCriteria?, sourceExperienceIds?, version? }` → `{ ok:true, skillId }`
- **校验失败**:409 `{ error, code:"missing-boundary"|"missing-counterexample"|"missing-eval-set" }`
- **降级**:审计 fail-closed → **503 storage-unavailable**
- **前端调用方**:`src/pages/admin/skills.astro:254/278/281/287/294/306/333`

## 资产晋升与学习请求(P2-B + P4)

### GET /api/admin/assets/evidence — 资产支撑证据
- **鉴权**:**isAdminAsync**
- **请求**:`?kind("experience"|"rule"|"skill",必填)&assetId(必填)`
- **响应**:`{ kind, assetId, links:[], count }`
- **前端调用方**:`src/pages/admin/assets.astro:219`

### POST /api/admin/assets/promote — 资产晋升(P4 注册护栏)
- **鉴权**:**isAdminAsync**
- **请求体**:
  ```jsonc
  {
    "assetKind": "experience|rule|skill",       // 必填
    "assetId": "string",                         // 必填
    "toStage": "observed|candidate|validated|stable|retired",  // 必填
    "sourceOutcomeIds?": [],
    "sourceExperienceIds?": [],
    "reason": "string",                          // 必填
    "workItemId?": "string",
    "skillRegistration?": {
      "applicableBoundary": "",
      "failureBoundary": "",
      "positiveExamples?": [],
      "negativeExamples": [],
      "evalSet": [{ "input":"", "expectedOutput":"", "category":"normal|boundary|reject|failure" }]
    }
  }
  ```
- **响应**:201 `{ ok:true, link }`
- **走 `requireHighRiskAudit`** action=`asset.promote`
- **状态码**:201 / 503(storage-unavailable) / 404(not-found) / 409(missing-evidence/missing-boundary/missing-counterexample/missing-eval-set) / 400(invalid-input/invalid-stage)
- **前端调用方**:`src/pages/admin/assets.astro`(隐式)

### GET/POST/PATCH /api/admin/learning-requests — 学习请求(P2-B)
- **鉴权**:**isAdminAsync**
- **GET**:`?status=open|in-progress|fulfilled|dropped` → `{ items:[], count }`
- **POST**:体 `{ evidenceGap("practice"|"counter-example"|"interview"|"outcome"|"boundary"), context, expectedEvidence, topicId?, assetKind?("experience"|"rule"|"skill"), assetId?, workItemId? }` → 201 `{ ok:true, request }`
- **PATCH**:体 `{ requestId, fulfillmentNote }` → `{ ok:true, request }`
- **降级**:PATCH 时 `codeToStatus` map 含 `storage-unavailable→503`、`not-found→404`、`invalid-stage→400`、`missing-evidence→409`
- **前端调用方**:`src/pages/admin/assets.astro:182`

## 联调验证

```bash
# 经验事件列表
curl -b cookies.txt "https://<vercel-url>/api/admin/experience-events?limit=10"

# 新建经验
curl -b cookies.txt -X POST https://<vercel-url>/api/admin/experience-events \
  -H "Content-Type: application/json" \
  -d '{"rawQuote":"用户原话测试","scenarioNote":"测试场景","feedbackResult":"success"}'

# 规则候选列表
curl -b cookies.txt "https://<vercel-url>/api/admin/rules?limit=20"

# 新建规则
curl -b cookies.txt -X POST https://<vercel-url>/api/admin/rules \
  -H "Content-Type: application/json" \
  -d '{"description":"联调测试规则"}'

# Skill 列表
curl -b cookies.txt "https://<vercel-url>/api/admin/skills"

# 资产证据
curl -b cookies.txt "https://<vercel-url>/api/admin/assets/evidence?kind=experience&assetId=<id>"

# 学习请求
curl -b cookies.txt "https://<vercel-url>/api/admin/learning-requests?status=open"
```
