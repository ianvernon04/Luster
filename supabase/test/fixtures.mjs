// A small live studio for end-to-end tests.
import { as } from './harness.mjs';

export const U = { owner: '11111111-1111-4111-8111-111111111111' };
export const S = { dani: 'aaaaaaa1-0000-4000-8000-000000000001', bri: 'aaaaaaa1-0000-4000-8000-000000000002' };
export const V = { sig: 'bbbbbbb1-0000-4000-8000-000000000001', exp: 'bbbbbbb1-0000-4000-8000-000000000002', wax: 'bbbbbbb1-0000-4000-8000-000000000003', peel: 'bbbbbbb1-0000-4000-8000-000000000004' };
const allWeek = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start_min: 540, end_min: 1020 }));   // every day 9–5, so tests never land on a closed day
export const catalog = {
  categories: [{ key: 'facial', label: 'Facials' }, { key: 'peel', label: 'Peels' }, { key: 'wax', label: 'Waxing' }],
  services: [
    { id: V.sig, key: 'sv_sig', category: 'facial', name: 'Signature Facial', description: 'Deep cleanse, extractions, mask.', duration_min: 60, price_cents: 9500, sort: 1 },
    { id: V.exp, key: 'sv_express', category: 'facial', name: 'Express Facial', duration_min: 30, price_cents: 5500, sort: 2 },
    { id: V.peel, key: 'sv_peel', category: 'peel', name: 'Lactic Peel', duration_min: 45, price_cents: 11000, sort: 3 },
    { id: V.wax, key: 'sv_brow', category: 'wax', name: 'Brow Wax', duration_min: 15, price_cents: 2000, online: false, sort: 4 },
  ],
  staff: [
    { id: S.dani, key: 's1', name: 'Danielle Boudreaux', title: 'Lead Esthetician', color: '#1E5C68', hours: allWeek, services: [V.sig, V.exp, V.peel, V.wax], sort: 1 },
    { id: S.bri, key: 's2', name: 'Brianna Thibodeaux', title: 'Esthetician', color: '#6250d6', hours: allWeek, services: [V.sig, V.exp], sort: 2 },
  ],
};
export async function seedStudio(db, { slug = 'simply-test', name = 'Simply Facials Test', live = true } = {}) {
  await db.exec(`insert into auth.users (id, email) values ('${U.owner}', 'owner@example.com') on conflict do nothing`);
  const biz = (await as(db, U.owner, `select public.create_business($1, $2, 'facial', 'America/Chicago', '(225) 555-0100', null, '4353 Perkins Rd, Baton Rouge, LA') as id`, [name, slug])).rows[0].id;
  await as(db, U.owner, `select public.sync_catalog($1, $2::jsonb)`, [biz, JSON.stringify(catalog)]);
  if (live) await as(db, U.owner, `update businesses set is_live = true where id = $1`, [biz]);
  return biz;
}
