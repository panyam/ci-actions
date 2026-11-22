# A local image for kind-ingress's test. The job builds it, so kind has to load it.
FROM busybox:1.37
RUN mkdir /www && echo 'hello from kind-ingress' > /www/index.html
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]
