import { db } from './db';
export const assistantModel = () => process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4.1-mini';
export const assistantConfigured = () => !!process.env.OPENAI_API_KEY?.trim();
export async function assistantSettings() {
  const setting = await db.storeSetting.findUnique({ where: { key: 'chatAiEnabled' } });
  return {
    aiConfigured: assistantConfigured(),
    aiSettingEnabled: setting?.value === 'true',
    aiModel: assistantModel(),
  };
}
