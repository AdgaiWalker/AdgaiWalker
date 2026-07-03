# 08 · 经营模块(admin)— scaffolded

NorthStar 经营系统(offers/orders)。**代码与状态机完整,但默认 `NORTHSTAR_ENABLED=false` 门控**,属于"骨架已就绪、等社区/经营阶段激活"的预留位。

> 鉴权细节见 [01-auth.md](./01-auth.md)。

## ⚠️ 门控说明

所有写操作受 `isNorthStarEnabled()` 检查:关闭时 → **409** `{ error, code:"northstar-disabled" }`。这是产品决策(Human Gate),不是 bug。开启需要配置 `NORTHSTAR_ENABLED=true` 环境变量。

## offers — 商品/服务/能力发布(P5 §14)

### GET/POST/PATCH/DELETE /api/admin/northstar/offers
- **鉴权**:全部 **isAdminAsync**
- **GET**:→ `{ offers:[], count, northstarEnabled:bool }`
- **POST**:体 `{ kind("product"|"service"|"capability"), title(必填), description?, priceCents(必填,非负整数), currency?(默认 CNY) }` → 201 `{ ok:true, offer }`
  - **走 `requireHighRiskAudit`** action=`offer.publish`
- **PATCH** `?offerId=`:体 `{ status("active"|"unlisted") }` → `{ ok:true }`
  - **走审计** action=`offer.update`
- **DELETE** `?offerId=`:下架(status→unlisted)。
  - **走审计** action=`offer.unlist`
- **状态码**:200/201 / 409(northstar-disabled 或 invalid-transition) / 404(offer 不存在) / 503(storage-unavailable)
- **前端调用方**:`src/pages/admin/northstar.astro:214/225`

## orders — 订单/支付/履约/退款(P5 §14)

### GET/POST /api/admin/northstar/orders
- **鉴权**:全部 **isAdminAsync**
- **GET**:→ `{ orders:[], count, northstarEnabled }`
- **POST `?action=create`**(默认):体 `{ offerId(必填), buyerHandle?, quantity?(默认1) }` → 201 `{ ok:true, order }`(**不走审计**,create 不调 requireHighRiskAudit)
- **POST `?action=pay`**:体 `{ orderId(必填) }` → `{ ok:true, paymentIntent }`。**走审计** action=`order.transition`(合成 provider 即时成功;真实 webhook 待接入)
- **POST `?action=fulfill`**:体 `{ orderId }` → `{ ok:true, order }`。走审计
- **POST `?action=refund`**:体 `{ orderId, reason }` → `{ ok:true, order }`。走审计
- **状态码**:`northstar-disabled→409`、`not-found→404`、`invalid-transition→409`、`invalid-input→400`、`provider-error→502`、审计 fail-closed → **503 storage-unavailable**
- **前端调用方**:`src/pages/admin/northstar.astro:242`

## 支付 provider 说明

当前用 `DevSyntheticPaymentProvider`(合成,不真实收费)。真实支付 webhook 接入属于 NorthStar 社区网络本体任务,不在 iwalk.pro 个人站范围。

## 联调验证

```bash
# 先确认门控状态
curl -b cookies.txt "https://<vercel-url>/api/admin/northstar/offers"
# 预期:{ offers:[], count:0, northstarEnabled:false }

# 若 northstarEnabled=false,POST 应返回 409
curl -b cookies.txt -X POST https://<vercel-url>/api/admin/northstar/offers \
  -H "Content-Type: application/json" \
  -d '{"kind":"service","title":"测试服务","priceCents":100}'
# 预期:409 { error, code:"northstar-disabled" }

# 若已在 Vercel 配 NORTHSTAR_ENABLED=true,可验证完整链路
curl -b cookies.txt -X POST https://<vercel-url>/api/admin/northstar/offers \
  -H "Content-Type: application/json" \
  -d '{"kind":"service","title":"联调测试服务","priceCents":100,"currency":"CNY"}'
# 预期:201 { ok:true, offer:{...} }
```

## 已知边界

- **当前 scaffolded**:即使代码完整,在 Vercel 默认配置下所有写操作返回 409。这不是故障,是门控设计。
- **合成支付**:`pay` action 用合成 provider,联调时会"立即成功"。真实支付链路未接入。
- **不消耗站主注意力**:按 project-docs-index §1.4,这个模块在激活前不进入站主工作重心,日常改动只维护不扩展。
