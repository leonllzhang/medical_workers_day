# 医师节知识竞赛系统 — 部署运维手册

## 目录

1. [环境要求](#1-环境要求)
2. [部署步骤](#2-部署步骤)
3. [启动与停止](#3-启动与停止)
4. [日常运维](#4-日常运维)
5. [访问地址与端口](#5-访问地址与端口)
6. [常见问题](#6-常见问题)
7. [项目结构说明](#7-项目结构说明)

---

## 1. 环境要求

| 组件 | 版本 | 说明 |
|------|------|------|
| Node.js | 22.x 或 24.x | 推荐 22 LTS |
| npm | 随 Node 自带 | — |
| PM2 | 最新版 | 进程守护工具 |

Ubuntu 安装 Node.js 24：

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 验证
```

安装 PM2：

```bash
sudo npm install -g pm2
pm2 --version
```

---

## 2. 部署步骤

### 2.1 上传项目

将项目上传到服务器，推荐路径 `/home/ubuntu/medical_workers_day/`。

可用 `git clone` 或 `scp`：

```bash
# 如果使用 git
git clone <你的仓库地址> /home/ubuntu/medical_workers_day

# 或 scp（从本地发到服务器）
scp -r /本地路径/medical_workers_day ubuntu@<服务器IP>:/home/ubuntu/
```

### 2.2 修复文件权限

```bash
cd /home/ubuntu/medical_workers_day
sudo chown -R ubuntu:ubuntu .
```

### 2.3 安装依赖

```bash
# 安装服务端依赖
cd server && npm install && cd ..

# 安装客户端依赖
cd client && npm install && cd ..
```

### 2.4 构建前端

```bash
cd client && npm run build && cd ..
```

构建产物在 `client/dist/`，服务端会自动托管此目录。

### 2.5 准备媒体文件

```bash
mkdir -p media/videos media/audio
```

将背景视频放入 `media/videos/`，背景音乐放入 `media/audio/`。

### 2.6 启动服务

```bash
pm2 start ecosystem.config.js
pm2 save
```

### 2.7 设置开机自启

```bash
pm2 startup
# 按提示执行输出的 sudo 命令
pm2 save
```

---

## 3. 启动与停止

### PM2 进程管理

```bash
pm2 status                        # 查看所有进程状态
pm2 start ecosystem.config.js     # 启动
pm2 restart medical-workers-day   # 重启
pm2 stop medical-workers-day      # 停止
pm2 delete medical-workers-day    # 删除进程
```

### 查看日志

```bash
pm2 logs medical-workers-day              # 实时日志
pm2 logs medical-workers-day --lines 50   # 最近 50 行
```

日志文件位置（由 `ecosystem.config.js` 配置）：

```
/home/ubuntu/medical_workers_day/
├── logs/
│   ├── out.log    # 标准输出
│   └── err.log    # 错误输出
```

---

## 4. 日常运维

### 更新代码

```bash
cd /home/ubuntu/medical_workers_day
git pull                        # 拉取最新代码
cd client && npm run build && .. # 重新构建前端
pm2 restart medical-workers-day # 重启服务
```

### 数据库

本项目**无数据库**。所有状态（题目、队伍、分数）保存在服务端内存中。服务重启后数据会丢失，需重新加载题目和配置。

### 端口配置

默认端口 3001，如需修改，编辑 `ecosystem.config.js`：

```js
env: {
  PORT: 3001,  // 改为其他端口
}
```

然后重启：

```bash
pm2 restart medical-workers-day
```

---

## 5. 访问地址与端口

### 直接访问（3001 端口）

```
http://<服务器IP>:3001
```

需要在腾讯云安全组开放 TCP 3001 端口。

### 安全组配置（腾讯云）

登录腾讯云控制台 → 云服务器 → 安全组 → 添加入站规则：

| 协议 | 端口 | 来源 | 策略 |
|------|------|------|------|
| TCP | 3001 | 0.0.0.0/0 | 允许 |

> **注意**：必须配**入站规则**（入方向），不是出站规则。

### 推荐方式：Nginx 反向代理（80 端口）

安装 Nginx：

```bash
sudo apt-get install -y nginx
```

创建配置文件 `/etc/nginx/sites-available/medical`：

```nginx
server {
    listen 80;
    server_name 81.70.175.41;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/medical /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
```

之后可直接访问 `http://<服务器IP>`（不需要端口号）。

---

## 6. 常见问题

### 6.1 Port 3001 被占用

```bash
Error: listen EADDRINUSE: address already in use :::3001
```

说明服务已经在运行，用 `pm2 status` 查看。如需强制释放端口：

```bash
sudo kill -9 $(sudo lsof -t -i:3001)
pm2 start ecosystem.config.js
```

### 6.2 tsx: Permission denied

```bash
sh: 1: tsx: Permission denied
```

修复方式：

```bash
cd /home/ubuntu/medical_workers_day/server
chmod +x node_modules/.bin/tsx
```

### 6.3 网页打不开

排查步骤：

```bash
# 1. 检查服务是否运行
pm2 status

# 2. 本地测试
curl http://localhost:3001/api/media/videos

# 3. 如果有返回，说明服务正常，检查云安全组
# 4. 如果无返回，查看错误日志
pm2 logs medical-workers-day --lines 30
```

### 6.4 服务重启后数据丢失

所有游戏状态（队伍分数、题目进度等）保存在内存中。重启服务后需重新：
1. 在 Admin 页面加载题库
2. 在 Admin 页面配置参赛队伍和轮次

---

## 7. 项目结构说明

```
medical_workers_day/
├── ecosystem.config.js     # PM2 部署配置
├── package.json            # 根 package（仅开发用）
├── .gitignore
│
├── client/                 # 前端（React + Vite）
│   ├── src/
│   │   └── pages/
│   │       ├── StageScreen.tsx   # 大屏展示页
│   │       ├── HostConsole.tsx   # 主持人控制台
│   │       ├── AdminPage.tsx     # 管理后台
│   │       └── MobilePage.tsx    # 手机弹幕页
│   ├── dist/               # 构建产物（服务端自动托管）
│   └── package.json
│
├── server/                 # 后端（Express + Socket.IO）
│   ├── src/
│   │   └── index.ts        # 服务端入口
│   └── package.json
│
├── media/                  # 媒体文件
│   ├── videos/             # 背景视频
│   └── audio/              # 背景音乐
│
└── logs/                   # PM2 日志（自动生成）
```

### 子系统页面

| 地址 | 用途 |
|------|------|
| `/` 或 `/stage` | 大屏展示（主持台、答题、抽签、排名） |
| `/host` | 主持人操控台（抢答判定、调分、抽奖） |
| `/admin` | 管理后台（队伍配置、题库管理、抽签控制） |
| `/mobile` | 手机端弹幕发送 |
