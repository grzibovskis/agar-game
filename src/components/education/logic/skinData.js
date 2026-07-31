// Skin definitions.
// Place your images in  public/skins/  using the filenames below.
// The `gradient` is shown as a fallback colour until the image loads.
export const SKINS = [
  { id: "background1", src: "/skins/background1.jpg", name: "Aurora",  gradient: "linear-gradient(135deg,#a855f7,#06b6d4)", unlockScore: 300  },
  { id: "background2", src: "/skins/background2.jpg", name: "Ocean",   gradient: "linear-gradient(135deg,#0ea5e9,#10b981)", unlockScore: 500  },
  { id: "background3", src: "/skins/background3.jpg", name: "Fire",    gradient: "linear-gradient(135deg,#ef4444,#f97316)", unlockScore: 700  },
  { id: "background4", src: "/skins/background4.jpg", name: "Galaxy",  gradient: "linear-gradient(135deg,#4f46e5,#1e1b4b)", unlockScore: 800  },
  { id: "background5", src: "/skins/background5.jpg", name: "Forest",  gradient: "linear-gradient(135deg,#16a34a,#14532d)", unlockScore: 900  },
  { id: "background6", src: "/skins/background6.jpg", name: "Sunset",  gradient: "linear-gradient(135deg,#f59e0b,#ec4899)", unlockScore: 1000 },
  { id: "background7", src: "/skins/background7.jpg", name: "Arctic",  gradient: "linear-gradient(135deg,#bae6fd,#93c5fd)", unlockScore: 1200 },
  { id: "background8", src: "/skins/background8.jpg", name: "Lava",    gradient: "linear-gradient(135deg,#dc2626,#7c2d12)", unlockScore: 1500 },
  { id: "background9", src: "/skins/background9.jpg", name: "Nebula",  gradient: "linear-gradient(135deg,#7e22ce,#4f46e5)", unlockScore: 2000 },
];

// Score needed to open the skins panel (first skin threshold)
export const SKIN_UNLOCK_SCORE = 300;

export function getSkinById(id) {
  return SKINS.find((s) => s.id === id) ?? null;
}
