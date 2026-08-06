// Skin definitions.
// Place your images in  public/skins/  using the filenames below.
// The `gradient` is shown as a fallback colour until the image loads.
export const SKINS = [
  { id: "background1", src: "/skins/background1.jpg", name: "Sharky",      gradient: "linear-gradient(135deg,#0ea5e9,#22d3ee)", unlockScore: 200  },
  { id: "background2", src: "/skins/background2.jpg", name: "Bitcoin",     gradient: "linear-gradient(135deg,#f59e0b,#fbbf24)", unlockScore: 400  },
  { id: "background3", src: "/skins/background3.jpg", name: "Alien",       gradient: "linear-gradient(135deg,#10b981,#84cc16)", unlockScore: 600  },
  { id: "background4", src: "/skins/background4.jpg", name: "Cat",         gradient: "linear-gradient(135deg,#f97316,#fb7185)", unlockScore: 800  },
  { id: "background5", src: "/skins/background5.jpg", name: "Tank",        gradient: "linear-gradient(135deg,#6b7280,#374151)", unlockScore: 1000 },
  { id: "background6", src: "/skins/background6.jpg", name: "Fish",        gradient: "linear-gradient(135deg,#2563eb,#06b6d4)", unlockScore: 1200 },
  { id: "background7", src: "/skins/background7.jpg", name: "Sandy",       gradient: "linear-gradient(135deg,#fcd34d,#fb923c)", unlockScore: 1400 },
  { id: "background8", src: "/skins/background8.jpg", name: "Ghost",       gradient: "linear-gradient(135deg,#94a3b8,#cbd5e1)", unlockScore: 1700 },
  { id: "background9", src: "/skins/background9.jpg", name: "Stock",       gradient: "linear-gradient(135deg,#16a34a,#14532d)", unlockScore: 2000 },
  { id: "background10", src: "/skins/background10.jpg", name: "Whale",     gradient: "linear-gradient(135deg,#1d4ed8,#312e81)", unlockScore: 2300 },
  { id: "background11", src: "/skins/background11.jpg", name: "Winston",   gradient: "linear-gradient(135deg,#7c3aed,#4338ca)", unlockScore: 2600 },
  { id: "background12", src: "/skins/background12.jpg", name: "Teletubbies", gradient: "linear-gradient(135deg,#f43f5e,#ec4899)", unlockScore: 3000 },
  { id: "background13", src: "/skins/background13.jpg", name: "Napoleon",  gradient: "linear-gradient(135deg,#b45309,#78350f)", unlockScore: 4000 },
  { id: "background14", src: "/skins/background14.jpg", name: "Moon",      gradient: "linear-gradient(135deg,#e2e8f0,#94a3b8)", unlockScore: 5000 },
];

// Score needed to open the skins panel (first skin threshold)
export const SKIN_UNLOCK_SCORE = 200;

export function getSkinById(id) {
  return SKINS.find((s) => s.id === id) ?? null;
}
