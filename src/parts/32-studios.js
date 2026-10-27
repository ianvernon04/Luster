/* ===== Studio profiles: a real studio's own menu, hours and memberships, for pitching that studio =====
   Opt-in only: a profile opens from its own link (?studio=<id>, or a setup link with the studio's exact name). Everyone
   else, including the public demo, gets the business type's generic menu, so Luster stays a product for any studio.
   A profile holds only what the studio publishes itself. Its team is placeholder people in the studio's real roles and
   skills: the link is public and the demo invents bookings and revenue for every provider, and real people's names don't
   belong next to made-up numbers. For a private pitch, rename them on that device (Settings → Team); nothing leaves it.

   Simply Facials, Baton Rouge (pilot studio #1): https://www.nwluster.com/?studio=simplyfacials
   Services, prices, providers and memberships from their Boulevard booking page; durations from their website and
   membership descriptions; checked October 2026. Durations marked "est" aren't published: confirm with the studio. */
const STUDIOS = {};
STUDIOS.simplyfacials = (() => {
  // what each treatment does to the skin decides who can safely have it
  const SIG = ['sf_sig', 'sf_sculpt', 'sf_stud', 'sf_buff', 'sf_student'];   // the Signature family: microdermabrasion, dermaplaning, a peel
  const HYDRA = ['sf_hydra', 'sf_hydradlx', 'sf_hydraplat'];                  // Hydrafacial peel + dermaplaning included
  const ACNE = ['sf_smooth', 'sf_smoothback'];                                 // Clear Solution acne peel + extractions
  const NEEDLE = ['sf_procell'], DERMA = ['sf_derma'], CRYO_FACE = ['sf_glacier'], CRYO_BODY = ['sf_cryosculpt', 'sf_cryotone'];
  const EXFOL = [...SIG, ...HYDRA, ...ACNE, ...NEEDLE, ...DERMA];
  const services = [
    { id: 'sf_sig', name: 'The Signature Facial', cat: 'facial', dur: 45, price: 125, seedWeight: 5, desc: 'Our 12-step facial: microdermabrasion, dermaplaning, lymphatic massage, a custom mask and a peel. Evens tone and texture and fades dark spots.' },
    { id: 'sf_sculpt', name: 'The Sculpt and Glow', cat: 'facial', dur: 60, price: 175, seedWeight: 3, desc: 'The Signature, enhanced: up to 15 steps with LED, microcurrent and sculpting massage to lift, tone and smooth fine lines. Neck, shoulder, hand and arm massage included.' },
    { id: 'sf_stud', name: 'The Stud (Gentlemen\'s Facial)', cat: 'facial', dur: 60, price: 150, seedFor: 'men', desc: 'A 12-step facial built for men\'s skin and the signs of aging it fights every day.' },
    { id: 'sf_buff', name: 'The Buff & Polish', cat: 'facial', dur: 40, price: 100, seedWeight: 2, desc: 'The in-between facial: a mid-month glow-up that keeps skin hydrated and radiant between monthly facials.' },
    { id: 'sf_sweet', name: 'The Simply Sweet (12 and under)', cat: 'facial', dur: 30, price: 35, desc: 'A gentle facial for young skin, with mild ingredients made for little faces. A parent or guardian signs the intake.', noSeed: true },   // dur est
    { id: 'sf_student', name: 'Student Special (Wednesdays only)', cat: 'facial', dur: 45, price: 99, desc: 'Student pricing on Wednesdays.', noSeed: true },   // dur est
    { id: 'sf_restore', name: 'RESTORE Facial Treatment', cat: 'restore', dur: 60, price: 100, forFlags: ['oncology', 'autoimmune'], desc: 'For medically reactive skin: chemotherapy, radiation, autoimmune conditions or hypersensitivity. Physician-approved, fragrance-free products and oncology-certified estheticians.' },
    { id: 'sf_smooth', name: 'The Smooth Face (acne)', cat: 'acne', dur: 45, price: 125, seedWeight: 2, desc: 'Acne facial with the Clear Solution peel, extractions and targeted spot treatment to clear breakouts and prevent new ones.' },
    { id: 'sf_smoothback', name: 'The Smooth Back (acne)', cat: 'acne', dur: 45, price: 150, desc: 'The Smooth acne treatment for the shoulders and back.' },   // dur est
    { id: 'sf_spot', name: 'Blemish Spot Treatment', cat: 'acne', dur: 15, price: 25, addon: true, desc: 'Targeted treatment for an active breakout.' },
    { id: 'sf_hydra', name: 'Basic Hydrafacial', cat: 'hydra', dur: 45, price: 250, seedWeight: 2, desc: 'Cleanse, exfoliate, extract and hydrate. Dermaplaning included.' },   // dur est
    { id: 'sf_hydradlx', name: 'Deluxe Hydrafacial', cat: 'hydra', dur: 60, price: 275, desc: 'The Basic plus a targeted booster serum and LED light therapy. Dermaplaning included.' },   // dur est
    { id: 'sf_hydraplat', name: 'Platinum Hydrafacial', cat: 'hydra', dur: 75, price: 335, desc: 'The Deluxe plus lymphatic drainage. Dermaplaning included.' },   // dur est
    { id: 'sf_procell', name: 'Procell Microchanneling', cat: 'advanced', dur: 60, price: 350, desc: 'Next-generation microneedling: micro-channels plus stem-cell growth-factor serum for collagen, texture, scars and sun damage, with little downtime. Face, neck and aftercare included.' },
    { id: 'sf_derma', name: 'Dermaplane', cat: 'advanced', dur: 30, price: 60, desc: 'Removes dead skin and peach fuzz for a smooth, makeup-ready finish.' },   // dur est
    { id: 'sf_glacier', name: 'Glacier Facial (cryotherapy)', cat: 'cryo', dur: 45, price: 175, seedWeight: 2, desc: 'ExoSkin cryo facial: sub-zero cooling firms, tightens and calms, with no downtime.' },   // dur est
    { id: 'sf_cryosculpt', name: 'CryoSculpt (body slimming)', cat: 'cryo', dur: 60, price: 250, desc: 'ExoFreeze fat reduction for stubborn areas: abdomen, love handles, thighs and arms.' },   // dur est
    { id: 'sf_cryotone', name: 'CryoTone (toning & cellulite)', cat: 'cryo', dur: 45, price: 235, desc: 'Cryotherapy plus muscle stimulation to firm skin and smooth the look of cellulite.' },   // dur est
  ];
  const except = (...ids) => services.map((s) => s.id).filter((id) => !ids.includes(id));
  return {
    id: 'simplyfacials', template: 'facial', name: 'Simply Facials', phone: '(225) 955-3695', address: '4353 Perkins Rd, Ste 12-D, Baton Rouge, LA 70808',
    hours: { 0: null, 1: [480, 1080], 2: [480, 1080], 3: [480, 1080], 4: [480, 1080], 5: [480, 1080], 6: [540, 840] },   // Mon–Fri 8–6, Sat 9–2
    categories: [{ id: 'facial', label: 'Facials' }, { id: 'restore', label: 'RESTORE · oncology & sensitive skin' }, { id: 'acne', label: 'The Smooth · acne' }, { id: 'hydra', label: 'Hydrafacial' }, { id: 'advanced', label: 'Microchanneling & dermaplaning' }, { id: 'cryo', label: 'Cryotherapy' }],
    services,
    // three bookable estheticians, as on their booking page: one does everything, one skips dermaplaning and body cryo, one skips dermaplaning
    staff: [
      { id: 's1', name: 'Danielle Boudreaux', role: 'Licensed Esthetician', color: '#1E5C68', bookable: true, days: { 2: [480, 960], 3: [480, 960], 4: [480, 960], 5: [480, 960], 6: [540, 840] }, bio: 'Oncology-certified. Procell, Hydrafacial, cryotherapy and dermaplaning.', bias: ['facial', 'facial', 'facial', 'advanced', 'hydra', 'cryo', 'facial', 'facial'] },
      { id: 's2', name: 'Brianna Thibodeaux', role: 'Licensed Esthetician', color: '#6250d6', bookable: true, days: { 1: [480, 1020], 2: [480, 1020], 3: [480, 1020], 4: [480, 1020], 5: [480, 1020] }, bio: 'Oncology-certified. Signature, Sculpt and Glow and RESTORE.', skills: except('sf_derma', 'sf_cryosculpt', 'sf_cryotone'), bias: ['facial', 'facial', 'facial', 'restore', 'acne', 'hydra', 'facial', 'facial'] },
      { id: 's3', name: 'Kayla Nguyen', role: 'Licensed Esthetician', color: '#B23A30', bookable: true, days: { 1: [600, 1080], 2: [600, 1080], 4: [600, 1080], 5: [600, 1080], 6: [540, 840] }, bio: 'Oncology-certified. Acne, cryotherapy and Hydrafacial.', skills: except('sf_derma'), bias: ['facial', 'facial', 'restore', 'acne', 'facial', 'cryo', 'hydra', 'facial'] },
      { id: 's4', name: 'Jordan Pierce', role: 'Studio Manager', color: '#566068', bookable: false, days: {}, bio: '' },
    ],
    plans: [
      { id: 'pl_essential', name: 'Essential Treatment Membership', price: 99, perks: ['One Signature Facial every month'], includes: ['sf_sig'], retailDiscount: 0 },
      { id: 'pl_enhanced', name: 'Enhanced Treatment Membership', price: 250, perks: ['One Sculpt and Glow every month', 'One Buff & Polish every month', '10% off products'], includes: ['sf_sculpt', 'sf_buff'], retailDiscount: 0.10 },
      { id: 'pl_sculpt', name: 'The Sculpt and Glow Membership', price: 159, perks: ['One Sculpt and Glow every month'], includes: ['sf_sculpt'], retailDiscount: 0 },
      { id: 'pl_clear', name: 'The Clear Solution Acne Membership', price: 150, perks: ['One Smooth acne treatment every month', 'Two Blemish Spot Treatments every month', '10% off products'], includes: ['sf_smooth', 'sf_spot'], retailDiscount: 0.10 },
    ],
    consents: [
      consent('cryo', 'Cryotherapy Consent', 'Cryotherapy warms the treatment area briefly, then cools it to sub-zero temperatures. On the face it tightens and calms the skin; on the body it breaks down fat cells, which your body clears over the following weeks. CryoTone also uses gentle electrical muscle stimulation. Expect redness, tingling, numbness or tenderness in the area for a few hours to a few days. Rare effects include bruising, temporary skin discoloration, cold injury to the skin and, very rarely after fat freezing, a firm enlargement of the treated fat. It isn\'t done during pregnancy, on numb or broken skin, or for anyone with cold hives, Raynaud\'s, cryoglobulinemia or another cold-related blood disorder; a pacemaker or other implanted device rules out the muscle stimulation.', ['I understand the area may be red, numb, tingly or tender for a few hours to days, and that body results build over several weeks.', 'I am not pregnant, and I don\'t have cold hives, Raynaud\'s, cryoglobulinemia or another cold-related condition, numbness in the area, or a pacemaker or other implanted device.', 'I will tell my provider right away if anything feels painfully cold or burning during the treatment.']),
    ],
    consentFor: { sf_derma: 'dermaplaning', sf_procell: 'microneedling', sf_glacier: 'cryo', sf_cryosculpt: 'cryo', sf_cryotone: 'cryo' },
    // their protocol: RESTORE is the oncology and autoimmune path; prep rule from their FAQ (retinol off 3–5 days before)
    contra: [
      { flag: 'oncology', services: [...SIG, ...HYDRA, ...ACNE, ...DERMA], cats: [], level: 'bad', text: 'Oncology client — this facial exfoliates (dermaplaning, microdermabrasion or a peel). During treatment and recovery book the RESTORE Facial instead; anything else needs the oncologist\'s written clearance.' },
      { flag: 'oncology', services: NEEDLE, cats: [], level: 'bad', text: 'Oncology client — no microchanneling during treatment or recovery: open skin and infection risk. Book RESTORE; anything else needs the oncologist\'s written clearance.' },
      { flag: 'oncology', services: [...CRYO_FACE, ...CRYO_BODY], cats: [], level: 'bad', text: 'Oncology client — no cryotherapy during treatment or recovery (sensitivity, numbness, circulation). Book RESTORE; anything else needs the oncologist\'s written clearance.' },
      { flag: 'autoimmune', services: EXFOL, cats: [], level: 'warn', text: 'Autoimmune condition — reactive, slow-healing skin. RESTORE is the safe default; otherwise patch test and skip the peel.' },
      { flag: 'pregnant', services: [...NEEDLE, ...CRYO_BODY, 'sf_sculpt'], cats: [], level: 'bad', text: 'Pregnant or nursing — no microchanneling, body cryotherapy, microcurrent or LED. Offer the Signature or Buff & Polish, adapted for pregnancy.' },
      { flag: 'pregnant', services: [...SIG.filter((id) => id !== 'sf_sculpt'), ...HYDRA, ...ACNE, ...CRYO_FACE], cats: [], level: 'warn', text: 'Pregnant or nursing — adapt it: no salicylic, retinol or strong peel; positioning for comfort.' },
      { flag: 'accutane', services: EXFOL, cats: [], level: 'bad', text: 'Accutane within 6 months — skin lifts and scars. No dermaplaning, microdermabrasion, peels or needling (the Signature family, Hydrafacials, the Smooth and Procell all include them).' },
      { flag: 'retinoid', services: EXFOL, cats: [], level: 'warn', text: 'Retinoid user — studio prep rule: retinol off 3–5 days before. Confirm, or skip the dermaplaning and peel steps.' },
      { flag: 'hsv', services: [...SIG, ...HYDRA, 'sf_smooth', ...NEEDLE, ...DERMA], cats: [], level: 'warn', text: 'Cold-sore history — peels, dermaplaning and needling can trigger an outbreak. Antiviral 2 days before, or avoid the lip area.' },
      { flag: 'botox', services: ['sf_sig', 'sf_sculpt', 'sf_stud', 'sf_hydraplat', 'sf_glacier'], cats: [], level: 'warn', text: 'Botox or filler within 14 days — no facial massage, microcurrent, lymphatic work or cryo over the treated areas.' },
      { flag: 'pacemaker', services: ['sf_sculpt', 'sf_cryotone', 'sf_hydradlx', 'sf_hydraplat'], cats: [], level: 'bad', text: 'Pacemaker or seizure history — no microcurrent, muscle stimulation or LED in this treatment.' },
      { flag: 'keloid', services: NEEDLE, cats: [], level: 'bad', text: 'Keloid-prone — no microchanneling.' },
      { flag: 'thinners', services: [...NEEDLE, ...DERMA, ...ACNE], cats: [], level: 'warn', text: 'Blood thinners — bruising and bleeding risk. Light extractions only; check before needling or dermaplaning.' },
      { flag: 'diabetes', services: [...NEEDLE, ...ACNE, ...CRYO_BODY], cats: [], level: 'warn', text: 'Diabetes — slow healing and reduced sensation. Gentle extractions; check sensation before cryotherapy (cold-injury risk).' },
      { flag: 'cold', services: [...CRYO_FACE, ...CRYO_BODY], cats: [], level: 'bad', text: 'Cold sensitivity (Raynaud’s, cold hives, cryoglobulinemia) — no cryotherapy.' },
      { flag: 'dvt', services: CRYO_BODY, cats: [], level: 'warn', text: 'Blood clot history — physician clearance before body cryotherapy, especially on the legs.' },
      { flag: 'surgery', services: [...NEEDLE, ...CRYO_BODY], cats: [], level: 'warn', text: 'Recent surgery — stay off the surgical area; physician clearance before body treatments.' },
    ],
    copy: { bookingIntro: 'Pick what your skin needs. New here? Start with The Signature Facial.', rebook: 'it\'s been about a month since your last facial — your skin is due.', birthdayPerk: 'a little extra glow', oncologyProtocol: 'Book RESTORE. Light pressure, no heat or steam, avoid the lymph-node side, nothing exfoliating during treatment, fragrance-free products, shorter sessions if fatigued.' },
    // how the demo history is generated for this studio
    seed: {
      addonWith: ['acne'],
      gaps: { facial: 28, restore: 28, acne: 28, hydra: 28, advanced: 35, cryo: 14 },
      flagPool: [['oncology', 0.06], ['autoimmune', 0.03], ['retinoid', 0.035], ['diabetes', 0.03], ['pregnant', 0.02], ['botox', 0.02], ['hsv', 0.02], ['accutane', 0.012], ['thinners', 0.008], ['keloid', 0.008], ['cold', 0.008], ['pacemaker', 0.004]],
      notes: {
        restore: ['RESTORE. Three weeks post-chemo, skin very dry and tight. Fragrance-free cleanse, no steam, no exfoliation. Barrier mask, light massage, avoided the port side. Client dozed off. Recheck clearance letter before next visit.', 'Radiation site (chest) avoided entirely; face and scalp massage only. Skin calmer than last month. Sent home with a Restore line sample.', 'Autoimmune flare this week. Kept it gentle: cool compresses, oat mask, no actives. Redness down by the end of the session.', 'Finished treatment two months ago and tolerance is improving. Still no exfoliation per her oncologist. Hydration focus; next RESTORE in 4 weeks.'],
        acne: ['Smooth Face: Clear Solution peel, extractions on chin and nose, spot treatment on 3 active lesions. Home care: gentle cleanser AM/PM, spot gel at night.', 'Breakouts down about half since the first Smooth visit. Peel on 4 min. Teen client; mom in the room, went over the home routine together.', 'Smooth Back: Clear Solution peel across shoulders and upper back, extractions x9. Loose cotton tops after workouts.', 'Hormonal flare along the jaw. Light extractions today, spot treatment x4. Rebook in 4 weeks; talked through the Clear Solution membership.'],
        hydra: ['Basic Hydrafacial with dermaplaning. Good extraction on the nose. Skin plump and even afterward.', 'Deluxe Hydrafacial: brightening booster, LED finish. Client has an event Saturday — glowing.', 'Platinum Hydrafacial: lymphatic drainage first, puffiness noticeably down. Dermaplaning tolerated well, no nicks.'],
        cryo: ['Glacier Facial. Redness calmed, pores visibly tighter. Client loved the cold finish.', 'CryoSculpt, abdomen, 2 zones. Sensation checked first: normal. Mild redness, gone in 20 min. Next session in 2 weeks; results build over 6–8 weeks.', 'CryoTone, thighs. Muscle stimulation at level 4, comfortable. Reminded her to drink lots of water for 48 hours.'],
        plan: ['Plan: Sculpt and Glow monthly plus a Buff & Polish mid-month (Enhanced membership) for 3 months, then reassess fine lines.', 'Plan: Procell series of 3, 4–6 weeks apart, then quarterly maintenance. Photos at each visit.', 'Goal before {event}: Signature monthly, Hydrafacial the week before. Daily SPF non-negotiable.', 'Acne plan: Smooth Face monthly plus 2 spot treatments (Clear Solution membership). Home care reviewed; recheck in 8 weeks.', 'Oncology plan: RESTORE every 4 weeks during treatment. Nothing exfoliating until the oncologist clears it.'],
      },
    },
  };
})();
TEMPLATES.facial.contra.push(...STUDIOS.simplyfacials.contra);   // safety rules follow the services into a live business; inert for other menus (their service ids differ)
