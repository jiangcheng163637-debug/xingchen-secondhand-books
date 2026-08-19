# 微信云开发部署说明

## 1. 创建环境

在微信开发者工具中开通云开发，至少建立两个隔离环境：

- 开发环境：日常联调和测试数据
- 生产环境：正式用户数据

将生产或开发环境 ID 填入 `miniprogram/config/env.js` 的 `cloudEnvId`，确认后再把 `enableCloud` 改为 `true`。

## 2. 创建集合

需要创建以下集合：

- `users`
- `books`
- `seller_contacts`
- `favorites`
- `history`
- `intentions`
- `contact_views`
- `reports`
- `feedback`

集合权限建议全部设置为“仅云函数可读写”。客户端页面不应直连数据库，所有请求均通过四个业务域云函数。

`users` 与 `books` 使用 `schoolId`、`schoolName`、`campusId`、`campusName`、`provinceId`、`provinceName`、`schoolCity` 保存学校快照。升级旧环境时无需批量修改旧记录；用户再次保存资料、新发布书籍后会写入完整字段，旧记录继续按兼容字段展示。

## 3. 建议索引

按控制台提示创建复合索引：

- `users`: `_openid` 升序
- `books`: `status + deletedAt + publishedAt(降序) + _id(降序)`
- `books`: `status + deletedAt + schoolId + campusId + publishedAt(降序) + _id(降序)`
- `books`: `status + deletedAt + schoolId + campusId + category + publishedAt(降序) + _id(降序)`
- `books`: `sellerOpenId + deletedAt + createdAt(降序) + _id(降序)`
- `books`: `status + deletedAt + searchKeywords + publishedAt(降序)`
- `favorites`: `userOpenId + createdAt(降序) + _id(降序)`
- `history`: `userOpenId + lastViewedAt(降序) + _id(降序)`
- `intentions`: `buyerOpenId + createdAt(降序)`
- `contact_views`: `viewerOpenId + createdAt(降序)`
- `reports`: `reporterOpenId + targetType + targetId + status`
- `feedback`: `userOpenId + createdAt(降序)`

云数据库会根据具体查询提示缺失索引；首次联调时按提示补建即可。

## 4. 联系方式加密密钥

`book` 与 `engagement` 云函数必须配置相同环境变量：

```text
CONTACT_ENCRYPTION_KEY=至少16位的随机高强度字符串
```

不要把真实密钥写入代码、Git 或截图。更换密钥前必须先设计历史数据迁移，否则旧联系方式无法解密。

## 5. 部署云函数

依次在微信开发者工具中右键以下目录，选择“上传并部署：云端安装依赖”：

1. `cloudfunctions/user`
2. `cloudfunctions/book`
3. `cloudfunctions/engagement`
4. `cloudfunctions/moderation`

每个函数均为独立部署单元，自带 `package.json`，依赖 `wx-server-sdk`。

## 6. 内容安全权限

在 `user`、`book`、`moderation` 云函数中使用了 `security.msgSecCheck`。请在云函数权限配置或微信后台开放能力中声明并开通对应接口。

当前代码对文本采用“检测失败即拒绝写入”，不会在安全接口异常时默认放行。书籍图片已上传云存储，但图片异步安全回调、自动隔离和复审流程仍需在正式提审前补齐；在此之前建议由运营控制台人工复核新发布图片。

## 7. 函数测试样例

```json
{
  "action": "init"
}
```

```json
{
  "action": "list",
  "pageSize": 6
}
```

```json
{
  "action": "search",
  "keyword": "高等数学",
  "pageSize": 6
}
```

上述 JSON 是 action 结构示例。由于云函数会从微信调用上下文读取 OpenID，建议通过小程序前端触发测试；若直接在云函数控制台运行且没有模拟微信上下文，可能得到 `UNAUTHORIZED`，这不代表函数部署失败。联调时先打开小程序触发 `user.init`，再测试发布、收藏、联系方式与举报。

## 8. 管理员

后台审核操作由 `moderation.reviewBook` 提供，仅当 `users.role` 为 `admin` 时允许执行。管理员角色只能由可信运营人员在云开发控制台中手工设置，客户端不得提供提权入口。
