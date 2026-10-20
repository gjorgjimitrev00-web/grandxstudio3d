import Shop, { generateMetadata as shopMetadata } from '../shop/page';

const offerParams = () => Promise.resolve({ offer: 'black-friday' });
export async function generateMetadata() {
  return shopMetadata({ searchParams: offerParams() });
}
export default async function BlackFridayPage() {
  return Shop({ searchParams: offerParams() });
}
