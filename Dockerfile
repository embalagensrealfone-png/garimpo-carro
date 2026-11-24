# Site estático: nginx servindo a pasta site/. Sem servidor de aplicação, nada para cair.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
