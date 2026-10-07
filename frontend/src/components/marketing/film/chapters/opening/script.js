/* 00 — the opening. Plain JS: read by the site, the voice recorder and the
   film's checks. */
export default {
  key: 'opening',
  title: 'Maks Ops',
  kicker: 'One business, every operation connected',
  surface: 'title',
  duration: 8000,
  poster: 6500,         // the frame behind the play buttons: the mark
  beats: [
    { key: 'line', at: 0, voice: 'One business. Every operation, connected.' },
    { key: 'mark', at: 4200, voice: 'This is Maks Ops.' },
  ],
  sr: 'Opening: one business, every operation connected. Maks Ops.',
  seo: {
    body: 'A fabrication business, start to finish: a customer finds a product in your catalogue, and the same record carries through quotation, order, purchasing, goods receipt, production, dispatch and the tax invoice.',
  },
  truth: [],
};
