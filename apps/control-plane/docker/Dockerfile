# 模拟 DSH Web 实例镜像（骨架冒烟用）：/healthz + 简单页面
# 生产：真实 company-dsh-web 镜像 = dsh-source 构建产物 + 02 工单公司 profile + 注入 env
FROM busybox:latest
RUN mkdir -p /www
COPY www/index.html /www/index.html
COPY www/healthz /www/healthz
EXPOSE 3000
CMD ["httpd", "-f", "-p", "3000", "-h", "/www"]
