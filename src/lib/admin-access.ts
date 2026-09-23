import { redirect } from 'next/navigation';
import { currentUser } from './security';
export async function requireAdminPage() {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') redirect('/admin/login');
  return user;
}
