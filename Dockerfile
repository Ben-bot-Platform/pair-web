# انتخاب تصویر پایه Node.js
FROM node:18-slim

# تنظیم پوشه کاری در داخل کانتینر
WORKDIR /usr/src/app

# کپی کردن فایل‌های package.json و package-lock.json (اگر وجود دارد)
COPY package*.json ./

# نصب وابستگی‌ها
RUN npm install

# کپی کردن سایر فایل‌های پروژه به داخل کانتینر
COPY . .

# تنظیم متغیر محیطی برای پورت در Render (Render پورت را به طور خودکار به محیط کانتینر می‌دهد)
ENV PORT 10000

# پورت قابل دسترسی برای کانتینر
EXPOSE 10000

# دستور شروع سرور
CMD ["npm", "start"]
