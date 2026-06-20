# 无限留言白纸地图 MVP

一个按区块懒加载的无限白纸留言地图。用户微信扫码支付 0.01 元后获得 1 次写入权限，发布 1 条留言扣 1 次。留言发布后固定不可改，只允许作者修改颜色。

## 本地启动

```powershell
pnpm install
pnpm db:migrate
pnpm dev
```

如果系统 PATH 里没有 Node/pnpm，可以直接使用项目内脚本：

```powershell
.\scripts\migrate.ps1
.\scripts\dev.ps1
```

默认访问地址：

```text
http://localhost:3000
```

## 环境变量

真实密钥放在 `.env.local`，仓库只提交 `.env.example`。如果这些微信支付密钥曾经暴露到公开环境，上线前请轮换 APIv3 密钥和相关证书。

## 数据库

需要 PostgreSQL，并设置：

```text
DATABASE_URL=postgres://postgres:postgres@localhost:5432/infinite_notes
```

先创建数据库：

```sql
CREATE DATABASE infinite_notes;
```
