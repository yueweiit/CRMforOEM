# OEM CRM /oemcrm 子路径部署说明

本文档用于 `https://lemos-case.com/oemcrm/` 部署方式。

## 前端环境变量

```env
VITE_BASE_PATH=/oemcrm
VITE_ALLOWED_HOSTS=lemos-case.com,www.lemos-case.com
```

不要写成 `/oemcrm/` 也可以，前端会自动规范化；但推荐统一写 `/oemcrm`。

## Nginx 推荐配置

关键点：

- `/oemcrm/` 代理到 Vite dev server 时不要在 `proxy_pass` 后面加路径 `/`，要保留原始 URI。
- `/oemcrm/api/` 代理到 Nest API 时可以剥掉 `/oemcrm/api/` 前缀，让后端继续接收 `/auth/login`、`/customers` 等原始 API 路由。
- 建议补一个 `/oemcrm` 到 `/oemcrm/` 的重定向，避免无尾斜杠访问资源路径异常。

```nginx
location = /oemcrm {
    return 301 /oemcrm/;
}

location /oemcrm/api/ {
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_pass http://127.0.0.1:4100/;
}

location /oemcrm/ {
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_pass http://127.0.0.1:5174;
}
```

## 常见错误

### Vite Blocked request

确认 `VITE_ALLOWED_HOSTS` 包含访问域名，然后重启 web dev server。

### React Router 404

确认 `VITE_BASE_PATH=/oemcrm`，并重新构建/重启前端。

### ERR_TOO_MANY_REDIRECTS

检查 `/oemcrm/` 的 `proxy_pass` 是否写成了：

```nginx
proxy_pass http://127.0.0.1:5174/;
```

这个写法会剥掉 `/oemcrm/` 前缀，容易和 Vite base 互相重定向。应改为：

```nginx
proxy_pass http://127.0.0.1:5174;
```
