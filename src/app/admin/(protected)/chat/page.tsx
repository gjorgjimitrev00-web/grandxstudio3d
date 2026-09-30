import { requireAdminPage } from '@/lib/admin-access';
import { AdminHeading } from '@/components/admin-shared';
import { ChatInbox } from '@/components/chat-inbox';

export default async function ChatPage() {
  await requireAdminPage();
  return (
    <>
      <AdminHeading title="Live chat" sub="Real conversations, directly from your storefront." />
      <ChatInbox />
    </>
  );
}
