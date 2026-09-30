import { cache } from 'react';
import { db } from './db';
export const defaults: Record<string, string> = {
  storeName: 'GrandXStudio',
  tagline: 'BRINGING IDEAS TO LIFE',
  email: '',
  phone: '',
  address: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  currency: 'MKD',
  chatEnabled: 'true',
  logo: '',
  about:
    'GrandXStudio е студио за 3D печатење во Северна Македонија. Создаваме функционални додатоци, оригинални дизајни и персонализирани предмети — слој по слој, со внимание кон секој детал.',
  terms:
    'ШАБЛОН — потребна е правна проверка пред објавување. Внесете ги податоците за трговецот, условите за нарачување и правата на потрошувачите.',
  privacy:
    'ШАБЛОН — потребна е правна проверка. Опишете го контролорот на податоци, целите на обработка, роковите на чување и правата на корисниците.',
  shipping:
    'ШАБЛОН — потребна е проверка. Дефинирајте го курирот, роковите за производство и достава, цената и условите за подигнување.',
  returns:
    'ШАБЛОН — потребна е правна проверка. Дефинирајте ја постапката за враќање и рекламации во согласност со применливите правила.',
};
export const getSettings = cache(async () => {
  if (!process.env.DATABASE_URL) return defaults;
  const rows = await db.storeSetting.findMany();
  return { ...defaults, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
});
